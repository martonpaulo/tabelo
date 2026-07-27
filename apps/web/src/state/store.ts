import { create } from "zustand";
import type { ClipboardPayload } from "@/clipboard/parse";
import {
	createEmptyDocument,
	documentToMatrix,
	isDocumentBlank,
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
import type { CodecId, ParseIssue } from "@/formats/types";
import {
	createImportedDocument,
	type ImportError,
	prepareImport,
} from "@/import/prepare";
import { loadState, saveState } from "@/persistence/storage";
import { getView } from "@/views/registry";
import type { ViewId } from "@/views/types";
import {
	applyLayout,
	createDefaultWorkspace,
	type LayoutId,
	type Workspace,
} from "@/workspace/layout";

// How many steps the document timeline keeps. Deep enough to cover a working
// session, bounded so a long session cannot grow without limit.
const HISTORY_LIMIT = 200;

// How long a source view waits after the last keystroke before parsing. Long
// enough that typing never thrashes the other views, short enough that they
// still feel connected to what is being written.
const COMMIT_DELAY_MS = 300;

// The text a source view is holding but has not committed. Exactly one can
// exist at a time — every other view is a pure projection of the document, so
// there is never a question of which pending edit wins.
export interface Draft {
	readonly paneId: string;
	readonly viewId: ViewId;
	readonly text: string;
}

export interface PendingPaneView {
	readonly paneId: string;
	readonly view: ViewId;
}

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

export interface TabeloState {
	document: TableDocument;
	workspace: Workspace;

	draft: Draft | null;
	issues: readonly ParseIssue[];
	warnings: readonly ParseIssue[];

	past: readonly HistoryEntry[];
	future: readonly HistoryEntry[];

	selection: GridSelection;
	editing: CellPosition | null;
	editingHeader: number | null;

	storageError: string | null;
	notice: string | null;
	inputError: ImportError | null;
	headerCorrection: HeaderCorrection | null;
	pendingPaneView: PendingPaneView | null;

	hydrate: () => void;
	applyDocument: (next: TableDocument) => void;

	setDraft: (paneId: string, viewId: ViewId, text: string) => void;
	commitDraft: () => void;
	discardDraft: () => void;

	setLayout: (layout: LayoutId) => void;
	setPaneView: (paneId: string, view: ViewId) => void;
	confirmPaneView: () => void;
	setActivePane: (paneId: string) => void;
	setColumnRatio: (ratio: number) => void;
	setRowRatio: (ratio: number) => void;

	undo: () => void;
	redo: () => void;

	setSelection: (selection: GridSelection) => void;
	selectCell: (position: CellPosition, mode?: SelectionMode) => void;
	extendSelection: (position: CellPosition) => void;
	setEditing: (position: CellPosition | null) => void;
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

let commitTimer: ReturnType<typeof setTimeout> | null = null;

function snapshotOf(state: TabeloState): HistoryEntry {
	return { document: state.document, draft: state.draft };
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

// Serializes the document for a view. Views without a codec — the grid — have
// no text projection.
export function textForView(document: TableDocument, viewId: ViewId): string {
	const codec = getView(viewId).codec;
	return codec ? codec.serialize(document) : "";
}

export const useTabeloStore = create<TabeloState>((set, get) => ({
	document: createEmptyDocument(),
	workspace: createDefaultWorkspace(),

	draft: null,
	issues: [],
	warnings: [],

	past: [],
	future: [],

	selection: createSelection({ row: 0, column: 0 }),
	editing: null,
	editingHeader: null,

	storageError: null,
	notice: null,
	inputError: null,
	headerCorrection: null,
	pendingPaneView: null,

	hydrate: () => {
		const outcome = loadState();
		if (outcome.status === "ok") {
			set({
				document: outcome.state.document,
				workspace: outcome.state.workspace,
				draft: null,
				issues: [],
				warnings: [],
				headerCorrection: null,
				inputError: null,
				pendingPaneView: null,
				selection: createSelection({ row: 0, column: 0 }),
			});
			return;
		}
		if (outcome.status === "unreadable") {
			// The stored payload stays untouched so it can be recovered by hand.
			set({ storageError: outcome.reason });
		}
	},

	// The single funnel for every structural change. A table edit always wins
	// over an uncommitted draft, and the draft it displaces is preserved in
	// history rather than dropped. See docs/adr/0001 and 0003.
	applyDocument: (next) =>
		set((state) => ({
			past: pushHistory(state.past, snapshotOf(state)),
			future: [],
			document: next,
			draft: null,
			issues: [],
			warnings: [],
			inputError: null,
			headerCorrection: null,
			pendingPaneView: null,
			selection: clampSelection(
				state.selection,
				next.rows.length,
				next.columns.length,
			),
		})),

	setDraft: (paneId, viewId, text) => {
		const pane = get().workspace.panes.find(
			(candidate) => candidate.id === paneId && candidate.view === viewId,
		);
		if (!pane) return;

		set({ draft: { paneId, viewId, text }, pendingPaneView: null });
		if (commitTimer) clearTimeout(commitTimer);
		commitTimer = setTimeout(() => get().commitDraft(), COMMIT_DELAY_MS);
	},

	commitDraft: () => {
		if (commitTimer) {
			clearTimeout(commitTimer);
			commitTimer = null;
		}
		const state = get();
		const draft = state.draft;
		if (!draft) return;

		const parse = getView(draft.viewId).codec?.parse;
		if (!parse) return;

		const result = parse(draft.text);
		if (!result.ok) {
			// Hold the last valid table. Every other view stays editable throughout.
			set({ issues: result.issues, warnings: [] });
			return;
		}

		set((current) => ({
			past: pushHistory(current.past, {
				document: current.document,
				draft: null,
			}),
			future: [],
			document: result.document,
			headerCorrection: null,
			inputError: null,
			// Deliberately keeping the draft: re-serializing would rewrite the
			// buffer the user is typing in and move their cursor. It is now equal
			// in meaning to the document, just not character-identical.
			issues: [],
			warnings: result.warnings ?? [],
			selection: clampSelection(
				current.selection,
				result.document.rows.length,
				result.document.columns.length,
			),
		}));
	},

	discardDraft: () => {
		if (commitTimer) {
			clearTimeout(commitTimer);
			commitTimer = null;
		}
		set({ draft: null, issues: [], warnings: [], pendingPaneView: null });
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

		const ownsDraft =
			state.draft?.paneId === paneId && state.draft.viewId === pane.view;
		if (ownsDraft) {
			state.commitDraft();
			const current = get();
			if (current.issues.length > 0) {
				set({ pendingPaneView: { paneId, view } });
				return;
			}
			current.discardDraft();
		}

		set((current) => ({
			workspace: {
				...current.workspace,
				panes: current.workspace.panes.map((candidate) =>
					candidate.id === paneId ? { ...candidate, view } : candidate,
				),
				activePaneId: paneId,
			},
			pendingPaneView: null,
		}));
	},

	confirmPaneView: () => {
		const state = get();
		const pending = state.pendingPaneView;
		if (!pending) return;
		state.discardDraft();
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
			pendingPaneView: null,
		}));
	},

	setActivePane: (paneId) =>
		set((state) => ({
			workspace: { ...state.workspace, activePaneId: paneId },
		})),

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

	undo: () =>
		set((state) => {
			const entry = state.past.at(-1);
			if (!entry) return state;
			return {
				past: state.past.slice(0, -1),
				future: [snapshotOf(state), ...state.future],
				document: entry.document,
				draft: entry.draft,
				issues: [],
				warnings: [],
				headerCorrection: null,
				inputError: null,
				pendingPaneView: null,
				selection: clampSelection(
					state.selection,
					entry.document.rows.length,
					entry.document.columns.length,
				),
			};
		}),

	redo: () =>
		set((state) => {
			const entry = state.future[0];
			if (!entry) return state;
			return {
				past: pushHistory(state.past, snapshotOf(state)),
				future: state.future.slice(1),
				document: entry.document,
				draft: entry.draft,
				issues: [],
				warnings: [],
				headerCorrection: null,
				inputError: null,
				pendingPaneView: null,
				selection: clampSelection(
					state.selection,
					entry.document.rows.length,
					entry.document.columns.length,
				),
			};
		}),

	setSelection: (selection) => set({ selection }),

	selectCell: (position, mode = "cell") =>
		set({
			selection: createSelection(position, mode),
			editing: null,
			editingHeader: null,
		}),

	extendSelection: (position) =>
		set((state) => ({ selection: { ...state.selection, focus: position } })),

	setEditing: (position) => set({ editing: position, editingHeader: null }),
	setEditingHeader: (index) => set({ editingHeader: index, editing: null }),

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
			if (state.pendingPaneView) return { pendingPaneView: null };
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

export function startAutosave(): () => void {
	return useTabeloStore.subscribe((state, previous) => {
		if (
			state.document === previous.document &&
			state.workspace === previous.workspace
		)
			return;

		if (saveTimer) clearTimeout(saveTimer);
		saveTimer = setTimeout(() => {
			const current = useTabeloStore.getState();
			const outcome = saveState({
				document: current.document,
				workspace: current.workspace,
			});
			if (
				outcome.status === "failed" &&
				current.storageError !== outcome.reason
			) {
				useTabeloStore.setState({ storageError: outcome.reason });
			}
		}, 500);
	});
}

export { documentToMatrix };
