import { create } from "zustand";
import type { ClipboardPayload } from "@/clipboard/parse";
import {
	createEmptyDocument,
	documentToMatrix,
	isDocumentBlank,
	reconcileDocument,
} from "@/core/document";
import {
	clearCells,
	deleteColumns,
	deleteRows,
	demoteHeaderToRow,
	duplicateColumns,
	duplicateRows,
	insertColumns,
	insertRows,
	moveColumn,
	moveRow,
	pasteMatrix,
	setAlignment,
	setCell,
	setColumnWidth,
	setHeader,
} from "@/core/operations";
import {
	type CellPosition,
	clampSelection,
	createSelection,
	type GridSelection,
	rectColumns,
	rectRows,
	type SelectionMode,
	selectionRect,
} from "@/core/selection";
import type { Alignment, TableDocument } from "@/core/types";
import type {
	CodecId,
	OutputOptionId,
	OutputOptions,
	ParseIssue,
} from "@/formats/types";
import { defaultOutputOptions } from "@/formats/types";
import {
	createImportedDocument,
	type ImportError,
	prepareImport,
} from "@/import/prepare";
import {
	loadState,
	preserveUnreadableAndSave,
	type SaveOutcome,
	type SavePayload,
	saveState,
} from "@/persistence/storage";
import { getView } from "@/views/registry";
import type { ViewId } from "@/views/types";
import {
	applyLayout,
	createDefaultWorkspace,
	type LayoutId,
	largerLayout,
	smallerLayout,
	type Workspace,
} from "@/workspace/layout";
import { clampPaneZoom } from "@/workspace/zoom";

// How many steps the document timeline keeps. Deep enough to cover a working
// session, bounded so a long session cannot grow without limit.
const HISTORY_LIMIT = 200;

// Syntax errors get a short grace period so a transient broken delimiter never
// flashes feedback while the user is still completing the transaction.
const INVALID_GRACE_MS = 300;

export type DraftStatus = "clean" | "invalid-grace" | "invalid";

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

export interface HeaderCorrection {
	// Object identity is the revision token. The action is valid only while this
	// exact imported document remains current.
	readonly document: TableDocument;
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

	past: readonly HistoryEntry[];
	future: readonly HistoryEntry[];

	selection: GridSelection;
	editing: CellPosition | null;
	editingSeed: string | null;
	editingHeader: number | null;

	storageIssue: StorageIssue | null;
	notice: string | null;
	inputError: ImportError | null;
	headerCorrection: HeaderCorrection | null;
	pendingPaneAction: PendingPaneAction | null;
	// What the next download should produce. Deliberately session-only: it
	// changes the shape of the exported file, and a silently remembered "no
	// header row" would surprise someone weeks later. Never persisted, never
	// document state, never a history step. See docs/adr/0005.
	outputOptions: Required<OutputOptions>;
	// The pane whose menu should take focus next. Adding a view is one intent in
	// two parts — make room, then say what goes there — so the control that says
	// it is handed to the user instead of left to be hunted for.
	paneMenuFocus: string | null;

	hydrate: () => void;
	replaceUnreadableStorage: () => boolean;
	applyDocument: (next: TableDocument) => void;

	setDraft: (paneId: string, viewId: ViewId, text: string) => void;
	discardDraft: () => void;

	setLayout: (layout: LayoutId) => void;
	setPaneView: (paneId: string, view: ViewId) => void;
	addPane: () => void;
	closePane: (paneId: string) => void;
	confirmPaneAction: () => void;
	clearPaneMenuFocus: () => void;
	setActivePane: (paneId: string) => void;
	setOutputOption: (id: OutputOptionId, value: boolean) => void;
	setPaneZoom: (paneId: string, zoom: number) => void;
	setColumnRatio: (ratio: number) => void;
	setRowRatio: (ratio: number) => void;

	undo: () => void;
	redo: () => void;

	setSelection: (selection: GridSelection) => void;
	selectCell: (position: CellPosition, mode?: SelectionMode) => void;
	extendSelection: (position: CellPosition) => void;
	setEditing: (position: CellPosition | null, seed?: string) => void;
	setEditingHeader: (index: number | null) => void;

	editCell: (row: number, column: number, value: string) => void;
	editHeader: (column: number, value: string) => void;
	setColumnAlignment: (column: number, align: Alignment) => void;
	resizeColumn: (column: number, width: number | undefined) => void;

	addRowAbove: () => void;
	addRowBelow: () => void;
	removeSelectedRows: () => void;
	duplicateSelectedRows: () => void;
	moveSelectedRow: (offset: number) => void;

	addColumnLeft: () => void;
	addColumnRight: () => void;
	removeSelectedColumns: () => void;
	duplicateSelectedColumns: () => void;
	moveSelectedColumn: (offset: number) => void;

	clearSelection: () => void;
	deleteSelectedStructure: () => void;
	selectedMatrix: () => string[][];
	pasteClipboard: (payload: ClipboardPayload) => void;
	importText: (text: string, format?: CodecId) => void;

	demoteHeader: () => void;
	resetDocument: () => void;
	dismissNotice: () => void;
	setNotice: (notice: string | null) => void;
}

let invalidTimer: ReturnType<typeof setTimeout> | null = null;

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
// which is what leaves Close view disabled at a single pane.
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
				: panes[0].id,
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

// Serializes the document for a view. Views without a codec — the grid — have
// no text projection.
export function textForView(document: TableDocument, viewId: ViewId): string {
	const codec = getView(viewId).codec;
	return codec ? codec.serialize(document) : "";
}

// The exact text a pane is showing. A pane owning an uncommitted draft is
// displaying that draft, not the last valid parse, so copying it must hand
// over what is on screen — including source that does not parse. Every other
// pane, including a second pane on the same format, is a pure projection.
export function visibleTextForPane(
	state: Pick<TabeloState, "document" | "draft">,
	paneId: string,
	viewId: ViewId,
): string {
	const draft = state.draft;
	return draft?.paneId === paneId && draft.viewId === viewId
		? draft.text
		: textForView(state.document, viewId);
}

export const useTabeloStore = create<TabeloState>((set, get) => ({
	document: createEmptyDocument(),
	workspace: createDefaultWorkspace(),

	draft: null,

	past: [],
	future: [],

	selection: createSelection({ row: 0, column: 0 }),
	editing: null,
	editingSeed: null,
	editingHeader: null,

	storageIssue: null,
	notice: null,
	inputError: null,
	headerCorrection: null,
	pendingPaneAction: null,
	paneMenuFocus: null,
	outputOptions: { ...defaultOutputOptions },

	hydrate: () => {
		const outcome = loadState();
		if (outcome.status === "ok") {
			set({
				document: outcome.state.document,
				workspace: outcome.state.workspace,
				draft: outcome.state.draft
					? deriveDraft(outcome.state.draft, outcome.state.workspace)
					: null,
				past: [],
				future: [],
				storageIssue: null,
				headerCorrection: null,
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
			draft: null,
			inputError: null,
			headerCorrection: null,
			pendingPaneAction: null,
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

		const parse = getView(viewId).codec?.parse;
		if (!parse) return;

		const previousDraft = state.draft;
		const sameOwner =
			previousDraft?.paneId === paneId && previousDraft.viewId === viewId;
		const ownerChanged = previousDraft !== null && !sameOwner;
		const result = parse(text);

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
		const document = reconcileDocument(state.document, result.document);
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
			draft: {
				paneId,
				viewId,
				text,
				status: "clean",
				issues: [],
				warnings: result.warnings ?? [],
			},
			headerCorrection: null,
			inputError: null,
			pendingPaneAction: null,
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
						: panes[0].id,
				},
			};
		}),

	setPaneView: (paneId, view) => {
		const state = get();
		const pane = state.workspace.panes.find(
			(candidate) => candidate.id === paneId,
		);
		if (!pane || pane.view === view) return;

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
	// close this needs no confirmation: nothing pending can be lost. The new
	// pane opens on the registry's next preferred view and hands its menu the
	// focus, so changing that choice is the very next keystroke.
	addPane: () => {
		const state = get();
		const layout = largerLayout(state.workspace.layout);
		if (!layout) return;

		const previous = state.workspace.panes;
		const panes = applyLayout(layout, previous, state.draft?.paneId);
		const existing = new Set(previous.map((pane) => pane.id));
		const added = panes.find((pane) => !existing.has(pane.id));
		if (!added) return;

		set({
			workspace: {
				...state.workspace,
				layout,
				panes,
				// The pane the user just asked for is the one they are about to work
				// in, so it takes focus for keyboard and document-level actions.
				activePaneId: added.id,
			},
			paneMenuFocus: added.id,
		});
	},

	clearPaneMenuFocus: () => set({ paneMenuFocus: null }),

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
				draft: restoreDraft(entry.draft, state.workspace),
				headerCorrection: null,
				inputError: null,
				pendingPaneAction: null,
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
				draft: restoreDraft(entry.draft, state.workspace),
				headerCorrection: null,
				inputError: null,
				pendingPaneAction: null,
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

	extendSelection: (position) =>
		set((state) => ({ selection: { ...state.selection, focus: position } })),

	setEditing: (position, seed) =>
		set({
			editing: position,
			editingSeed: position ? (seed ?? null) : null,
			editingHeader: null,
		}),
	setEditingHeader: (index) =>
		set({ editingHeader: index, editing: null, editingSeed: null }),

	editCell: (row, column, value) =>
		get().applyDocument(setCell(get().document, row, column, value)),

	editHeader: (column, value) =>
		get().applyDocument(setHeader(get().document, column, value)),

	setColumnAlignment: (column, align) =>
		get().applyDocument(setAlignment(get().document, column, align)),

	// Width is presentation state, so it bypasses the document timeline —
	// dragging a column edge should not consume an undo step.
	resizeColumn: (column, width) =>
		set((state) => {
			const next = setColumnWidth(state.document, column, width);
			return next === state.document
				? state
				: { document: next, headerCorrection: null, inputError: null };
		}),

	addRowAbove: () => {
		const state = get();
		const rect = currentRect(state);
		state.applyDocument(insertRows(state.document, rect.top));
		set({ selection: createSelection({ row: rect.top, column: rect.left }) });
	},

	addRowBelow: () => {
		const state = get();
		const rect = currentRect(state);
		state.applyDocument(insertRows(state.document, rect.bottom + 1));
		set({
			selection: createSelection({ row: rect.bottom + 1, column: rect.left }),
		});
	},

	removeSelectedRows: () => {
		const state = get();
		state.applyDocument(
			deleteRows(state.document, rectRows(currentRect(state))),
		);
	},

	duplicateSelectedRows: () => {
		const state = get();
		state.applyDocument(
			duplicateRows(state.document, rectRows(currentRect(state))),
		);
	},

	moveSelectedRow: (offset) => {
		const state = get();
		const rect = currentRect(state);
		const to = rect.top + offset;
		if (to < 0 || to >= state.document.rows.length) return;
		state.applyDocument(moveRow(state.document, rect.top, to));
		set({
			selection: {
				...state.selection,
				anchor: { row: to, column: rect.left },
				focus: { row: to, column: rect.right },
			},
		});
	},

	addColumnLeft: () => {
		const state = get();
		const rect = currentRect(state);
		state.applyDocument(insertColumns(state.document, rect.left));
		set({ selection: createSelection({ row: rect.top, column: rect.left }) });
	},

	addColumnRight: () => {
		const state = get();
		const rect = currentRect(state);
		state.applyDocument(insertColumns(state.document, rect.right + 1));
		set({
			selection: createSelection({ row: rect.top, column: rect.right + 1 }),
		});
	},

	removeSelectedColumns: () => {
		const state = get();
		state.applyDocument(
			deleteColumns(state.document, rectColumns(currentRect(state))),
		);
	},

	duplicateSelectedColumns: () => {
		const state = get();
		state.applyDocument(
			duplicateColumns(state.document, rectColumns(currentRect(state))),
		);
	},

	moveSelectedColumn: (offset) => {
		const state = get();
		const rect = currentRect(state);
		const to = rect.left + offset;
		if (to < 0 || to >= state.document.columns.length) return;
		state.applyDocument(moveColumn(state.document, rect.left, to));
		set({
			selection: {
				...state.selection,
				anchor: { row: rect.top, column: to },
				focus: { row: rect.bottom, column: to },
			},
		});
	},

	clearSelection: () => {
		const state = get();
		state.applyDocument(clearCells(state.document, currentRect(state)));
	},

	// Backspace clears contents; adding the modifier removes the structure. The
	// selection mode decides whether that means rows or columns.
	deleteSelectedStructure: () => {
		const state = get();
		if (state.selection.mode === "column") state.removeSelectedColumns();
		else state.removeSelectedRows();
	},

	selectedMatrix: () => {
		const state = get();
		const rect = currentRect(state);
		const body = state.document.rows
			.slice(rect.top, rect.bottom + 1)
			.map((row) =>
				state.document.columns
					.slice(rect.left, rect.right + 1)
					.map((column) => row.cells[column.id] ?? ""),
			);

		// Copying whole columns carries their headers, which is what makes the
		// result useful when pasted somewhere else.
		return state.selection.mode === "column"
			? [
					state.document.columns
						.slice(rect.left, rect.right + 1)
						.map((c) => c.header),
					...body,
				]
			: body;
	},

	pasteClipboard: (payload) => {
		const state = get();
		const prepared = prepareImport({ payload });
		if (!prepared.ok) {
			if (prepared.error.code !== "empty") {
				set({ inputError: prepared.error });
			}
			return;
		}

		// Into an empty document, a paste creates the table — including the
		// header decision. Into an existing one, it writes at the selection.
		if (isDocumentBlank(state.document)) {
			const document = createImportedDocument(prepared.value);
			state.applyDocument(document);
			set({
				headerCorrection: prepared.value.headerRow ? { document } : null,
				selection: createSelection({ row: 0, column: 0 }),
			});
			return;
		}

		const rect = currentRect(state);
		state.applyDocument(
			pasteMatrix(
				state.document,
				{ rowIndex: rect.top, columnIndex: rect.left },
				prepared.value.matrix,
			),
		);
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

		const document = createImportedDocument(prepared.value);
		state.applyDocument(document);
		set({
			headerCorrection: prepared.value.headerRow ? { document } : null,
			selection: createSelection({ row: 0, column: 0 }),
		});
	},

	demoteHeader: () => {
		const state = get();
		if (
			!state.headerCorrection ||
			state.headerCorrection.document !== state.document
		) {
			set({ headerCorrection: null });
			return;
		}
		state.applyDocument(demoteHeaderToRow(state.document));
	},

	resetDocument: () => {
		get().applyDocument(createEmptyDocument());
		set({ selection: createSelection({ row: 0, column: 0 }) });
	},

	dismissNotice: () =>
		set((state) => {
			if (state.inputError) return { inputError: null };
			if (state.headerCorrection) return { headerCorrection: null };
			if (state.pendingPaneAction) return { pendingPaneAction: null };
			return { notice: null };
		}),
	setNotice: (notice) => set({ notice }),
}));

function currentRect(state: TabeloState) {
	return selectionRect(
		state.selection,
		state.document.rows.length,
		state.document.columns.length,
	);
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

export { documentToMatrix };
