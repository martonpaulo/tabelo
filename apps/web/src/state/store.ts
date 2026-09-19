import { create } from "zustand";
import type { ClipboardPayload, ClipboardSource } from "@/clipboard/parse";
import type { ClipboardSelection } from "@/clipboard/payload";
import { DEFAULT_TABLE_NAME } from "@/copy/product";
import {
	type SelectionMarkState,
	selectionMarkState,
	toggleMarkInCells,
} from "@/core/cell-formatting";
import { readCell } from "@/core/cell-value";
import { createEmptyDocument, isDocumentBlank } from "@/core/document";
import {
	type CellMatch,
	findMatches,
	matchIndexFrom,
	positionAfterReplacement,
	replaceMatches,
} from "@/core/find";
import { nextMatchingCell } from "@/core/matching-cells";
import {
	changeColumnType,
	clearCells,
	deleteColumns,
	deleteEmptyRowsAndColumns,
	deleteRows,
	duplicateColumns,
	duplicateRows,
	fillRange,
	insertColumns,
	insertRows,
	moveColumns,
	moveRows,
	pasteMatrix,
	promoteFirstRowToHeader,
	type SortDirection,
	setAlignment,
	setCell,
	setCellType,
	setHeader,
	sortRows,
	transposeDocument,
	transposeTypedValueCount,
} from "@/core/operations";
import {
	activeRange,
	type CellPosition,
	type CellRect,
	clampSelection,
	createRange,
	createSelection,
	extendActiveRange,
	type GridSelection,
	isContiguous,
	moveFocusKeepingRegions,
	positionAfterRemoval,
	rectDataRows,
	remapSelectionRows,
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
	transposedPosition,
} from "@/core/selection";
import {
	applyFillSeries as applySeriesPlan,
	captureFillSeriesOffer,
	type FillSeriesOffer,
	type FillSeriesRefusal,
	planFillSeries,
	planOfferedSeries,
} from "@/core/series";
import { validateTableName } from "@/core/table-name";
import type {
	Alignment,
	CellValue,
	CellValueType,
	ColumnId,
	ExpectedColumnType,
	InlineMark,
	TableDocument,
	TextContent,
} from "@/core/types";
import { canSerialize } from "@/formats";
import type {
	CodecId,
	OutputOptionId,
	OutputOptions,
	ParseIssue,
	PreconditionFailure,
	Spelling,
} from "@/formats/types";
import { defaultOutputOptions } from "@/formats/types";
import type { HistoryDirection } from "@/history/coordinator";
import {
	type HistoryEntry,
	reconcileColumnPreferences,
	recordStep,
	type SelectionRestore,
	stepTimeline,
	timelineForParse,
	workspaceForEntry,
} from "@/history/timeline";
import {
	createImportedDocument,
	droppedFormatting,
	type ImportError,
	type PreparedImport,
	prepareImport,
	tableShapeLimitError,
} from "@/import/prepare";
import type { PersistenceFailureReason } from "@/persistence/schema";
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
import {
	cancelInvalidGrace,
	type Draft,
	deriveDraft,
	readDraft,
	restoreDraft,
	revealInvalid,
	startInvalidGrace,
} from "@/sync/draft";
import {
	plainEditableViews,
	plainViewsSignature,
} from "@/views/projection-loss";
import { editableViewForCodec, getView } from "@/views/registry";
import type { ViewId } from "@/views/types";
import { clampColumnWidth } from "@/workspace/column-width";
import {
	applyLayout,
	createDefaultWorkspace,
	firstPaneId,
	type LayoutId,
	movePane as moveWorkspacePane,
	openImportWorkspace,
	type PinnedGridAxis,
	paneCount,
	type SplitOption,
	smallerLayout,
	splitOptions,
	type Workspace,
} from "@/workspace/layout";
import type {
	SourceDisplayKey,
	SourceDisplayOverrides,
} from "@/workspace/source-display";
import { clampPaneZoom } from "@/workspace/zoom";

// "Nothing has been copied." One shared value rather than a fresh array each
// time, so clearing a mark that was already clear leaves state referentially
// identical and nothing downstream sees a change that did not happen.
const NO_COPIED_RANGES: readonly CellRect[] = [];

export type StructureDeletionRefusal = "last-row" | "last-column";
// Why a paste was refused. Like the refusal above, the store names the reason
// and the interface owns the words for it.
export type PasteRefusal = "single-area";

// What one pane's find bar is looking for, and, for the grid, what it found
// (#280).
//
// Transient by construction, exactly like `copiedRanges` and
// `fillSeriesOffer`: never a history step, never persisted, and never document
// state. A pane with no entry has its bar closed; opening it is what creates
// one, and closing it, closing the pane, or changing the pane's view is what
// drops one.
//
// The query is state and the results are not. What the user typed lives here
// for every pane. Where the matches are lives here only for the grid, because
// the document is what the grid searches and the store is where the document
// lives: `matches` is recomputed from it rather than patched, so it can never
// describe cells the table no longer holds, and `index` is which occurrence is
// current, `-1` when there are none. A source or preview pane searches what it
// shows, which only its own surface knows, so its entry keeps `matches` empty
// and its surface reports the count instead: see `ui/workspace/use-pane-find`.
export interface FindState {
	// The view the bar was opened on. A pane that has since changed view is
	// showing different text, so its entry no longer applies to anything.
	readonly viewId: ViewId;
	readonly query: string;
	readonly replacement: string;
	readonly caseSensitive: boolean;
	// Whether the replace row is showing. Finding is the errand the bar exists
	// for and gets a row to itself; replacing is asked for and costs a second.
	readonly replacing: boolean;
	readonly matches: readonly CellMatch[];
	readonly index: number;
}

// A pane change the user asked for that would destroy text the document has
// not read back yet. Modelled as one explicit state rather than a flag per
// action, so there is never a question of which confirmation is outstanding.
export type PendingPaneAction =
	| { readonly kind: "view"; readonly paneId: string; readonly view: ViewId }
	| { readonly kind: "close"; readonly paneId: string };

// What sorting did. "unchanged" is a real answer rather than a failure: a table
// already in that order is sorted, and saying so is what keeps the
// announcement from claiming rows moved when none did.
export type SortOutcome = "sorted" | "unchanged" | "unavailable";

// One structural edit at a named position, as a source pane's context menu
// asks for it (#255). Rows count data rows only, and -1 names the header row.
export type StructureEdit =
	| { readonly kind: "insert-row"; readonly at: number }
	| { readonly kind: "remove-row"; readonly row: number }
	| { readonly kind: "duplicate-row"; readonly row: number }
	| { readonly kind: "insert-column"; readonly at: number }
	| { readonly kind: "remove-column"; readonly column: number }
	| {
			readonly kind: "move-column";
			readonly column: number;
			readonly offset: number;
	  };

export interface PendingImport {
	readonly prepared: PreparedImport;
	// Whether the request was made from an untouched session, which is what
	// decides the arrangement the answer opens into. Captured with the request
	// because applying the document is itself work: the answer can no longer
	// ask the session whether anything had happened before it.
	readonly initialSession: boolean;
}

// What Delete empty rows and columns removed, for the interface to announce.
// Both zero means the table had nothing to remove, or nothing in it at all.
export interface EmptyRemovalCounts {
	readonly rows: number;
	readonly columns: number;
}

// Transposing swaps the two limits' roles: a table at the row ceiling would
// come out with more columns than any import may create. The shape is the one
// `transposeDocument` produces, header row included on both sides.
export function transposeLimitError(
	document: TableDocument,
): ImportError | null {
	return tableShapeLimitError({
		rows: Math.max(1, document.columns.length - 1),
		columns: document.rows.length + 1,
	});
}

// What Transpose table did: transposed, refused by the size limit, or waiting
// for the user to agree that `typedValues` first-column values become text.
export type TransposeOutcome =
	| { readonly status: "transposed" }
	| { readonly status: "refused"; readonly error: ImportError }
	| { readonly status: "confirm"; readonly typedValues: number };

// What choosing the series did. The count is what the announcement reports, and
// a refusal is why nothing was written.
export type FillSeriesOutcome =
	| { readonly ok: true; readonly count: number }
	| { readonly ok: false; readonly refusal: FillSeriesRefusal };

const STALE_SERIES: FillSeriesOutcome = { ok: false, refusal: "stale" };

export interface StatusAnnouncement {
	readonly id: string;
	readonly message: string;
}

export type StorageIssue =
	| { readonly kind: "unavailable" }
	| { readonly kind: "quota" }
	| {
			readonly kind: "unreadable";
			// Why the saved bytes could not be opened, carried as a code so the
			// interface can say whether they are old or damaged. See #32.
			readonly reason: PersistenceFailureReason;
			readonly raw: string;
			readonly replacementFailure?: "unavailable" | "quota";
	  };

export interface TabeloState {
	name: string;
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

	// The one offer a completed copy fill may leave behind: the numbers it
	// repeated could also be continued. Transient by construction, exactly like
	// `copiedRanges`: never a history step, never persisted, never document
	// state, and cleared by the next change to the document. The user has to
	// ask for the series, so until they do the copied result is the result.
	fillSeriesOffer: FillSeriesOffer | null;

	// Which set of plain views the user last dismissed the projection notice
	// for (#306), as `plainViewsSignature` spells it. Transient, never
	// persisted: the notice is a disclosure about the current workspace, and
	// opening another plain view is a new one.
	projectionNoticeDismissedFor: string | null;

	// Each open find bar's state, keyed by the id of the pane it belongs to.
	// See `FindState`.
	finds: Readonly<Record<string, FindState>>;

	storageIssue: StorageIssue | null;
	// Messages waiting to be read, oldest first. A queue rather than one slot:
	// nothing a producer says may be destroyed by whatever comes after it.
	notices: readonly TransientNotice[];
	inputError: ImportError | null;
	// What the last import or paste read with a change, such as HTML formatting
	// the product does not carry, whose text was kept without it (#306). Empty
	// when it read everything as written.
	importWarnings: readonly ParseIssue[];
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
	// changes the shape of the exported file, and a silently remembered "leave
	// the empty values out" would surprise someone weeks later. Never
	// persisted, never document state, never a history step. See docs/adr/0005.
	outputOptions: Required<OutputOptions>;
	hydrate: () => void;
	replaceUnreadableStorage: () => boolean;
	applyDocument: (
		next: TableDocument,
		selectionRestore?: SelectionRestore,
	) => void;

	// `history` names a text change the editor's own undo or redo produced, as
	// opposed to one the user typed: see `findTimelineStep`.
	setDraft: (
		paneId: string,
		viewId: ViewId,
		text: string,
		history?: HistoryDirection,
	) => void;
	discardDraft: () => void;

	setLayout: (layout: LayoutId) => void;
	setPaneView: (paneId: string, view: ViewId) => void;
	addPaneBySplit: (option: SplitOption, viewId: ViewId) => void;
	closePane: (paneId: string) => void;
	movePane: (paneId: string, destinationPaneId: string) => boolean;
	confirmPaneAction: () => void;
	setActivePane: (paneId: string) => void;
	setOutputOption: (id: OutputOptionId, value: boolean) => void;
	renameTable: (
		name: string,
	) => SaveOutcome | { readonly status: "invalid" | "blocked" };
	setPaneZoom: (paneId: string, zoom: number) => void;
	// One of a source pane's display overrides; null returns it to the global
	// default (#276).
	setPaneSourceDisplay: <Key extends SourceDisplayKey>(
		paneId: string,
		key: Key,
		value: SourceDisplayOverrides[Key],
	) => void;
	toggleColumnWrap: (columnId: string) => void;
	setAllColumnsWrap: (wrapped: boolean) => void;
	setPinnedAxis: (axis: PinnedGridAxis, pinned: boolean) => void;
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
	selectNextMatchingCell: () => {
		readonly selected: number;
		readonly total: number;
	};
	moveFocusKeepingRegions: (position: CellPosition) => void;
	setEditing: (position: CellPosition | null, seed?: string) => void;
	setEditingHeader: (index: number | null, seed?: string) => void;
	markCopiedRanges: () => void;
	clearCopiedRanges: () => void;

	editCell: (row: number, column: number, value: CellValue) => void;
	setCellType: (
		row: number,
		column: number,
		targetType: CellValueType,
	) => boolean;
	editHeader: (column: number, value: TextContent) => void;
	// Toggles one inline mark over the whole text of every selected textual
	// header and data cell, as one history step (#306). Returns what the
	// selection held before, so a refusal can say why nothing changed.
	toggleSelectionMark: (mark: InlineMark) => SelectionMarkState;
	// `scope` "column" acts on that one column whatever the grid selection
	// holds, for a source pane's column letter (#395), which names one column.
	setColumnAlignment: (
		column: number,
		align: Alignment,
		scope?: "selection" | "column",
	) => void;
	// Changes the expected type and converts every cell that can reach it
	// without loss (#392), as one history step. Returns how many cells cannot.
	// When some cannot and `convertRest` is not set, nothing changes, so the
	// caller can ask first.
	setColumnExpectedType: (
		column: number,
		expectedType: ExpectedColumnType,
		convertRest?: boolean,
		scope?: "selection" | "column",
	) => number;
	// Sorts the whole table by one column, in the document itself. The column is
	// the one whose menu was opened, never the selected columns: an action
	// reached from column C's menu sorts by C.
	sortRowsByColumn: (column: number, direction: SortDirection) => SortOutcome;
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
	// One data row named by index rather than by the grid selection, for a
	// source pane's row commands (#255). The grid selection is left alone.
	moveRowAt: (row: number, offset: number) => SelectionMoveRefusal | null;
	// The rest of a source pane's structural commands (#255), each named by
	// index and applied as one history step with the grid selection left alone.
	// The caller has already refused what the grid would refuse.
	editStructureAt: (edit: StructureEdit) => void;

	addColumnLeft: () => void;
	addColumnRight: () => void;
	removeSelectedColumns: () => void;
	duplicateSelectedColumns: () => void;
	moveSelectedColumn: (offset: number) => SelectionMoveRefusal | null;
	// Whole-table structure (#235). Each is one history step, and each moves the
	// selection to the cell the user was on, wherever that cell now is.
	// Nothing changes until the user has agreed to what the header will turn
	// into text: without `convertTypedValues`, typed values in the first column
	// come back as a count to confirm (#235).
	transposeTable: (convertTypedValues?: boolean) => TransposeOutcome;
	deleteEmptyRowsAndColumns: () => EmptyRemovalCounts;
	fillSelection: (target: CellRect) => number;
	applyFillSeries: () => FillSeriesOutcome;
	dismissFillSeriesOffer: () => void;

	openFind: (paneId: string) => void;
	closeFind: (paneId: string) => void;
	setFindQuery: (paneId: string, query: string) => void;
	setFindReplacement: (paneId: string, replacement: string) => void;
	setFindCaseSensitive: (paneId: string, caseSensitive: boolean) => void;
	setFindReplacing: (paneId: string, replacing: boolean) => void;
	// The four below act on the grid pane's find, the one whose matches the
	// store derives. See `gridFind`.
	//
	// Turn every matching cell into the grid selection, one area per cell.
	// Returns how many cells that came to.
	selectAllMatches: () => number;
	// Walk the match list, wrapping at either end. Returns the match now
	// current, so the caller can say which occurrence it reached.
	stepFindMatch: (offset: 1 | -1) => CellMatch | null;
	// Replace the current occurrence and resume past what was written. False
	// means there was nothing current to replace.
	replaceCurrentMatch: () => boolean;
	// Replace every occurrence as one document change, and say how many.
	replaceAllMatches: () => number;

	clearSelection: () => void;
	deleteSelectedStructure: () => StructureDeletionRefusal | null;
	clipboardSelection: () => ClipboardSelection;
	pasteClipboard: (payload: ClipboardPayload) => PasteRefusal | null;
	importText: (text: string, format?: CodecId) => void;
	reportInputError: (error: ImportError) => void;
	// A paste into the rich cell editor, which inserts into one cell rather
	// than writing the document, reports what it read the way a grid paste does.
	reportPasteWarnings: (warnings: readonly ParseIssue[]) => void;
	answerPendingImport: (headerRow: boolean) => void;
	cancelPendingImport: () => void;
	resetDocument: () => void;
	dismissNotice: (id: string) => void;
	pushNotice: (request: NoticeRequest) => void;
	announceStatus: (message: string) => void;
}

let statusSequence = 0;

// The match list after the document moved underneath it. Recomputing is the
// whole contract: patching offsets is how a mark ends up on the wrong
// characters, and a stale range is what makes a replace write into a cell the
// user never saw highlighted.
//
// The position is kept where it was, clamped into the new list, so an edit
// elsewhere in the table does not send the user back to the first occurrence.
function refreshFind(find: FindState, document: TableDocument): FindState {
	const matches = findMatches(document, find.query, find.caseSensitive);
	return { ...find, matches, index: clampMatchIndex(matches, find.index) };
}

const NO_FINDS: Readonly<Record<string, FindState>> = {};

// Whether the store derives this entry's matches, which it does for the view
// that searches the document. Decided by the view's kind, never its id: see
// docs/adr/0005.
function searchesDocument(find: FindState): boolean {
	return getView(find.viewId).kind === "grid";
}

// The grid pane's entry and its pane id. A workspace holds at most one grid
// pane, and entries follow the workspace, so there is at most one of these.
function gridFindEntry(
	finds: Readonly<Record<string, FindState>>,
): readonly [string, FindState] | null {
	for (const entry of Object.entries(finds)) {
		if (searchesDocument(entry[1])) return entry;
	}
	return null;
}

// The grid pane's find state, or null while its bar is closed.
export function gridFind(state: Pick<TabeloState, "finds">): FindState | null {
	return gridFindEntry(state.finds)?.[1] ?? null;
}

// Every entry after the document moved underneath it. Only the grid's has
// results here to recompute; a source or preview surface recounts its own.
function refreshFinds(
	finds: Readonly<Record<string, FindState>>,
	document: TableDocument,
): Readonly<Record<string, FindState>> {
	const entry = gridFindEntry(finds);
	if (!entry) return finds;
	return { ...finds, [entry[0]]: refreshFind(entry[1], document) };
}

// The entries whose pane still shows the view its bar was opened on. Returns
// the same object when nothing was dropped, so an unchanged workspace is not
// a state change.
function findsForWorkspace(
	finds: Readonly<Record<string, FindState>>,
	workspace: Workspace,
): Readonly<Record<string, FindState>> {
	const kept: Record<string, FindState> = {};
	let dropped = false;
	for (const [paneId, find] of Object.entries(finds)) {
		if (
			workspace.panes.some(
				(pane) => pane.id === paneId && pane.view === find.viewId,
			)
		) {
			kept[paneId] = find;
		} else {
			dropped = true;
		}
	}
	return dropped ? kept : finds;
}

// Changing what is being looked for starts the walk again at the first
// occurrence, and moves the grid there. The previous position was about a
// different query, so carrying it over would report a place the user never
// navigated to.
function searchedState(
	state: TabeloState,
	paneId: string,
	change: Partial<Pick<FindState, "query" | "caseSensitive">>,
): Partial<TabeloState> {
	const find = state.finds[paneId];
	if (!find) return {};
	const next = { ...find, ...change };
	// A surface that searches its own text moves itself: the store only holds
	// what the user asked for.
	if (!searchesDocument(next)) {
		return { finds: { ...state.finds, [paneId]: next } };
	}
	const matches = findMatches(state.document, next.query, next.caseSensitive);
	const match = matches[0];
	return {
		finds: {
			...state.finds,
			[paneId]: { ...next, matches, index: match ? 0 : -1 },
		},
		// Navigation replaces the selection while the bar keeps DOM focus, so
		// the grid follows without the input losing the caret.
		...(match
			? {
					selection: createSelection(matchPosition(match)),
					editing: null,
					editingSeed: null,
					editingHeader: null,
				}
			: {}),
	};
}

function clampMatchIndex(matches: readonly CellMatch[], index: number): number {
	if (matches.length === 0) return -1;
	return Math.min(Math.max(index, 0), matches.length - 1);
}

// The occurrence the bar is on, or null when the query found nothing.
export function currentMatch(find: FindState | null): CellMatch | null {
	return find?.matches[find.index] ?? null;
}

// Where the match sits in the grid's own coordinate space. The header row is
// already `HEADER_ROW` in a match, so the two spaces are the same one.
function matchPosition(match: CellMatch): CellPosition {
	return { row: match.row, column: match.column };
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

// Removing one pane, expressed as the smaller preset that keeps every other
// pane where it is. Returns nothing when there is no smaller shape to move to,
// which is what leaves Close view disabled at one pane.
// The offer names cells in the visual grid, so it belongs to a workspace that
// still shows one. Once the last grid pane is gone the choice has nowhere to
// land, and a notice offering it would outlive the surface it describes.
function offerSurvivingWorkspace(
	state: TabeloState,
	workspace: Workspace,
): FillSeriesOffer | null {
	if (!state.fillSeriesOffer) return null;
	return workspace.panes.some((pane) => getView(pane.view).kind === "grid")
		? state.fillSeriesOffer
		: null;
}

function closedPaneState(
	state: TabeloState,
	paneId: string,
): Pick<
	TabeloState,
	"workspace" | "draft" | "pendingPaneAction" | "fillSeriesOffer"
> | null {
	const layout = smallerLayout(state.workspace.layout);
	const remaining = state.workspace.panes.filter((pane) => pane.id !== paneId);
	if (!layout || remaining.length === state.workspace.panes.length) return null;

	const panes = applyLayout(layout, remaining, state.draft?.paneId);
	const workspace = {
		...state.workspace,
		layout,
		panes,
		activePaneId: panes.some((pane) => pane.id === state.workspace.activePaneId)
			? state.workspace.activePaneId
			: firstPaneId(panes),
	};
	return {
		workspace,
		draft: state.draft?.paneId === paneId ? null : state.draft,
		pendingPaneAction: null,
		fillSeriesOffer: offerSurvivingWorkspace(state, workspace),
	};
}

function savePayload(state: TabeloState): SavePayload {
	return {
		name: state.name,
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
	spelling: Spelling = {},
): TextProjection {
	const codec = getView(viewId).codec;
	if (!codec) return { ok: true, text: "" };
	const failure = canSerialize(codec, document);
	// No output options reach this serialize call, and none ever should: a
	// pane always shows a codec's lossless default, never a download's chosen
	// options. A codec may declare output options that are lossy by design,
	// existing purely so a download can offer them; only the download dialog
	// narrows the user's choices in, through outputOptionsFor. Passing them
	// here would make a pane show text its own codec cannot parse back. A
	// spelling does reach it (#397): it is lossless, and the pane shows the
	// spelling every other output of the format writes.
	return failure
		? { ok: false, failure }
		: { ok: true, text: codec.serialize(document, spelling) };
}

// The exact text a pane is showing. A pane owning an uncommitted draft is
// displaying that draft, not the last valid parse, so copying it must hand
// over what is on screen: including source that does not parse. Every other
// pane is a pure projection of the document.
export function visibleTextForPane(
	state: Pick<TabeloState, "document" | "draft">,
	paneId: string,
	viewId: ViewId,
	spelling: Spelling = {},
): TextProjection {
	const draft = state.draft;
	return draft?.paneId === paneId && draft.viewId === viewId
		? { ok: true, text: draft.text }
		: textForView(state.document, viewId, spelling);
}

export function hasSessionWork(
	state: Pick<TabeloState, "hasHeldContent" | "draft">,
): boolean {
	return state.hasHeldContent || state.draft !== null;
}

// Whether nothing in this visit has been worked on yet, which is what makes the
// next import the first content the session receives. The session predicate
// rather than present blankness: emptying a table or undoing back past it does
// not turn the next paste into a first import.
function isInitialSession(
	state: Pick<TabeloState, "document" | "hasHeldContent" | "draft">,
): boolean {
	return isDocumentBlank(state.document) && !hasSessionWork(state);
}

// What accepting an import leaves behind, whichever path answered the header
// question. The first content a session receives also decides the arrangement:
// the format it arrived in beside the visual table it became. Content no
// editable view owns, plain text and Tabelo's own clipboard payload, keeps
// whatever arrangement is already open.
function importedWorkspaceState(
	workspace: Workspace,
	source: ClipboardSource,
	initialSession: boolean,
): Pick<TabeloState, "selection" | "workspace"> {
	const view = initialSession ? editableViewForCodec(source) : null;
	return {
		selection: createSelection({ row: 0, column: 0 }),
		workspace: view ? openImportWorkspace(workspace, view.id) : workspace,
	};
}

export const useTabeloStore = create<TabeloState>((set, get) => ({
	name: DEFAULT_TABLE_NAME,
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
	fillSeriesOffer: null,
	projectionNoticeDismissedFor: null,
	finds: NO_FINDS,

	storageIssue: null,
	notices: [],
	inputError: null,
	importWarnings: [],
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
				name: outcome.state.name,
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
				finds: NO_FINDS,
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
			set({
				storageIssue: {
					kind: "unreadable",
					reason: outcome.reason,
					raw: outcome.raw,
				},
			});
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
	applyDocument: (next, selectionRestore) => {
		if (next === get().document) return;
		cancelInvalidGrace();
		set((state) => ({
			...recordStep(state, selectionRestore),
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
			fillSeriesOffer: null,
			// The bar stays open across an edit: the query is still what the user
			// is looking for. Only what it found is recomputed.
			finds: refreshFinds(state.finds, next),
			selection: clampSelection(
				selectionRestore ? selectionRestore.after : state.selection,
				next.rows.length,
				next.columns.length,
			),
		}));
	},

	setDraft: (paneId, viewId, text, history) => {
		const state = get();
		const owner = { paneId, viewId };
		const read = readDraft(
			state.draft,
			state.document,
			state.workspace,
			owner,
			text,
		);
		if (!read) return;

		if (!read.ok) {
			if (read.grace !== "keep") cancelInvalidGrace();
			set((current) => ({
				draft: read.draft,
				pendingPaneAction: null,
				...(read.displacesInvalid ? recordStep(current) : {}),
			}));
			if (read.grace === "start") {
				startInvalidGrace(() =>
					set((current) => {
						const draft = revealInvalid(current.draft, owner);
						return draft ? { draft } : {};
					}),
				);
			}
			return;
		}

		cancelInvalidGrace();
		const { timeline, target } = timelineForParse(state, read.document, {
			history,
			reconciliation: read.reconciliation,
			owner,
			displacesInvalid: read.displacesInvalid,
		});
		const next = timeline.document;

		set((current) => ({
			...timeline,
			hasHeldContent: current.hasHeldContent || !isDocumentBlank(next),
			workspace: target
				? workspaceForEntry(current.workspace, current.document, target)
				: reconcileColumnPreferences(current.workspace, next),
			draft: read.draft,
			pendingImport: null,
			inputError: null,
			pendingPaneAction: null,
			copiedRanges: NO_COPIED_RANGES,
			fillSeriesOffer: null,
			selection: clampSelection(
				current.selection,
				next.rows.length,
				next.columns.length,
			),
		}));
	},

	discardDraft: () => {
		cancelInvalidGrace();
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

		set((current) => {
			const workspace = {
				...current.workspace,
				panes: current.workspace.panes.map((candidate) =>
					candidate.id === paneId ? { ...candidate, view } : candidate,
				),
				activePaneId: paneId,
			};
			return {
				workspace,
				pendingPaneAction: null,
				fillSeriesOffer: offerSurvivingWorkspace(current, workspace),
			};
		});
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
		cancelInvalidGrace();
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

	renameTable: (name) => {
		const validated = validateTableName(name);
		if (!validated.ok) return { status: "invalid" };
		const state = get();
		if (state.storageIssue?.kind === "unreadable") {
			return { status: "blocked" };
		}
		if (validated.name === state.name) return { status: "saved" };
		const outcome = saveState({ ...savePayload(state), name: validated.name });
		if (outcome.status === "saved") {
			set({ name: validated.name, storageIssue: null });
		} else {
			set({ storageIssue: { kind: outcome.status } });
		}
		return outcome;
	},

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

	// A pane's source display is presentation. It is persisted with the pane but
	// never changes the document or consumes a document-history step, and an
	// unchanged value writes nothing.
	setPaneSourceDisplay: (paneId, key, value) =>
		set((state) => {
			const target = state.workspace.panes.find((pane) => pane.id === paneId);
			if (!target || target[key] === value) return state;
			return {
				workspace: {
					...state.workspace,
					panes: state.workspace.panes.map((pane) =>
						pane.id === paneId ? { ...pane, [key]: value } : pane,
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

	// Every column at once, through the same per-column record, so there is one
	// answer to "does this column wrap" and no grid-wide flag to reconcile with
	// it (#360).
	setAllColumnsWrap: (wrapped) =>
		set((state) => ({
			workspace: {
				...state.workspace,
				wrappedColumns: wrapped
					? state.document.columns.map((column) => column.id)
					: [],
			},
		})),

	// Pinning is a workspace display preference like wrapping above it: it never
	// touches the document, so it consumes no history step and reaches no codec.
	setPinnedAxis: (axis, pinned) =>
		set((state) => {
			const key =
				axis === "row" ? "pinFirstDataRow" : ("pinFirstDataColumn" as const);
			if (state.workspace[key] === pinned) return state;
			return { workspace: { ...state.workspace, [key]: pinned } };
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
		cancelInvalidGrace();
		set((state) => {
			const step = stepTimeline(state, "undo");
			if (!step) return state;
			const { timeline, target: entry } = step;
			const restore = entry.selectionRestore;
			return {
				...timeline,
				hasHeldContent:
					state.hasHeldContent || !isDocumentBlank(entry.document),
				workspace: workspaceForEntry(state.workspace, state.document, entry),
				draft: restoreDraft(entry.draft, state.workspace),
				pendingImport: null,
				inputError: null,
				pendingPaneAction: null,
				copiedRanges: NO_COPIED_RANGES,
				fillSeriesOffer: null,
				finds: refreshFinds(state.finds, entry.document),
				selection: clampSelection(
					restore ? restore.before : state.selection,
					entry.document.rows.length,
					entry.document.columns.length,
				),
			};
		});
	},

	redo: () => {
		cancelInvalidGrace();
		set((state) => {
			const step = stepTimeline(state, "redo");
			if (!step) return state;
			const { timeline, target: entry } = step;
			const restore = entry.selectionRestore;
			return {
				...timeline,
				hasHeldContent:
					state.hasHeldContent || !isDocumentBlank(entry.document),
				workspace: workspaceForEntry(state.workspace, state.document, entry),
				draft: restoreDraft(entry.draft, state.workspace),
				pendingImport: null,
				inputError: null,
				pendingPaneAction: null,
				copiedRanges: NO_COPIED_RANGES,
				fillSeriesOffer: null,
				finds: refreshFinds(state.finds, entry.document),
				selection: clampSelection(
					restore ? restore.after : state.selection,
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

	// Mod+D in the grid (#361). The rule lives in core/matching-cells.ts; this
	// applies its result and returns the counts for the interface to announce.
	selectNextMatchingCell: () => {
		const state = get();
		const step = nextMatchingCell(state.document, state.selection);
		if (step.selection) {
			set({
				selection: step.selection,
				editing: null,
				editingSeed: null,
				editingHeader: null,
			});
		}
		return { selected: step.selected, total: step.total };
	},

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

	setCellType: (row, column, targetType) => {
		const state = get();
		const next = setCellType(state.document, row, column, targetType);
		if (next === state.document) return false;
		state.applyDocument(next);
		return true;
	},

	editHeader: (column, value) =>
		get().applyDocument(setHeader(get().document, column, value)),

	toggleSelectionMark: (mark) => {
		const state = get();
		const rects = currentRects(state);
		const before = selectionMarkState(state.document, rects, mark);
		state.applyDocument(toggleMarkInCells(state.document, rects, mark));
		return before;
	},

	// Alignment and width belong to a column rather than to a rectangle of
	// cells, so acting on one the selection already covers acts on every
	// selected column, adjacent or not. Acting on a column outside the selection
	// touches only that one: a drag on an unrelated column edge must not resize
	// something elsewhere in the table.
	setColumnAlignment: (column, align, scope = "selection") => {
		const state = get();
		let next = state.document;
		const targets =
			scope === "column" ? [column] : columnTargets(state, column);
		for (const target of targets) {
			next = setAlignment(next, target, align);
		}
		state.applyDocument(next);
	},

	setColumnExpectedType: (
		column,
		expectedType,
		convertRest = false,
		scope = "selection",
	) => {
		const state = get();
		let next = state.document;
		let unconverted = 0;
		const targets =
			scope === "column" ? [column] : columnTargets(state, column);
		for (const target of targets) {
			const change = changeColumnType(next, target, expectedType);
			next = change.document;
			unconverted += change.unconverted;
		}
		if (unconverted > 0 && !convertRest) return unconverted;
		state.applyDocument(next);
		return unconverted;
	},

	sortRowsByColumn: (column, direction) => {
		const state = get();
		const target = state.document.columns[column];
		if (!target || state.document.rows.length < 2) return "unavailable";

		const { document, nextRowOf } = sortRows(
			state.document,
			target.id,
			direction,
		);
		if (document === state.document) return "unchanged";

		// One commit, so the reorder and the selection that survives it are one
		// history step rather than two.
		state.applyDocument(document, {
			before: state.selection,
			after: remapSelectionRows(
				state.selection,
				nextRowOf,
				document.rows.length,
				document.columns.length,
			),
		});
		return "sorted";
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

	// Removing the header row is not a refusal: the row below it is promoted
	// into it. Both the menu and the keyboard come through here, so promotion is
	// a rule of the operation rather than a special case one entry point knows.
	//
	// Removal runs before promotion, and the order is the whole behaviour for a
	// range covering the header and the rows under it: the row that becomes the
	// header is the first row the selection did not take, not the first row it
	// did. One document reaches `applyDocument`, so the pair is one undo step.
	removeSelectedRows: () => {
		const state = get();
		const rows = currentDataRows(state);
		const promotes = currentCoversHeader(state);
		if (rows.length === 0 && !promotes) return;

		const remaining = deleteRows(state.document, rows);
		const next = promotes ? promoteFirstRowToHeader(remaining) : remaining;
		if (next === state.document) return;

		const column = currentRect(state).left;
		state.applyDocument(next);
		// The rows the selection named are gone and the header now holds what the
		// user deleted their way to, so the selection lands on the first data row
		// rather than on the header it just replaced.
		if (promotes) set({ selection: createSelection({ row: 0, column }) });
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

	// The grid's own guard decides the refusal, so a source pane and the grid
	// can never disagree about which moves exist. One `applyDocument` makes the
	// move one history step, carrying the displaced draft as any table edit does.
	moveRowAt: (row, offset) => {
		const state = get();
		const refusal = selectionMoveRefusal(
			createSelection({ row, column: 0 }),
			state.document.rows.length,
			state.document.columns.length,
			"row",
			offset,
		);
		if (refusal) return refusal;
		state.applyDocument(
			moveRows(state.document, { from: row, count: 1 }, offset),
		);
		return null;
	},

	// Removing the header row promotes the first data row into it in the same
	// step, exactly as the grid's removal does (AGENTS.md, one header row).
	editStructureAt: (edit) => {
		const state = get();
		const { document } = state;
		switch (edit.kind) {
			case "insert-row":
				state.applyDocument(insertRows(document, edit.at));
				return;
			case "remove-row":
				state.applyDocument(
					edit.row < 0
						? promoteFirstRowToHeader(document)
						: deleteRows(document, [edit.row]),
				);
				return;
			case "duplicate-row": {
				const error = tableShapeLimitError({
					rows: document.rows.length + 1,
					columns: document.columns.length,
				});
				if (error) {
					set({ inputError: error });
					return;
				}
				state.applyDocument(duplicateRows(document, [edit.row]));
				return;
			}
			case "insert-column":
				state.applyDocument(insertColumns(document, edit.at));
				return;
			case "remove-column":
				state.applyDocument(deleteColumns(document, [edit.column]));
				return;
			case "move-column":
				state.applyDocument(
					moveColumns(document, { from: edit.column, count: 1 }, edit.offset),
				);
				return;
		}
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

	transposeTable: (convertTypedValues = false) => {
		const state = get();
		const error = transposeLimitError(state.document);
		if (error) {
			set({ inputError: error });
			return { status: "refused", error };
		}
		const typedValues = transposeTypedValueCount(state.document);
		if (typedValues > 0 && !convertTypedValues) {
			return { status: "confirm", typedValues };
		}
		const focus = activeRange(state.selection).focus;
		state.applyDocument(transposeDocument(state.document), {
			before: state.selection,
			after: createSelection(transposedPosition(focus)),
		});
		return { status: "transposed" };
	},

	deleteEmptyRowsAndColumns: () => {
		const state = get();
		const { document, keptRows, keptColumns } = deleteEmptyRowsAndColumns(
			state.document,
		);
		if (document === state.document) return { rows: 0, columns: 0 };
		const focus = activeRange(state.selection).focus;
		state.applyDocument(document, {
			before: state.selection,
			after: createSelection(
				positionAfterRemoval(focus, keptRows, keptColumns),
			),
		});
		return {
			rows: state.document.rows.length - keptRows.length,
			columns: state.document.columns.length - keptColumns.length,
		};
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
		// The offer rides along with the fill's own `set`, after
		// `applyDocument` has cleared whatever an earlier fill left, so the
		// document and the offer describing it are never one step apart.
		// A source that is not typed numbers leaves it null and the copied
		// result is simply the result.
		const series = planFillSeries(next, source, target);
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
			fillSeriesOffer: series.ok
				? captureFillSeriesOffer(next, source, target)
				: null,
		});
		const targetSize =
			(target.bottom - target.top + 1) * (target.right - target.left + 1);
		const sourceSize =
			(source.bottom - source.top + 1) * (source.right - source.left + 1);
		return targetSize - sourceSize;
	},

	// The second step, and only when the user asks for it. Eligibility is checked
	// again here rather than trusted from the offer: the answer belongs to the
	// document as it is now, not as it was when the fill finished.
	applyFillSeries: () => {
		const state = get();
		const offer = state.fillSeriesOffer;
		if (!offer) return STALE_SERIES;

		const series = planOfferedSeries(state.document, offer);
		if (!series.ok) {
			set({ fillSeriesOffer: null });
			return { ok: false, refusal: series.refusal };
		}

		const next = applySeriesPlan(state.document, series.plan);
		if (next === state.document) {
			set({ fillSeriesOffer: null });
			return STALE_SERIES;
		}

		// Its own `applyDocument` call, so undo returns to the copied result
		// before it returns to the table before the fill. The same call clears
		// the offer, and the selection the fill left behind survives it.
		state.applyDocument(next);
		return { ok: true, count: series.plan.writes.length };
	},

	dismissFillSeriesOffer: () => set({ fillSeriesOffer: null }),

	// Opening an already-open bar changes nothing: the query the user built is
	// what they came back to, and the surface focuses its own input. A pane
	// that does not exist has no bar to open.
	openFind: (paneId) =>
		set((state) => {
			if (state.finds[paneId]) return {};
			const pane = state.workspace.panes.find(
				(candidate) => candidate.id === paneId,
			);
			if (!pane) return {};
			return {
				finds: {
					...state.finds,
					[paneId]: {
						viewId: pane.view,
						query: "",
						replacement: "",
						caseSensitive: false,
						replacing: false,
						matches: [],
						index: -1,
					},
				},
			};
		}),

	// The selection stays where the last match left it. Restoring what was
	// selected before the bar opened would put the user back somewhere they
	// have since navigated away from.
	closeFind: (paneId) =>
		set((state) => {
			if (!state.finds[paneId]) return {};
			const { [paneId]: _closed, ...rest } = state.finds;
			return { finds: rest };
		}),

	setFindQuery: (paneId, query) =>
		set((state) => searchedState(state, paneId, { query })),
	setFindCaseSensitive: (paneId, caseSensitive) =>
		set((state) => searchedState(state, paneId, { caseSensitive })),

	setFindReplacement: (paneId, replacement) =>
		set((state) => {
			const find = state.finds[paneId];
			return find
				? { finds: { ...state.finds, [paneId]: { ...find, replacement } } }
				: {};
		}),

	setFindReplacing: (paneId, replacing) =>
		set((state) => {
			const find = state.finds[paneId];
			return find
				? { finds: { ...state.finds, [paneId]: { ...find, replacing } } }
				: {};
		}),

	// One area per matching cell, not per occurrence: a cell holding the query
	// twice is still one cell, and the grid counts coverage rather than overlap.
	// The cell the bar was on stays the focused one, so selecting everything
	// does not also move the user somewhere else.
	selectAllMatches: () => {
		const state = get();
		const find = gridFind(state);
		if (!find || find.matches.length === 0) return 0;

		const cells = new Map<string, CellPosition>();
		for (const match of find.matches) {
			cells.set(`${match.row}:${match.column}`, matchPosition(match));
		}
		const positions = [...cells.values()];
		const ranges = positions.map((position) => createRange(position, "cell"));
		const current = currentMatch(find);
		const activeIndex = current
			? Math.max(
					0,
					positions.findIndex(
						(position) =>
							position.row === current.row &&
							position.column === current.column,
					),
				)
			: 0;

		set({
			selection: { ranges, activeIndex },
			editing: null,
			editingSeed: null,
			editingHeader: null,
		});
		return ranges.length;
	},

	stepFindMatch: (offset) => {
		const state = get();
		const entry = gridFindEntry(state.finds);
		if (!entry) return null;
		const [paneId, find] = entry;
		if (find.matches.length === 0) return null;
		// Wrapping in both directions, so the ends of the table are not dead
		// stops: the count is what says where the user is.
		const total = find.matches.length;
		const index = (find.index + offset + total) % total;
		const match = find.matches[index];
		if (!match) return null;
		set({
			finds: { ...state.finds, [paneId]: { ...find, index } },
			selection: createSelection(matchPosition(match)),
			editing: null,
			editingSeed: null,
			editingHeader: null,
		});
		return match;
	},

	// One occurrence, through the same document funnel every other cell edit
	// uses, so it is one history step. What comes back is recomputed from the
	// new document, and the position resumes past the text just written: a
	// replacement that contains the query must not leave Replace pressing on
	// top of itself.
	replaceCurrentMatch: () => {
		const state = get();
		const entry = gridFindEntry(state.finds);
		if (!entry) return false;
		const [paneId, find] = entry;
		const match = currentMatch(find);
		if (!match) return false;

		const next = replaceMatches(state.document, [match], find.replacement);
		if (next === state.document) return false;
		state.applyDocument(next);

		const finds = get().finds;
		const applied = finds[paneId];
		if (!applied) return true;
		const index = matchIndexFrom(
			applied.matches,
			positionAfterReplacement(match, find.replacement),
		);
		const resumed = applied.matches[index];
		set({
			finds: { ...finds, [paneId]: { ...applied, index } },
			...(resumed
				? {
						selection: createSelection(matchPosition(resumed)),
						editing: null,
						editingSeed: null,
						editingHeader: null,
					}
				: {}),
		});
		return true;
	},

	// Every occurrence in one document change, so undo returns the whole table
	// rather than unwinding the replacements one at a time.
	replaceAllMatches: () => {
		const state = get();
		const find = gridFind(state);
		if (!find || find.matches.length === 0) return 0;

		const count = find.matches.length;
		const next = replaceMatches(state.document, find.matches, find.replacement);
		if (next === state.document) return 0;
		state.applyDocument(next);
		return count;
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
		// The last-row guard protects a table from losing every row it has. A
		// selection covering the header row is not that: it promotes, and
		// promotion always leaves a header over a row, so the guard would refuse
		// an operation that cannot reach the state it exists to prevent.
		if (!currentCoversHeader(state) && guard.wouldRemoveAllRows) {
			return "last-row";
		}
		state.removeSelectedRows();
		return null;
	},

	// The rows and columns the selection covers, as a well-formed table. A gap
	// between two selected columns closes rather than travelling to the
	// clipboard as a ragged payload, so pasting the result back produces exactly
	// the columns that were selected. Excel and Google Sheets do the same.
	//
	// Values leave with their types rather than as text. Projecting them here
	// would decide, on the way out, that a number is the digits it happens to
	// look like, and nothing downstream could tell the two apart again.
	clipboardSelection: () => {
		const state = get();
		const rowCount = state.document.rows.length;
		const columnCount = state.document.columns.length;
		const columns = selectionColumns(state.selection, rowCount, columnCount)
			.map((index) => state.document.columns[index])
			.filter((column) => column !== undefined);

		const body = selectionDataRows(state.selection, rowCount, columnCount)
			.map((index) => state.document.rows[index])
			.filter((row) => row !== undefined)
			.map((row) => columns.map((column) => readCell(row, column.id)));

		// A selection that covers the header carries it, which is what makes the
		// result useful when pasted somewhere else. Whole columns always do.
		const matrix = selectionCoversHeader(state.selection, rowCount, columnCount)
			? [columns.map((column) => column.header), ...body]
			: body;

		// Headers are names rather than typed cells, so the expectations describe
		// the columns themselves and stay aligned with them either way.
		return {
			matrix,
			expectedTypes: columns.map((column) => column.expectedType),
		};
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
			const initialSession = isInitialSession(state);
			if (prepared.value.headerRow === undefined) {
				set({
					pendingImport: { prepared: prepared.value, initialSession },
					inputError: null,
				});
				return null;
			}
			const document = createImportedDocument(
				prepared.value,
				prepared.value.headerRow,
			);
			state.applyDocument(document);
			// Read after the document is applied, so the arrangement builds on the
			// workspace whose column preferences reconciliation has just updated.
			set((current) => ({
				...importedWorkspaceState(
					current.workspace,
					prepared.value.source,
					initialSession,
				),
				importWarnings: droppedFormatting(prepared.value.warnings),
			}));
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
		set({ importWarnings: droppedFormatting(prepared.value.warnings) });
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

		const initialSession = isInitialSession(state);
		if (prepared.value.headerRow === undefined) {
			set({
				pendingImport: { prepared: prepared.value, initialSession },
				inputError: null,
			});
			return;
		}
		const document = createImportedDocument(
			prepared.value,
			prepared.value.headerRow,
		);
		state.applyDocument(document);
		set((current) => ({
			...importedWorkspaceState(
				current.workspace,
				prepared.value.source,
				initialSession,
			),
			importWarnings: droppedFormatting(prepared.value.warnings),
		}));
	},

	reportInputError: (error) => set({ inputError: error }),
	reportPasteWarnings: (warnings) =>
		set({ importWarnings: droppedFormatting(warnings) }),

	answerPendingImport: (headerRow) => {
		const state = get();
		const pending = state.pendingImport;
		if (!pending) return;
		// Work done while the question was open, a draft typed into a source pane,
		// costs the request its opening arrangement: the session is no longer
		// untouched. Asked of the state before the document lands, because
		// applying it is what sets the held-content flag.
		const initialSession = pending.initialSession && isInitialSession(state);
		state.applyDocument(createImportedDocument(pending.prepared, headerRow));
		set((current) => ({
			...importedWorkspaceState(
				current.workspace,
				pending.prepared.source,
				initialSession,
			),
			importWarnings: droppedFormatting(pending.prepared.warnings),
		}));
	},

	cancelPendingImport: () => set({ pendingImport: null }),

	resetDocument: () => {
		get().applyDocument(createEmptyDocument());
		set({
			name: DEFAULT_TABLE_NAME,
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
				case conditionNoticeIds.importWarnings:
					return { importWarnings: [] };
				case conditionNoticeIds.pendingPaneAction:
					return { pendingPaneAction: null };
				case conditionNoticeIds.fillSeries:
					return { fillSeriesOffer: null };
				case conditionNoticeIds.projectionLoss:
					return {
						projectionNoticeDismissedFor: plainViewsSignature(
							plainEditableViews(
								state.workspace.panes.map((pane) => pane.view),
							),
						),
					};
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

function currentCoversHeader(state: TabeloState) {
	return selectionCoversHeader(
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

// A find bar belongs to one pane showing one view, so it goes when either
// does: the pane closing, its view changing, a layout that removes it, an
// import that rearranges the workspace, or a reload. One subscription rather
// than a line in every action that can change the workspace, so a path added
// later cannot forget it and leave an entry keyed by a pane that is gone.
useTabeloStore.subscribe((state, previous) => {
	if (state.workspace === previous.workspace && state.finds === previous.finds)
		return;
	const finds = findsForWorkspace(state.finds, state.workspace);
	if (finds !== state.finds) useTabeloStore.setState({ finds });
});

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
			state.name === previous.name &&
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
