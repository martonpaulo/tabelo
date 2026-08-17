import { create } from "zustand";
import type { ClipboardPayload } from "@/clipboard/parse";
import { cellTextAt } from "@/core/cell-value";
import {
	createEmptyDocument,
	isDocumentBlank,
	reconcileDocument,
} from "@/core/document";
import {
	clearCells,
	deleteColumns,
	deleteRows,
	duplicateColumns,
	duplicateRows,
	fillRange,
	insertColumns,
	insertRows,
	moveColumns,
	moveRows,
	pasteMatrix,
	setAlignment,
	setCell,
	setHeader,
} from "@/core/operations";
import {
	activeRange,
	type CellPosition,
	type CellRect,
	clampSelection,
	createSelection,
	extendActiveRange,
	type GridSelection,
	isContiguous,
	moveFocusKeepingRegions,
	rectDataRows,
	type SelectionMode,
	type SelectionMoveRefusal,
	selectedAxis,
	selectionColumns,
	selectionCoversHeader,
	selectionDataRows,
	selectionFillRefusal,
	selectionMoveRefusal,
	selectionRect,
	selectionRects,
	structureDeletionGuard,
	toggleSelectionRegion,
	translateSelection,
} from "@/core/selection";
import type { Alignment, ColumnId, TableDocument } from "@/core/types";
import { canSerialize } from "@/formats";
import type {
	CodecId,
	OutputOptionId,
	OutputOptions,
	ParseIssue,
	PreconditionFailure,
} from "@/formats/types";
import { defaultOutputOptions } from "@/formats/types";
import {
	createImportedDocument,
	type ImportError,
	type PreparedImport,
	prepareImport,
	tableShapeLimitError,
} from "@/import/prepare";
import {
	loadState,
	preserveUnreadableAndSave,
	type SaveOutcome,
	type SavePayload,
	saveState,
} from "@/persistence/storage";
import {
	conditionNoticeIds,
	type NoticeRequest,
	queueNotice,
	removeNotice,
	type TransientNotice,
} from "@/state/notice-queue";
import { getView } from "@/views/registry";
import type { ViewId } from "@/views/types";
import { clampColumnWidth } from "@/workspace/column-width";
import {
	applyLayout,
	createDefaultWorkspace,
	firstPaneId,
	type LayoutId,
	movePane as moveWorkspacePane,
	paneCount,
	type SplitOption,
	smallerLayout,
	splitOptions,
	type Workspace,
} from "@/workspace/layout";
import { clampPaneZoom } from "@/workspace/zoom";

// How many steps the document timeline keeps. Deep enough to cover a working
// session, bounded so a long session cannot grow without limit.
const HISTORY_LIMIT = 200;

// "Nothing has been copied." One shared value rather than a fresh array each
// time, so clearing a mark that was already clear leaves state referentially
// identical and nothing downstream sees a change that did not happen.
const NO_COPIED_RANGES: readonly CellRect[] = [];

// Syntax errors get a short grace period so a transient broken delimiter never
// flashes feedback while the user is still completing the transaction.
const INVALID_GRACE_MS = 300;

export type DraftStatus = "clean" | "invalid-grace" | "invalid";
export type StructureDeletionRefusal =
	| "last-row"
	| "last-column"
	| "header-row";
// Why a paste was refused. Like the refusal above, the store names the reason
// and the interface owns the words for it.
export type PasteRefusal = "single-area";

// The exact pane and format holding an editor buffer. A clean buffer has
// already committed its meaning to the document but stays here so
// synchronization never rewrites the user's formatting, cursor, or history.
export interface Draft {
	readonly paneId: string;
	readonly viewId: ViewId;
	readonly text: string;
	readonly status: DraftStatus;
	readonly issues: readonly ParseIssue[];
	readonly warnings: readonly ParseIssue[];
}

// A pane change the user asked for that would destroy text the document has
// not read back yet. Modelled as one explicit state rather than a flag per
// action, so there is never a question of which confirmation is outstanding.
export type PendingPaneAction =
	| { readonly kind: "view"; readonly paneId: string; readonly view: ViewId }
	| { readonly kind: "close"; readonly paneId: string };

export interface HistoryEntry {
	readonly document: TableDocument;
	// A draft that was still uncommitted when this entry was superseded.
	// Restoring it is what keeps a grid edit from destroying pending text.
	readonly draft: Draft | null;
}

export interface PendingImport {
	readonly prepared: PreparedImport;
}

export interface StatusAnnouncement {
	readonly id: string;
	readonly message: string;
}

export type StorageIssue =
	| { readonly kind: "unavailable" }
	| { readonly kind: "quota" }
	| {
			readonly kind: "unreadable";
			readonly raw: string;
			readonly replacementFailure?: "unavailable" | "quota";
	  };

export interface TabeloState {
	document: TableDocument;
	workspace: Workspace;

	draft: Draft | null;
	// Whether this browser visit has held a valid document with any content.
	// Session-only and monotonic until New table completes: emptying, undo, and
	// redo never make previously held work safe to replace without confirmation.
	hasHeldContent: boolean;

	past: readonly HistoryEntry[];
	future: readonly HistoryEntry[];

	selection: GridSelection;
	editing: CellPosition | null;
	editingSeed: string | null;
	editingHeader: number | null;
	// The areas the clipboard was last filled from, so the grid can keep showing
	// what a paste would carry after the selection has moved to the destination.
	// Stored rather than derived precisely because the selection leaves it
	// behind, and snapshotted once at copy time from the selection's own
	// coordinate space, header row included.
	//
	// A list, because a copy takes everything the selection covers and that may
	// be several separate areas. Empty means nothing has been copied; marking
	// only the active area would show one column while the clipboard held two.
	//
	// Transient by construction: it is never a history step, never persisted,
	// and never document state. A copy is not an edit.
	copiedRanges: readonly CellRect[];

	storageIssue: StorageIssue | null;
	// Messages waiting to be read, oldest first. A queue rather than one slot:
	// nothing a producer says may be destroyed by whatever comes after it.
	notices: readonly TransientNotice[];
	inputError: ImportError | null;
	// Polite text with no notice behind it: the grid's column width, the source
	// editor's occurrence count. One slot rather than a queue, because the most
	// recent one is the only one worth speaking, and it is shared by every
	// producer so no second live region is ever needed.
	politeStatus: StatusAnnouncement | null;
	// A document replacement whose format does not identify row 1. It remains
	// outside the document and history until the user answers the question.
	pendingImport: PendingImport | null;
	pendingPaneAction: PendingPaneAction | null;
	// What the next download should produce. Deliberately session-only: it
	// changes the shape of the exported file, and a silently remembered "no
	// header row" would surprise someone weeks later. Never persisted, never
	// document state, never a history step. See docs/adr/0005.
	outputOptions: Required<OutputOptions>;
	hydrate: () => void;
	replaceUnreadableStorage: () => boolean;
	applyDocument: (next: TableDocument) => void;

	setDraft: (paneId: string, viewId: ViewId, text: string) => void;
	discardDraft: () => void;

	setLayout: (layout: LayoutId) => void;
	setPaneView: (paneId: string, view: ViewId) => void;
	addPaneBySplit: (option: SplitOption, viewId: ViewId) => void;
	closePane: (paneId: string) => void;
	movePane: (paneId: string, destinationPaneId: string) => boolean;
	confirmPaneAction: () => void;
	setActivePane: (paneId: string) => void;
	setOutputOption: (id: OutputOptionId, value: boolean) => void;
	setPaneZoom: (paneId: string, zoom: number) => void;
	setPaneWrap: (paneId: string, wrap: boolean) => void;
	toggleColumnWrap: (columnId: string) => void;
	setColumnRatio: (ratio: number) => void;
	setRowRatio: (ratio: number) => void;

	undo: () => void;
	redo: () => void;

	setSelection: (selection: GridSelection) => void;
	selectCell: (position: CellPosition, mode?: SelectionMode) => void;
	extendSelection: (position: CellPosition) => void;
	// The modifier gesture: add this region to the selection, or take it away
	// when it is already part of one.
	toggleSelectionRegion: (position: CellPosition, mode?: SelectionMode) => void;
	moveFocusKeepingRegions: (position: CellPosition) => void;
	setEditing: (position: CellPosition | null, seed?: string) => void;
	setEditingHeader: (index: number | null, seed?: string) => void;
	markCopiedRanges: () => void;
	clearCopiedRanges: () => void;

	editCell: (row: number, column: number, value: string) => void;
	editHeader: (column: number, value: string) => void;
	setColumnAlignment: (column: number, align: Alignment) => void;
	resizeColumn: (
		column: number,
		width: number | undefined,
		scope?: "selection" | "column",
	) => void;

	addRowAbove: () => void;
	addRowBelow: () => void;
	removeSelectedRows: () => void;
	duplicateSelectedRows: () => void;
	moveSelectedRow: (offset: number) => SelectionMoveRefusal | null;

	addColumnLeft: () => void;
	addColumnRight: () => void;
	removeSelectedColumns: () => void;
	duplicateSelectedColumns: () => void;
	moveSelectedColumn: (offset: number) => SelectionMoveRefusal | null;
	fillSelection: (target: CellRect) => number;

	clearSelection: () => void;
	deleteSelectedStructure: () => StructureDeletionRefusal | null;
	selectedMatrix: () => string[][];
	pasteClipboard: (payload: ClipboardPayload) => PasteRefusal | null;
	importText: (text: string, format?: CodecId) => void;
	reportInputError: (error: ImportError) => void;
	answerPendingImport: (headerRow: boolean) => void;
	cancelPendingImport: () => void;
	resetDocument: () => void;
	dismissNotice: (id: string) => void;
	pushNotice: (request: NoticeRequest) => void;
	announceStatus: (message: string) => void;
}

let invalidTimer: ReturnType<typeof setTimeout> | null = null;
let statusSequence = 0;

function snapshotOf(state: TabeloState): HistoryEntry {
	const draft =
		state.draft?.status === "invalid-grace"
			? { ...state.draft, status: "invalid" as const }
			: state.draft;
	return { document: state.document, draft };
}

function clearInvalidTimer(): void {
	if (!invalidTimer) return;
	clearTimeout(invalidTimer);
	invalidTimer = null;
}

function reconcileColumnPreferences(
	workspace: Workspace,
	document: TableDocument,
): Workspace {
	const valid = new Set(document.columns.map((column) => column.id));
	const wrappedColumns = workspace.wrappedColumns.filter((id) => valid.has(id));
	const columnWidths = Object.fromEntries(
		Object.entries(workspace.columnWidths).filter(([id]) => valid.has(id)),
	);
	return wrappedColumns.length === workspace.wrappedColumns.length &&
		Object.keys(columnWidths).length ===
			Object.keys(workspace.columnWidths).length
		? workspace
		: { ...workspace, wrappedColumns, columnWidths };
}

function widthsAfterDuplication(
	previous: TableDocument,
	next: TableDocument,
	columnWidths: Readonly<Record<ColumnId, number>>,
): Readonly<Record<ColumnId, number>> {
	const previousIds = new Set(previous.columns.map((column) => column.id));
	let changed = false;
	const widths = { ...columnWidths };
	for (let index = 0; index < next.columns.length; index += 1) {
		const column = next.columns[index];
		if (!column || previousIds.has(column.id)) continue;
		const source = next.columns[index - 1];
		const width = source ? columnWidths[source.id] : undefined;
		if (width === undefined) continue;
		widths[column.id] = width;
		changed = true;
	}
	return changed ? widths : columnWidths;
}

function pushHistory(
	past: readonly HistoryEntry[],
	entry: HistoryEntry,
): readonly HistoryEntry[] {
	const next = [...past, entry];
	return next.length > HISTORY_LIMIT
		? next.slice(next.length - HISTORY_LIMIT)
		: next;
}

function deriveDraft(
	draft: Pick<Draft, "paneId" | "viewId" | "text">,
	workspace: Workspace,
): Draft | null {
	const ownsDraft = workspace.panes.some(
		(pane) => pane.id === draft.paneId && pane.view === draft.viewId,
	);
	if (!ownsDraft) return null;

	const parse = getView(draft.viewId).codec?.parse;
	if (!parse) return null;
	const result = parse(draft.text);
	return result.ok
		? {
				...draft,
				status: "clean",
				issues: [],
				warnings: result.warnings ?? [],
			}
		: {
				...draft,
				status: "invalid",
				issues: result.issues,
				warnings: [],
			};
}

function restoreDraft(draft: Draft | null, workspace: Workspace): Draft | null {
	return draft ? deriveDraft(draft, workspace) : null;
}

// Removing one pane, expressed as the smaller preset that keeps every other
// pane where it is. Returns nothing when there is no smaller shape to move to,
// which is what leaves Close view disabled at one pane.
function closedPaneState(
	state: TabeloState,
	paneId: string,
): Pick<TabeloState, "workspace" | "draft" | "pendingPaneAction"> | null {
	const layout = smallerLayout(state.workspace.layout);
	const remaining = state.workspace.panes.filter((pane) => pane.id !== paneId);
	if (!layout || remaining.length === state.workspace.panes.length) return null;

	const panes = applyLayout(layout, remaining, state.draft?.paneId);
	return {
		workspace: {
			...state.workspace,
			layout,
			panes,
			activePaneId: panes.some(
				(pane) => pane.id === state.workspace.activePaneId,
			)
				? state.workspace.activePaneId
				: firstPaneId(panes),
		},
		draft: state.draft?.paneId === paneId ? null : state.draft,
		pendingPaneAction: null,
	};
}

function savePayload(state: TabeloState): SavePayload {
	return {
		document: state.document,
		workspace: state.workspace,
		draft: state.draft
			? {
					paneId: state.draft.paneId,
					viewId: state.draft.viewId,
					text: state.draft.text,
				}
			: null,
	};
}

// Serializes the document for a view. Views without a codec: the grid: have
// no text projection.
export type TextProjection =
	| { readonly ok: true; readonly text: string }
	| { readonly ok: false; readonly failure: PreconditionFailure };

export function textForView(
	document: TableDocument,
	viewId: ViewId,
): TextProjection {
	const codec = getView(viewId).codec;
	if (!codec) return { ok: true, text: "" };
	const failure = canSerialize(codec, document);
	// No output options reach this serialize call, and none ever should: a
	// pane always shows a codec's lossless default, never a download's chosen
	// options. A codec may declare output options that are lossy by design,
	// existing purely so a download can offer them; only the download dialog
	// narrows the user's choices in, through outputOptionsFor. Passing them
	// here would make a pane show text its own codec cannot parse back.
	return failure
		? { ok: false, failure }
		: { ok: true, text: codec.serialize(document) };
}

// The exact text a pane is showing. A pane owning an uncommitted draft is
// displaying that draft, not the last valid parse, so copying it must hand
// over what is on screen: including source that does not parse. Every other
// pane is a pure projection of the document.
export function visibleTextForPane(
	state: Pick<TabeloState, "document" | "draft">,
	paneId: string,
	viewId: ViewId,
): TextProjection {
	const draft = state.draft;
	return draft?.paneId === paneId && draft.viewId === viewId
		? { ok: true, text: draft.text }
		: textForView(state.document, viewId);
}

export function hasSessionWork(
	state: Pick<TabeloState, "hasHeldContent" | "draft">,
): boolean {
	return state.hasHeldContent || state.draft !== null;
}

export const useTabeloStore = create<TabeloState>((set, get) => ({
	document: createEmptyDocument(),
	workspace: createDefaultWorkspace(),

	draft: null,
	hasHeldContent: false,

	past: [],
	future: [],

	selection: createSelection({ row: 0, column: 0 }),
	editing: null,
	editingSeed: null,
	editingHeader: null,
	copiedRanges: NO_COPIED_RANGES,

	storageIssue: null,
	notices: [],
	inputError: null,
	politeStatus: null,
	pendingImport: null,
	pendingPaneAction: null,
	outputOptions: { ...defaultOutputOptions },

	hydrate: () => {
		const outcome = loadState();
		if (outcome.status === "ok") {
			const workspace = reconcileColumnPreferences(
				outcome.state.workspace,
				outcome.state.document,
			);
			set({
				document: outcome.state.document,
				workspace,
				draft: outcome.state.draft
					? deriveDraft(outcome.state.draft, workspace)
					: null,
				hasHeldContent: !isDocumentBlank(outcome.state.document),
				past: [],
				future: [],
				storageIssue: null,
				pendingImport: null,
				inputError: null,
				pendingPaneAction: null,
				selection: createSelection({ row: 0, column: 0 }),
			});
			return;
		}
		if (outcome.status === "unavailable") {
			set({ storageIssue: { kind: "unavailable" } });
			return;
		}
		if (outcome.status === "unreadable") {
			// The stored payload stays untouched so it can be recovered by hand.
			set({ storageIssue: { kind: "unreadable", raw: outcome.raw } });
		}
	},

	replaceUnreadableStorage: () => {
		const state = get();
		if (state.storageIssue?.kind !== "unreadable") return false;
		const outcome = preserveUnreadableAndSave(
			state.storageIssue.raw,
			savePayload(state),
		);
		if (outcome.status === "saved") {
			set({ storageIssue: null });
			return true;
		}
		if (outcome.recoveryPreserved) {
			set({ storageIssue: { kind: outcome.status } });
			return false;
		}
		set({
			storageIssue: {
				...state.storageIssue,
				replacementFailure: outcome.status,
			},
		});
		return false;
	},

	// The single funnel for every structural change. A table edit always wins
	// over an uncommitted draft, and the draft it displaces is preserved in
	// history rather than dropped. See docs/adr/0001 and 0003.
	applyDocument: (next) => {
		if (next === get().document) return;
		clearInvalidTimer();
		set((state) => ({
			past: pushHistory(state.past, snapshotOf(state)),
			future: [],
			document: next,
			hasHeldContent: state.hasHeldContent || !isDocumentBlank(next),
			workspace: reconcileColumnPreferences(state.workspace, next),
			draft: null,
			inputError: null,
			pendingImport: null,
			pendingPaneAction: null,
			// A changed document is a changed meaning for the copied rectangle: an
			// insert, a move, or a delete leaves those coordinates describing cells
			// the clipboard never held. The mark is dropped rather than
			// reconciled, which is also what a paste needs, since a paste is one of
			// these changes.
			copiedRanges: NO_COPIED_RANGES,
			selection: clampSelection(
				state.selection,
				next.rows.length,
				next.columns.length,
			),
		}));
	},

	setDraft: (paneId, viewId, text) => {
		const state = get();
		const pane = state.workspace.panes.find(
			(candidate) => candidate.id === paneId && candidate.view === viewId,
		);
		if (!pane) return;

		const codec = getView(viewId).codec;
		if (!codec) return;

		const previousDraft = state.draft;
		const sameOwner =
			previousDraft?.paneId === paneId && previousDraft.viewId === viewId;
		const ownerChanged = previousDraft !== null && !sameOwner;
		const result = codec.parse(text);

		if (!result.ok) {
			const continuingVisibleError =
				sameOwner && previousDraft.status === "invalid";
			const continuingGrace =
				sameOwner && previousDraft.status === "invalid-grace";
			const draft: Draft = {
				paneId,
				viewId,
				text,
				status: continuingVisibleError ? "invalid" : "invalid-grace",
				issues: result.issues,
				warnings: [],
			};

			if (!continuingGrace) clearInvalidTimer();
			set((current) => ({
				draft,
				pendingPaneAction: null,
				...(ownerChanged && previousDraft.status !== "clean"
					? {
							past: pushHistory(current.past, snapshotOf(current)),
							future: [],
						}
					: {}),
			}));

			if (!continuingVisibleError && !continuingGrace) {
				invalidTimer = setTimeout(() => {
					invalidTimer = null;
					set((current) =>
						current.draft?.paneId === paneId &&
						current.draft.viewId === viewId &&
						current.draft.status === "invalid-grace"
							? {
									draft: { ...current.draft, status: "invalid" },
								}
							: {},
					);
				}, INVALID_GRACE_MS);
			}
			return;
		}

		clearInvalidTimer();
		const document = reconcileDocument(
			state.document,
			result.document,
			codec.reconciliation,
		);
		const documentChanged = document !== state.document;
		const displacedInvalid = ownerChanged && previousDraft.status !== "clean";

		set((current) => ({
			...(documentChanged || displacedInvalid
				? {
						past: pushHistory(current.past, snapshotOf(current)),
						future: [],
					}
				: {}),
			document,
			hasHeldContent: current.hasHeldContent || !isDocumentBlank(document),
			workspace: reconcileColumnPreferences(current.workspace, document),
			draft: {
				paneId,
				viewId,
				text,
				status: "clean",
				issues: [],
				warnings: result.warnings ?? [],
			},
			pendingImport: null,
			inputError: null,
			pendingPaneAction: null,
			copiedRanges: NO_COPIED_RANGES,
			selection: clampSelection(
				current.selection,
				document.rows.length,
				document.columns.length,
			),
		}));
	},

	discardDraft: () => {
		clearInvalidTimer();
		set({ draft: null, pendingPaneAction: null });
	},

	setLayout: (layout) =>
		set((state) => {
			// Rearranging is not resizing the workspace. A selection naming another
			// pane count is stale or impossible, so it is refused rather than
			// silently opening or closing a pane behind the user's choice.
			if (paneCount(layout) !== state.workspace.panes.length) return state;

			const panes = applyLayout(
				layout,
				state.workspace.panes,
				state.draft?.paneId,
			);
			return {
				workspace: {
					...state.workspace,
					layout,
					panes,
					activePaneId: panes.some(
						(pane) => pane.id === state.workspace.activePaneId,
					)
						? state.workspace.activePaneId
						: firstPaneId(panes),
				},
			};
		}),

	setPaneView: (paneId, view) => {
		const state = get();
		const codec = getView(view).codec;
		const pane = state.workspace.panes.find(
			(candidate) => candidate.id === paneId,
		);
		if (
			!pane ||
			pane.view === view ||
			state.workspace.panes.some(
				(candidate) => candidate.id !== paneId && candidate.view === view,
			) ||
			(codec !== undefined && canSerialize(codec, state.document) !== null)
		)
			return;

		const draft = state.draft;
		const ownsDraft = draft?.paneId === paneId && draft.viewId === pane.view;
		if (ownsDraft) {
			if (draft.status !== "clean") {
				set({ pendingPaneAction: { kind: "view", paneId, view } });
				return;
			}
			state.discardDraft();
		}

		set((current) => ({
			workspace: {
				...current.workspace,
				panes: current.workspace.panes.map((candidate) =>
					candidate.id === paneId ? { ...candidate, view } : candidate,
				),
				activePaneId: paneId,
			},
			pendingPaneAction: null,
		}));
	},

	// Growing the workspace never displaces a pane, so unlike a view change or a
	// close this needs no confirmation: nothing pending can be lost.
	//
	// The split and the view it should show are applied in one update, because
	// the user was asked which view before anything moved. No intermediate
	// workspace holding a pane with an unchosen view is ever rendered, which is
	// what the old two-step add could not promise.
	addPaneBySplit: (option, viewId) => {
		const state = get();
		const previous = state.workspace.panes;
		// The option is derived from the workspace it was rendered against, so a
		// stale one is refused rather than applied to a shape it never described.
		const stale = !splitOptions(state.workspace).some(
			(candidate) =>
				candidate.paneId === option.paneId &&
				candidate.layout === option.layout,
		);
		if (stale) return;

		const panes = applyLayout(option.layout, previous, state.draft?.paneId);
		const existing = new Set(previous.map((pane) => pane.id));
		const added = panes.find((pane) => !existing.has(pane.id));
		if (!added) return;

		set({
			workspace: {
				...state.workspace,
				layout: option.layout,
				panes: panes.map((pane) =>
					pane.id === added.id ? { ...pane, view: viewId } : pane,
				),
				// The pane the user just asked for is the one they are about to work
				// in, so it takes focus for keyboard and document-level actions.
				activePaneId: added.id,
			},
		});
	},

	closePane: (paneId) => {
		const state = get();
		const draft = state.draft;
		// Text the document has not read back yet would go with the pane, so ask
		// first rather than discarding it silently.
		if (draft?.paneId === paneId && draft.status !== "clean") {
			if (!smallerLayout(state.workspace.layout)) return;
			set({ pendingPaneAction: { kind: "close", paneId } });
			return;
		}

		const next = closedPaneState(state, paneId);
		if (!next) return;
		clearInvalidTimer();
		set(next);
	},

	// Moving a pane is workspace presentation. The pure operation swaps only
	// slots, so pane identity, drafts, preferences, and the document timeline do
	// not need another reconciliation path here.
	movePane: (paneId, destinationPaneId) => {
		const state = get();
		const workspace = moveWorkspacePane(
			state.workspace,
			paneId,
			destinationPaneId,
		);
		if (!workspace) return false;
		set({ workspace });
		return true;
	},

	confirmPaneAction: () => {
		const state = get();
		const pending = state.pendingPaneAction;
		if (!pending) return;
		state.discardDraft();

		if (pending.kind === "close") {
			const next = closedPaneState(get(), pending.paneId);
			set(next ?? { pendingPaneAction: null });
			return;
		}
		if (
			get().workspace.panes.some(
				(candidate) =>
					candidate.id !== pending.paneId && candidate.view === pending.view,
			)
		) {
			set({ pendingPaneAction: null });
			return;
		}
		const targetCodec = getView(pending.view).codec;
		if (targetCodec && canSerialize(targetCodec, get().document) !== null) {
			set({ pendingPaneAction: null });
			return;
		}

		set((current) => ({
			workspace: {
				...current.workspace,
				panes: current.workspace.panes.map((candidate) =>
					candidate.id === pending.paneId
						? { ...candidate, view: pending.view }
						: candidate,
				),
				activePaneId: pending.paneId,
			},
			pendingPaneAction: null,
		}));
	},

	setActivePane: (paneId) =>
		set((state) => ({
			workspace: { ...state.workspace, activePaneId: paneId },
		})),

	setOutputOption: (id, value) =>
		set((state) => ({
			outputOptions: { ...state.outputOptions, [id]: value },
		})),

	// Zoom is presentation, like column width: it never reaches the document and
	// never consumes an undo step.
	setPaneZoom: (paneId, zoom) => {
		const state = get();
		const target = state.workspace.panes.find((pane) => pane.id === paneId);
		const next = clampPaneZoom(zoom);
		if (!target || target.zoom === next) return;

		set({
			workspace: {
				...state.workspace,
				panes: state.workspace.panes.map((pane) =>
					pane.id === paneId ? { ...pane, zoom: next } : pane,
				),
			},
		});
	},

	// Source wrapping is pane presentation. It is persisted with the pane but
	// never changes the document or consumes a document-history step.
	setPaneWrap: (paneId, wrap) =>
		set((state) => {
			const target = state.workspace.panes.find((pane) => pane.id === paneId);
			if (!target || target.wrap === wrap) return state;
			return {
				workspace: {
					...state.workspace,
					panes: state.workspace.panes.map((pane) =>
						pane.id === paneId ? { ...pane, wrap } : pane,
					),
				},
			};
		}),

	// Wrapping is a persisted grid preference, not a document edit. The stable
	// id survives column reordering, and refusing unknown ids keeps persistence
	// free of state no current document can render.
	toggleColumnWrap: (columnId) =>
		set((state) => {
			if (!state.document.columns.some((column) => column.id === columnId)) {
				return state;
			}
			const wrapped = state.workspace.wrappedColumns.includes(columnId);
			return {
				workspace: {
					...state.workspace,
					wrappedColumns: wrapped
						? state.workspace.wrappedColumns.filter((id) => id !== columnId)
						: [...state.workspace.wrappedColumns, columnId],
				},
			};
		}),

	setColumnRatio: (ratio) =>
		set((state) => ({
			workspace: {
				...state.workspace,
				columnRatio: Math.min(0.85, Math.max(0.15, ratio)),
			},
		})),

	setRowRatio: (ratio) =>
		set((state) => ({
			workspace: {
				...state.workspace,
				rowRatio: Math.min(0.85, Math.max(0.15, ratio)),
			},
		})),

	undo: () => {
		clearInvalidTimer();
		set((state) => {
			const entry = state.past.at(-1);
			if (!entry) return state;
			return {
				past: state.past.slice(0, -1),
				future: [snapshotOf(state), ...state.future],
				document: entry.document,
				hasHeldContent:
					state.hasHeldContent || !isDocumentBlank(entry.document),
				workspace: reconcileColumnPreferences(state.workspace, entry.document),
				draft: restoreDraft(entry.draft, state.workspace),
				pendingImport: null,
				inputError: null,
				pendingPaneAction: null,
				copiedRanges: NO_COPIED_RANGES,
				selection: clampSelection(
					state.selection,
					entry.document.rows.length,
					entry.document.columns.length,
				),
			};
		});
	},

	redo: () => {
		clearInvalidTimer();
		set((state) => {
			const entry = state.future[0];
			if (!entry) return state;
			return {
				past: pushHistory(state.past, snapshotOf(state)),
				future: state.future.slice(1),
				document: entry.document,
				hasHeldContent:
					state.hasHeldContent || !isDocumentBlank(entry.document),
				workspace: reconcileColumnPreferences(state.workspace, entry.document),
				draft: restoreDraft(entry.draft, state.workspace),
				pendingImport: null,
				inputError: null,
				pendingPaneAction: null,
				copiedRanges: NO_COPIED_RANGES,
				selection: clampSelection(
					state.selection,
					entry.document.rows.length,
					entry.document.columns.length,
				),
			};
		});
	},

	setSelection: (selection) => set({ selection }),

	selectCell: (position, mode = "cell") =>
		set({
			selection: createSelection(position, mode),
			editing: null,
			editingSeed: null,
			editingHeader: null,
		}),

	// Extending moves the active region only. Every other region the modifier
	// added stays exactly where it is.
	extendSelection: (position) =>
		set((state) => ({
			selection: extendActiveRange(state.selection, position),
		})),

	toggleSelectionRegion: (position, mode = "cell") =>
		set((state) => ({
			selection: toggleSelectionRegion(state.selection, position, mode),
			editing: null,
			editingSeed: null,
			editingHeader: null,
		})),

	// The keyboard's half of what the modifier means on the pointer: go
	// somewhere else without discarding what is already selected.
	moveFocusKeepingRegions: (position) =>
		set((state) => ({
			selection: moveFocusKeepingRegions(state.selection, position),
			editing: null,
			editingSeed: null,
			editingHeader: null,
		})),

	setEditing: (position, seed) =>
		set({
			editing: position,
			editingSeed: position ? (seed ?? null) : null,
			editingHeader: null,
		}),
	// The seed is the character that opened the editor, so typing over a selected
	// header replaces it exactly as typing over a selected cell does.
	setEditingHeader: (index, seed) =>
		set({
			editingHeader: index,
			editingSeed: index === null ? null : (seed ?? null),
			editing: null,
		}),

	// Taken from the selection at the moment of the copy, because that is the
	// only moment the two agree. Everything after it moves the selection away.
	markCopiedRanges: () => set({ copiedRanges: currentRects(get()) }),

	clearCopiedRanges: () => set({ copiedRanges: NO_COPIED_RANGES }),

	editCell: (row, column, value) =>
		get().applyDocument(setCell(get().document, row, column, value)),

	editHeader: (column, value) =>
		get().applyDocument(setHeader(get().document, column, value)),

	// Alignment and width belong to a column rather than to a rectangle of
	// cells, so acting on one the selection already covers acts on every
	// selected column, adjacent or not. Acting on a column outside the selection
	// touches only that one: a drag on an unrelated column edge must not resize
	// something elsewhere in the table.
	setColumnAlignment: (column, align) => {
		const state = get();
		let next = state.document;
		for (const target of columnTargets(state, column)) {
			next = setAlignment(next, target, align);
		}
		state.applyDocument(next);
	},

	// Width is a persisted workspace preference, so it bypasses the document
	// timeline. Dragging a column edge must not consume an undo step.
	resizeColumn: (column, width, scope = "selection") =>
		set((state) => {
			const columnWidths = { ...state.workspace.columnWidths };
			let changed = false;
			const targets =
				scope === "column" ? [column] : columnTargets(state, column);
			for (const target of targets) {
				const id = state.document.columns[target]?.id;
				if (!id) continue;
				if (width === undefined) {
					if (!(id in columnWidths)) continue;
					delete columnWidths[id];
					changed = true;
					continue;
				}
				const next = clampColumnWidth(width);
				if (columnWidths[id] === next) continue;
				columnWidths[id] = next;
				changed = true;
			}
			return changed
				? {
						workspace: { ...state.workspace, columnWidths },
						inputError: null,
					}
				: state;
		}),

	// Every row operation below counts data rows only. A selection may cover the
	// header row, and the header row is structurally required: it is never
	// inserted beside as a count, removed, duplicated, or moved.
	//
	// Inserting and moving need a single insertion point, so they act on the
	// active region and refuse a selection that holds more than one. The menus
	// disable them with a written reason first, the same way an out-of-range
	// move has always been disabled rather than silently ignored.
	addRowAbove: () => {
		const state = get();
		if (!isContiguous(state.selection)) return;
		const rect = currentRect(state);
		const count = Math.max(1, rectDataRows(rect).length);
		const at = Math.max(0, rect.top);
		state.applyDocument(insertRows(state.document, at, count));
		set({ selection: createSelection({ row: at, column: rect.left }) });
	},

	addRowBelow: () => {
		const state = get();
		if (!isContiguous(state.selection)) return;
		const rect = currentRect(state);
		const count = Math.max(1, rectDataRows(rect).length);
		const at = Math.max(0, rect.bottom + 1);
		state.applyDocument(insertRows(state.document, at, count));
		set({
			selection: createSelection({ row: at, column: rect.left }),
		});
	},

	removeSelectedRows: () => {
		const state = get();
		const rows = currentDataRows(state);
		if (rows.length === 0) return;
		state.applyDocument(deleteRows(state.document, rows));
	},

	duplicateSelectedRows: () => {
		const state = get();
		const rows = currentDataRows(state);
		if (rows.length === 0) return;
		const error = tableShapeLimitError({
			rows: state.document.rows.length + rows.length,
			columns: state.document.columns.length,
		});
		if (error) {
			set({ inputError: error });
			return;
		}
		state.applyDocument(duplicateRows(state.document, rows));
	},

	moveSelectedRow: (offset) => {
		const state = get();
		const refusal = selectionMoveRefusal(
			state.selection,
			state.document.rows.length,
			state.document.columns.length,
			"row",
			offset,
		);
		if (refusal) return refusal;
		const rect = currentRect(state);
		const rows = rectDataRows(rect);
		const from = rows[0];
		if (from === undefined) return "header-row";
		const next = moveRows(state.document, { from, count: rows.length }, offset);
		if (next === state.document) return null;
		state.applyDocument(next);
		set({ selection: translateSelection(state.selection, "row", offset) });
		return null;
	},

	addColumnLeft: () => {
		const state = get();
		if (!isContiguous(state.selection)) return;
		const rect = currentRect(state);
		state.applyDocument(
			insertColumns(state.document, rect.left, rect.right - rect.left + 1),
		);
		set({ selection: createSelection({ row: rect.top, column: rect.left }) });
	},

	addColumnRight: () => {
		const state = get();
		if (!isContiguous(state.selection)) return;
		const rect = currentRect(state);
		state.applyDocument(
			insertColumns(state.document, rect.right + 1, rect.right - rect.left + 1),
		);
		set({
			selection: createSelection({ row: rect.top, column: rect.right + 1 }),
		});
	},

	removeSelectedColumns: () => {
		const state = get();
		state.applyDocument(deleteColumns(state.document, currentColumns(state)));
	},

	duplicateSelectedColumns: () => {
		const state = get();
		const columns = currentColumns(state);
		const error = tableShapeLimitError({
			rows: state.document.rows.length,
			columns: state.document.columns.length + columns.length,
		});
		if (error) {
			set({ inputError: error });
			return;
		}
		const next = duplicateColumns(state.document, columns);
		const columnWidths = widthsAfterDuplication(
			state.document,
			next,
			state.workspace.columnWidths,
		);
		state.applyDocument(next);
		if (columnWidths !== state.workspace.columnWidths) {
			set((current) => ({
				workspace: { ...current.workspace, columnWidths },
			}));
		}
	},

	moveSelectedColumn: (offset) => {
		const state = get();
		const refusal = selectionMoveRefusal(
			state.selection,
			state.document.rows.length,
			state.document.columns.length,
			"column",
			offset,
		);
		if (refusal) return refusal;
		const rect = currentRect(state);
		const next = moveColumns(
			state.document,
			{ from: rect.left, count: rect.right - rect.left + 1 },
			offset,
		);
		if (next === state.document) return null;
		state.applyDocument(next);
		set({ selection: translateSelection(state.selection, "column", offset) });
		return null;
	},

	// Pointer, keyboard, and menu fill all end here. The selection is the source
	// at call time and the target is the complete preview rectangle, including
	// that source. One `applyDocument` call makes the whole fill one history step.
	fillSelection: (target) => {
		const state = get();
		if (
			selectionFillRefusal(
				state.selection,
				state.document.rows.length,
				state.document.columns.length,
			)
		) {
			return 0;
		}
		const source = currentRect(state);
		const next = fillRange(state.document, source, target);
		if (next === state.document) return 0;

		state.applyDocument(next);
		set({
			selection: {
				ranges: [
					{
						anchor: { row: target.top, column: target.left },
						focus: { row: target.bottom, column: target.right },
						mode: "cell",
					},
				],
				activeIndex: 0,
			},
		});
		const targetSize =
			(target.bottom - target.top + 1) * (target.right - target.left + 1);
		const sourceSize =
			(source.bottom - source.top + 1) * (source.right - source.left + 1);
		return targetSize - sourceSize;
	},

	clearSelection: () => {
		const state = get();
		state.applyDocument(clearCells(state.document, currentRects(state)));
	},

	// Backspace clears contents; adding the modifier removes the structure. The
	// selection mode decides whether that means rows or columns.
	deleteSelectedStructure: () => {
		const state = get();
		const guard = structureDeletionGuard(
			state.selection,
			state.document.rows.length,
			state.document.columns.length,
		);
		if (activeRange(state.selection).mode === "column") {
			if (guard.wouldRemoveAllColumns) return "last-column";
			state.removeSelectedColumns();
			return null;
		}
		// The header row is reachable by the selection now, so it is reachable by
		// a structural delete for the first time. It stays: every table has
		// exactly one header row, and emptying it is what Backspace is for.
		if (currentDataRows(state).length === 0) return "header-row";
		if (guard.wouldRemoveAllRows) return "last-row";
		state.removeSelectedRows();
		return null;
	},

	// The rows and columns the selection covers, as a well-formed table. A gap
	// between two selected columns closes rather than travelling to the
	// clipboard as a ragged payload, so pasting the result back produces exactly
	// the columns that were selected. Excel and Google Sheets do the same.
	selectedMatrix: () => {
		const state = get();
		const rowCount = state.document.rows.length;
		const columnCount = state.document.columns.length;
		const columns = selectionColumns(state.selection, rowCount, columnCount)
			.map((index) => state.document.columns[index])
			.filter((column) => column !== undefined);

		const body = selectionDataRows(state.selection, rowCount, columnCount)
			.map((index) => state.document.rows[index])
			.filter((row) => row !== undefined)
			.map((row) => columns.map((column) => cellTextAt(row, column.id)));

		// A selection that covers the header carries it, which is what makes the
		// result useful when pasted somewhere else. Whole columns always do.
		return selectionCoversHeader(state.selection, rowCount, columnCount)
			? [columns.map((column) => column.header), ...body]
			: body;
	},

	pasteClipboard: (payload) => {
		const state = get();
		const prepared = prepareImport({ payload });
		if (!prepared.ok) {
			if (prepared.error.code !== "empty") {
				set({ inputError: prepared.error });
			}
			return null;
		}

		// Into an empty document, a paste creates the table: including the
		// header decision. Into an existing one, it writes at the selection.
		if (isDocumentBlank(state.document)) {
			if (prepared.value.headerRow === undefined) {
				set({ pendingImport: { prepared: prepared.value }, inputError: null });
				return null;
			}
			const document = createImportedDocument(
				prepared.value,
				prepared.value.headerRow,
			);
			state.applyDocument(document);
			set({
				selection: createSelection({ row: 0, column: 0 }),
			});
			return null;
		}

		// A paste writes a rectangle from one origin, and a selection holding
		// several regions names several of them. The refusal is reported rather
		// than silent: the user has content in hand and pressed a key for it, so
		// nothing happening at all would read as the clipboard having failed.
		if (!isContiguous(state.selection)) return "single-area";

		const rect = currentRect(state);
		// A whole-column selection includes the header sentinel. Paste still
		// targets data rows, so translate that UI coordinate at this boundary.
		const rowIndex = Math.max(0, rect.top);
		const projectedError = tableShapeLimitError({
			rows: Math.max(
				state.document.rows.length,
				rowIndex + prepared.value.matrix.length,
			),
			columns: Math.max(
				state.document.columns.length,
				rect.left + Math.max(...prepared.value.matrix.map((row) => row.length)),
			),
		});
		if (projectedError) {
			set({ inputError: projectedError });
			return null;
		}
		state.applyDocument(
			pasteMatrix(
				state.document,
				{ rowIndex, columnIndex: rect.left },
				prepared.value.matrix,
			),
		);
		return null;
	},

	importText: (text, format) => {
		const state = get();
		const prepared = prepareImport({ payload: { text }, format });
		if (!prepared.ok) {
			if (prepared.error.code !== "empty") {
				set({ inputError: prepared.error });
			}
			return;
		}

		if (prepared.value.headerRow === undefined) {
			set({ pendingImport: { prepared: prepared.value }, inputError: null });
			return;
		}
		const document = createImportedDocument(
			prepared.value,
			prepared.value.headerRow,
		);
		state.applyDocument(document);
		set({
			selection: createSelection({ row: 0, column: 0 }),
		});
	},

	reportInputError: (error) => set({ inputError: error }),

	answerPendingImport: (headerRow) => {
		const state = get();
		if (!state.pendingImport) return;
		state.applyDocument(
			createImportedDocument(state.pendingImport.prepared, headerRow),
		);
		set({ selection: createSelection({ row: 0, column: 0 }) });
	},

	cancelPendingImport: () => set({ pendingImport: null }),

	resetDocument: () => {
		get().applyDocument(createEmptyDocument());
		set({
			hasHeldContent: false,
			selection: createSelection({ row: 0, column: 0 }),
		});
	},

	// One dismissal for every notice, whichever channel it came from. A queued
	// message is removed; a projected condition is cleared at its source. The
	// identifier is what makes that possible: without it, dismissal could only
	// ever clear whichever notice happened to rank highest.
	dismissNotice: (id) =>
		set((state) => {
			switch (id) {
				case conditionNoticeIds.inputError:
					return { inputError: null };
				case conditionNoticeIds.pendingPaneAction:
					return { pendingPaneAction: null };
				default:
					return { notices: removeNotice(state.notices, id) };
			}
		}),
	pushNotice: (request) =>
		set((state) => ({ notices: queueNotice(state.notices, request) })),

	announceStatus: (message) => {
		statusSequence += 1;
		set({ politeStatus: { id: `polite-status-${statusSequence}`, message } });
	},
}));

// Where the keyboard is working: the active region alone. Only operations that
// need a single insertion point or a single origin read this, and each of them
// refuses a selection that holds more than one region first.
function currentRect(state: TabeloState) {
	return selectionRect(
		state.selection,
		state.document.rows.length,
		state.document.columns.length,
	);
}

// Everything the user selected. These three are what an operation reads when it
// acts on the whole selection rather than on one insertion point.
function currentRects(state: TabeloState) {
	return selectionRects(
		state.selection,
		state.document.rows.length,
		state.document.columns.length,
	);
}

function currentDataRows(state: TabeloState) {
	return selectionDataRows(
		state.selection,
		state.document.rows.length,
		state.document.columns.length,
	);
}

function currentColumns(state: TabeloState) {
	return selectionColumns(
		state.selection,
		state.document.rows.length,
		state.document.columns.length,
	);
}

// Which columns a per-column property change applies to. Acting on a column
// that is selected as a column acts on every selected column, adjacent or not;
// acting on any other column stays where the gesture pointed.
function columnTargets(state: TabeloState, column: number): readonly number[] {
	const selected = selectedAxis(
		state.selection,
		"column",
		state.document.rows.length,
		state.document.columns.length,
	);
	return selected.includes(column) ? selected : [column];
}

// Autosave. Persisting on every keystroke would be wasteful, and persisting
// only on unload would lose work, so writes are debounced after changes settle.
let saveTimer: ReturnType<typeof setTimeout> | null = null;

export type FlushOutcome = SaveOutcome | { readonly status: "blocked" };

export function flushPersistence(): FlushOutcome {
	const current = useTabeloStore.getState();
	if (current.storageIssue?.kind === "unreadable") {
		return { status: "blocked" };
	}
	const outcome = saveState(savePayload(current));
	useTabeloStore.setState({
		storageIssue: outcome.status === "saved" ? null : { kind: outcome.status },
	});
	return outcome;
}

export function startAutosave(): () => void {
	const flush = () => {
		if (saveTimer) {
			clearTimeout(saveTimer);
			saveTimer = null;
		}
		flushPersistence();
	};
	const unsubscribe = useTabeloStore.subscribe((state, previous) => {
		if (
			state.document === previous.document &&
			state.workspace === previous.workspace &&
			state.draft === previous.draft
		)
			return;

		if (saveTimer) clearTimeout(saveTimer);
		saveTimer = setTimeout(() => {
			saveTimer = null;
			flushPersistence();
		}, 500);
	});
	const onVisibilityChange = () => {
		if (document.visibilityState === "hidden") flush();
	};
	window.addEventListener("pagehide", flush);
	document.addEventListener("visibilitychange", onVisibilityChange);
	return () => {
		unsubscribe();
		window.removeEventListener("pagehide", flush);
		document.removeEventListener("visibilitychange", onVisibilityChange);
		if (saveTimer) {
			clearTimeout(saveTimer);
			saveTimer = null;
		}
	};
}
