import { create } from "zustand";
import { type ClipboardPayload, readClipboardTable } from "@/clipboard/parse";
import {
	createEmptyDocument,
	detectHeaderRow,
	documentFromMatrix,
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
import { getFormat } from "@/formats";
import type { ParseIssue, TextFormat } from "@/formats/types";
import { loadState, saveState } from "@/persistence/storage";

// How many steps the document timeline keeps. Deep enough to cover a working
// session, bounded so a long session cannot grow without limit.
const HISTORY_LIMIT = 200;

// How long the text panel waits after the last keystroke before parsing.
// Long enough that typing a table never thrashes the grid, short enough that
// the grid still feels connected to what you are writing.
const COMMIT_DELAY_MS = 300;

// Beyond this the app warns instead of freezing. See AGENTS.md: Tabelo targets
// roughly 200 rows and deliberately has no virtualization.
export const LARGE_TABLE_ROWS = 500;

export interface HistoryEntry {
	readonly document: TableDocument;
	// A draft that was still uncommitted when this entry was superseded.
	// Restoring it is what keeps a grid edit from destroying pending text.
	readonly draft: { readonly format: TextFormat; readonly text: string } | null;
}

export interface TabeloState {
	document: TableDocument;
	textFormat: TextFormat;
	textPanelVisible: boolean;

	draftText: string;
	draftDirty: boolean;
	issues: readonly ParseIssue[];
	warnings: readonly ParseIssue[];

	past: readonly HistoryEntry[];
	future: readonly HistoryEntry[];

	selection: GridSelection;
	editing: CellPosition | null;
	editingHeader: number | null;

	storageError: string | null;
	notice: string | null;
	// Set right after an import so the header guess can be corrected in one click.
	headerGuessPending: boolean;

	hydrate: () => void;
	applyDocument: (next: TableDocument) => void;

	setDraftText: (text: string) => void;
	commitDraft: () => void;
	setTextFormat: (format: TextFormat) => void;
	toggleTextPanel: () => void;

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

	addRow: (at?: number) => void;
	removeSelectedRows: () => void;
	duplicateSelectedRows: () => void;
	moveSelectedRow: (offset: number) => void;

	addColumn: (at?: number) => void;
	removeSelectedColumns: () => void;
	duplicateSelectedColumns: () => void;
	moveSelectedColumn: (offset: number) => void;

	clearSelection: () => void;
	copySelection: () => { text: string; matrix: string[][] };
	cutSelection: () => { text: string; matrix: string[][] };
	pasteClipboard: (payload: ClipboardPayload) => void;
	importText: (text: string, format?: TextFormat) => void;

	demoteHeader: () => void;
	resetDocument: () => void;
	dismissNotice: () => void;
}

let commitTimer: ReturnType<typeof setTimeout> | null = null;

function serialize(document: TableDocument, format: TextFormat): string {
	return getFormat(format).serialize(document);
}

function snapshotOf(state: TabeloState): HistoryEntry {
	return {
		document: state.document,
		draft: state.draftDirty
			? { format: state.textFormat, text: state.draftText }
			: null,
	};
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

export const useTabeloStore = create<TabeloState>((set, get) => {
	const initialDocument = createEmptyDocument();

	return {
		document: initialDocument,
		textFormat: "markdown",
		textPanelVisible: true,

		draftText: serialize(initialDocument, "markdown"),
		draftDirty: false,
		issues: [],
		warnings: [],

		past: [],
		future: [],

		selection: createSelection({ row: 0, column: 0 }),
		editing: null,
		editingHeader: null,

		storageError: null,
		notice: null,
		headerGuessPending: false,

		hydrate: () => {
			const outcome = loadState();
			if (outcome.status === "ok") {
				set({
					document: outcome.state.document,
					textFormat: outcome.state.textFormat,
					textPanelVisible: outcome.state.textPanelVisible,
					draftText: serialize(
						outcome.state.document,
						outcome.state.textFormat,
					),
					draftDirty: false,
					issues: [],
					warnings: [],
					selection: createSelection({ row: 0, column: 0 }),
				});
				return;
			}
			if (outcome.status === "unreadable") {
				// The stored payload stays untouched so it can be recovered by hand.
				set({ storageError: outcome.reason });
			}
		},

		// The single funnel for every structural change. A grid edit always wins
		// over an uncommitted draft, and the draft it displaces is preserved in
		// history rather than dropped. See docs/adr/0001 and 0003.
		applyDocument: (next) =>
			set((state) => ({
				past: pushHistory(state.past, snapshotOf(state)),
				future: [],
				document: next,
				draftText: serialize(next, state.textFormat),
				draftDirty: false,
				issues: [],
				warnings: [],
				selection: clampSelection(
					state.selection,
					next.rows.length,
					next.columns.length,
				),
			})),

		setDraftText: (text) => {
			set({ draftText: text, draftDirty: true });
			if (commitTimer) clearTimeout(commitTimer);
			commitTimer = setTimeout(() => get().commitDraft(), COMMIT_DELAY_MS);
		},

		commitDraft: () => {
			if (commitTimer) {
				clearTimeout(commitTimer);
				commitTimer = null;
			}
			const state = get();
			if (!state.draftDirty) return;

			const result = getFormat(state.textFormat).parse(state.draftText);
			if (!result.ok) {
				// Hold the last valid table. The grid stays editable throughout.
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
				// Deliberately not re-serializing: rewriting the buffer the user is
				// typing in would move their cursor.
				draftDirty: false,
				issues: [],
				warnings: result.warnings ?? [],
				selection: clampSelection(
					current.selection,
					result.document.rows.length,
					result.document.columns.length,
				),
			}));
		},

		setTextFormat: (format) => {
			const before = get();
			if (before.textFormat === format) return;

			// Try to keep a pending edit: commit it if it parses.
			if (before.draftDirty) get().commitDraft();
			const after = get();

			set({
				textFormat: format,
				draftText: serialize(after.document, format),
				draftDirty: false,
				issues: [],
				warnings: [],
				// A draft that still would not parse is superseded, not destroyed.
				past: after.draftDirty
					? pushHistory(after.past, snapshotOf(after))
					: after.past,
				future: after.draftDirty ? [] : after.future,
			});
		},

		toggleTextPanel: () =>
			set((state) => ({ textPanelVisible: !state.textPanelVisible })),

		undo: () =>
			set((state) => {
				const entry = state.past.at(-1);
				if (!entry) return state;

				const restored = snapshotOf(state);
				const base = {
					past: state.past.slice(0, -1),
					future: [restored, ...state.future],
					document: entry.document,
					issues: [] as readonly ParseIssue[],
					warnings: [] as readonly ParseIssue[],
					selection: clampSelection(
						state.selection,
						entry.document.rows.length,
						entry.document.columns.length,
					),
				};

				if (entry.draft) {
					return {
						...base,
						textFormat: entry.draft.format,
						draftText: entry.draft.text,
						draftDirty: true,
					};
				}
				return {
					...base,
					draftText: serialize(entry.document, state.textFormat),
					draftDirty: false,
				};
			}),

		redo: () =>
			set((state) => {
				const entry = state.future[0];
				if (!entry) return state;

				const current = snapshotOf(state);
				const base = {
					past: pushHistory(state.past, current),
					future: state.future.slice(1),
					document: entry.document,
					issues: [] as readonly ParseIssue[],
					warnings: [] as readonly ParseIssue[],
					selection: clampSelection(
						state.selection,
						entry.document.rows.length,
						entry.document.columns.length,
					),
				};

				if (entry.draft) {
					return {
						...base,
						textFormat: entry.draft.format,
						draftText: entry.draft.text,
						draftDirty: true,
					};
				}
				return {
					...base,
					draftText: serialize(entry.document, state.textFormat),
					draftDirty: false,
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
					: { document: next, draftText: state.draftText };
			}),

		addRow: (at) => {
			const state = get();
			const rect = selectionRect(
				state.selection,
				state.document.rows.length,
				state.document.columns.length,
			);
			const index = at ?? rect.bottom + 1;
			state.applyDocument(insertRows(state.document, index));
			set({ selection: createSelection({ row: index, column: rect.left }) });
		},

		removeSelectedRows: () => {
			const state = get();
			const rect = selectionRect(
				state.selection,
				state.document.rows.length,
				state.document.columns.length,
			);
			state.applyDocument(deleteRows(state.document, rectRows(rect)));
		},

		duplicateSelectedRows: () => {
			const state = get();
			const rect = selectionRect(
				state.selection,
				state.document.rows.length,
				state.document.columns.length,
			);
			state.applyDocument(duplicateRows(state.document, rectRows(rect)));
		},

		moveSelectedRow: (offset) => {
			const state = get();
			const rect = selectionRect(
				state.selection,
				state.document.rows.length,
				state.document.columns.length,
			);
			const from = rect.top;
			const to = from + offset;
			if (to < 0 || to >= state.document.rows.length) return;
			state.applyDocument(moveRow(state.document, from, to));
			set({
				selection: {
					...state.selection,
					anchor: { row: to, column: rect.left },
					focus: { row: to, column: rect.right },
				},
			});
		},

		addColumn: (at) => {
			const state = get();
			const rect = selectionRect(
				state.selection,
				state.document.rows.length,
				state.document.columns.length,
			);
			const index = at ?? rect.right + 1;
			state.applyDocument(insertColumns(state.document, index));
			set({ selection: createSelection({ row: rect.top, column: index }) });
		},

		removeSelectedColumns: () => {
			const state = get();
			const rect = selectionRect(
				state.selection,
				state.document.rows.length,
				state.document.columns.length,
			);
			state.applyDocument(deleteColumns(state.document, rectColumns(rect)));
		},

		duplicateSelectedColumns: () => {
			const state = get();
			const rect = selectionRect(
				state.selection,
				state.document.rows.length,
				state.document.columns.length,
			);
			state.applyDocument(duplicateColumns(state.document, rectColumns(rect)));
		},

		moveSelectedColumn: (offset) => {
			const state = get();
			const rect = selectionRect(
				state.selection,
				state.document.rows.length,
				state.document.columns.length,
			);
			const from = rect.left;
			const to = from + offset;
			if (to < 0 || to >= state.document.columns.length) return;
			state.applyDocument(moveColumn(state.document, from, to));
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
			const rect = selectionRect(
				state.selection,
				state.document.rows.length,
				state.document.columns.length,
			);
			state.applyDocument(clearCells(state.document, rect));
		},

		copySelection: () => {
			const state = get();
			const rect = selectionRect(
				state.selection,
				state.document.rows.length,
				state.document.columns.length,
			);
			const body = documentToMatrix(state.document, { includeHeader: false })
				.slice(rect.top, rect.bottom + 1)
				.map((row) => row.slice(rect.left, rect.right + 1));

			// Copying whole columns carries their headers, which is what makes the
			// result useful when pasted somewhere else.
			const matrix =
				state.selection.mode === "column"
					? [
							state.document.columns
								.slice(rect.left, rect.right + 1)
								.map((c) => c.header),
							...body,
						]
					: body;

			return { text: "", matrix };
		},

		cutSelection: () => {
			const result = get().copySelection();
			get().clearSelection();
			return result;
		},

		pasteClipboard: (payload) => {
			const state = get();
			const table = readClipboardTable(payload);
			if (!table || table.matrix.length === 0) return;

			if (table.matrix.length > LARGE_TABLE_ROWS) {
				set({
					notice: `That paste has ${table.matrix.length} rows. Tabelo is built for tables up to about ${LARGE_TABLE_ROWS}, so it may feel slow.`,
				});
			}

			// Into an empty document, a paste creates the table — including the
			// header decision. Into an existing one, it writes at the selection.
			if (isDocumentBlank(state.document)) {
				const headerRow = detectHeaderRow(table.matrix);
				state.applyDocument(documentFromMatrix(table.matrix, { headerRow }));
				set({
					headerGuessPending: true,
					selection: createSelection({ row: 0, column: 0 }),
				});
				return;
			}

			const rect = selectionRect(
				state.selection,
				state.document.rows.length,
				state.document.columns.length,
			);
			state.applyDocument(
				pasteMatrix(
					state.document,
					{ rowIndex: rect.top, columnIndex: rect.left },
					table.matrix,
				),
			);
		},

		importText: (text, format) => {
			const state = get();
			const table = readClipboardTable({ text });
			if (!table || table.matrix.length === 0) return;

			const headerRow = detectHeaderRow(table.matrix);
			state.applyDocument(documentFromMatrix(table.matrix, { headerRow }));
			set({
				headerGuessPending: true,
				selection: createSelection({ row: 0, column: 0 }),
				...(format ? { textFormat: format } : {}),
			});
		},

		demoteHeader: () => {
			const state = get();
			state.applyDocument(demoteHeaderToRow(state.document));
			set({ headerGuessPending: false });
		},

		resetDocument: () => {
			const next = createEmptyDocument();
			get().applyDocument(next);
			set({
				selection: createSelection({ row: 0, column: 0 }),
				headerGuessPending: false,
			});
		},

		dismissNotice: () => set({ notice: null, headerGuessPending: false }),
	};
});

// Autosave. Persisting on every keystroke would be wasteful, and persisting
// only on unload would lose work, so writes are debounced after changes settle.
let saveTimer: ReturnType<typeof setTimeout> | null = null;

export function startAutosave(): () => void {
	return useTabeloStore.subscribe((state, previous) => {
		if (
			state.document === previous.document &&
			state.textFormat === previous.textFormat &&
			state.textPanelVisible === previous.textPanelVisible
		) {
			return;
		}
		if (saveTimer) clearTimeout(saveTimer);
		saveTimer = setTimeout(() => {
			const current = useTabeloStore.getState();
			const outcome = saveState({
				document: current.document,
				textFormat: current.textFormat,
				textPanelVisible: current.textPanelVisible,
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
