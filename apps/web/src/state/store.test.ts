import { beforeEach, describe, expect, it } from "vitest";
import { documentFromMatrix, documentToMatrix } from "@/core/document";
import { samplePeopleMatrix } from "@/core/sample-data";
import {
	createSelection,
	type GridSelection,
	HEADER_ROW,
	type SelectionRange,
} from "@/core/selection";
import { hasSessionWork, useTabeloStore } from "./store";

const initialState = useTabeloStore.getInitialState();

// A selection of exactly the given regions, with the last one active. Written
// out here because these tests set a multi-cell region directly rather than
// through the gestures that build one.
function selectionOf(...ranges: readonly SelectionRange[]): GridSelection {
	return { ranges, activeIndex: ranges.length - 1 };
}

beforeEach(() => {
	useTabeloStore.setState(initialState, true);
});

describe("session content", () => {
	it("starts untouched and treats a draft as separately protected work", () => {
		const store = useTabeloStore.getState();
		expect(store.hasHeldContent).toBe(false);
		expect(hasSessionWork(store)).toBe(false);

		const paneId = store.workspace.panes.find(
			(pane) => pane.view === "markdown",
		)?.id;
		expect(paneId).toBeDefined();
		store.setDraft(paneId ?? "", "markdown", "| unfinished |");

		const withDraft = useTabeloStore.getState();
		expect(withDraft.hasHeldContent).toBe(false);
		expect(hasSessionWork(withDraft)).toBe(true);
	});

	it("becomes monotonic after a valid document holds content", () => {
		const store = useTabeloStore.getState();
		store.editCell(0, 0, "Ingrid");
		expect(useTabeloStore.getState().hasHeldContent).toBe(true);

		useTabeloStore.getState().editCell(0, 0, "");
		expect(useTabeloStore.getState().hasHeldContent).toBe(true);
		useTabeloStore.getState().undo();
		expect(useTabeloStore.getState().hasHeldContent).toBe(true);
		useTabeloStore.getState().undo();
		expect(useTabeloStore.getState().hasHeldContent).toBe(true);
		useTabeloStore.getState().redo();
		expect(useTabeloStore.getState().hasHeldContent).toBe(true);
	});

	it("recognizes successful source parsing and import, but not invalid input", () => {
		const store = useTabeloStore.getState();
		const paneId = store.workspace.panes.find(
			(pane) => pane.view === "markdown",
		)?.id;
		expect(paneId).toBeDefined();
		store.setDraft(paneId ?? "", "markdown", "| invalid |");
		expect(useTabeloStore.getState().hasHeldContent).toBe(false);

		store.setDraft(paneId ?? "", "markdown", "| Name |\n| --- |\n| Ingrid |");
		expect(useTabeloStore.getState().hasHeldContent).toBe(true);

		store.resetDocument();
		expect(useTabeloStore.getState().hasHeldContent).toBe(false);
		store.importText(
			"| Name | Role |\n| --- | --- |\n| Paulo | Designer |",
			"markdown",
		);
		expect(useTabeloStore.getState().hasHeldContent).toBe(true);
	});

	it("clears only for New table and returns when undo restores content", () => {
		const store = useTabeloStore.getState();
		store.editCell(0, 0, "Mabel");
		store.resetDocument();
		expect(useTabeloStore.getState().hasHeldContent).toBe(false);

		useTabeloStore.getState().undo();
		expect(useTabeloStore.getState().hasHeldContent).toBe(true);
	});
});

describe("transactional input", () => {
	it("preserves the document and selection after a named format failure", () => {
		useTabeloStore.setState({
			selection: createSelection({ row: 2, column: 2 }),
		});
		const before = useTabeloStore.getState();

		before.importText('Name,Note\nIngrid,"unterminated', "csv");

		const after = useTabeloStore.getState();
		expect(after.document).toBe(before.document);
		expect(after.selection).toEqual(before.selection);
		expect(after.inputError?.code).toBe("invalid-format");
	});

	it("preserves the document and selection after an oversized paste", () => {
		useTabeloStore.setState({
			selection: createSelection({ row: 1, column: 1 }),
		});
		const before = useTabeloStore.getState();
		const text = Array.from({ length: 501 }, (_, index) => `${index}`).join(
			"\n",
		);

		before.pasteClipboard({ text });

		const after = useTabeloStore.getState();
		expect(after.document).toBe(before.document);
		expect(after.selection).toEqual(before.selection);
		expect(after.inputError?.code).toBe("too-many-rows");
	});

	it("starts a whole-column paste at the first data row", () => {
		useTabeloStore.setState({
			document: documentFromMatrix(
				[
					["Name", "Role"],
					["Ingrid", "Designer"],
					["Paulo", "Engineer"],
				],
				{ headerRow: true },
			),
			selection: createSelection({ row: HEADER_ROW, column: 0 }, "column"),
		});

		useTabeloStore.getState().pasteClipboard({ text: "Mabel\nFelix\nAmora" });

		expect(documentToMatrix(useTabeloStore.getState().document)).toEqual([
			["Name", "Role"],
			["Mabel", "Designer"],
			["Felix", "Engineer"],
			["Amora", ""],
		]);
	});

	it("accepts the resulting row limit and refuses one row beyond it", () => {
		const document = documentFromMatrix(
			[["value"], ...Array.from({ length: 499 }, (_, index) => [`${index}`])],
			{ headerRow: true },
		);
		useTabeloStore.setState({
			document,
			selection: createSelection({ row: 498, column: 0 }),
		});

		useTabeloStore.getState().pasteClipboard({ text: "at limit\nlast" });
		expect(useTabeloStore.getState().document.rows).toHaveLength(500);

		useTabeloStore.setState({
			selection: createSelection({ row: 499, column: 0 }),
			draft: {
				paneId: "pending-pane",
				viewId: "markdown",
				text: "| unfinished |",
				status: "invalid",
				issues: [],
				warnings: [],
			},
		});
		const before = useTabeloStore.getState();
		before.pasteClipboard({ text: "keep\nrefuse" });

		const after = useTabeloStore.getState();
		expect(after.document).toBe(before.document);
		expect(after.selection).toEqual(before.selection);
		expect(after.past).toBe(before.past);
		expect(after.draft).toBe(before.draft);
		expect(after.inputError?.code).toBe("too-many-rows");
	});

	it("refuses row and column duplication beyond the resulting limits", () => {
		const rowLimited = documentFromMatrix(
			[["value"], ...Array.from({ length: 500 }, (_, index) => [`${index}`])],
			{ headerRow: true },
		);
		useTabeloStore.setState({
			document: rowLimited,
			selection: createSelection({ row: 0, column: 0 }, "row"),
		});
		useTabeloStore.getState().duplicateSelectedRows();
		expect(useTabeloStore.getState().document).toBe(rowLimited);
		expect(useTabeloStore.getState().inputError?.code).toBe("too-many-rows");

		const columnLimited = documentFromMatrix(
			[
				Array.from({ length: 200 }, (_, index) => `column ${index}`),
				Array.from({ length: 200 }, () => ""),
			],
			{ headerRow: true },
		);
		useTabeloStore.setState({
			document: columnLimited,
			selection: createSelection({ row: HEADER_ROW, column: 0 }, "column"),
			inputError: null,
		});
		useTabeloStore.getState().duplicateSelectedColumns();
		expect(useTabeloStore.getState().document).toBe(columnLimited);
		expect(useTabeloStore.getState().inputError?.code).toBe("too-many-columns");
	});

	it("keeps a successful import to one document-history operation", () => {
		const before = documentToMatrix(useTabeloStore.getState().document);

		useTabeloStore.getState().importText("Name,Role\nIngrid,Designer", "csv");
		useTabeloStore.getState().answerPendingImport(true);

		expect(useTabeloStore.getState().past).toHaveLength(1);
		useTabeloStore.getState().undo();
		expect(documentToMatrix(useTabeloStore.getState().document)).toEqual(
			before,
		);
	});
});

describe("document history", () => {
	it("keeps a resized column unchanged through unrelated undo and redo", () => {
		const store = useTabeloStore.getState();
		store.editCell(0, 0, "Ingrid");
		store.resizeColumn(0, 18);

		useTabeloStore.getState().undo();
		const columnId = useTabeloStore.getState().document.columns[0]?.id ?? "";
		expect(useTabeloStore.getState().workspace.columnWidths[columnId]).toBe(18);

		useTabeloStore.getState().redo();
		expect(useTabeloStore.getState().workspace.columnWidths[columnId]).toBe(18);
	});

	it("does not record no-op cell commits", () => {
		const store = useTabeloStore.getState();

		store.editCell(0, 0, "");

		expect(useTabeloStore.getState().past).toHaveLength(0);
	});

	it("bounds the timeline without changing row or column identity", () => {
		const initial = useTabeloStore.getState().document;
		const rowId = initial.rows[0]?.id;
		const columnId = initial.columns[0]?.id;

		for (let index = 1; index <= 205; index += 1) {
			useTabeloStore.getState().editCell(0, 0, `Value ${index}`);
		}

		let state = useTabeloStore.getState();
		expect(state.past).toHaveLength(200);
		expect(state.document.rows[0]?.id).toBe(rowId);
		expect(state.document.columns[0]?.id).toBe(columnId);

		for (let index = 0; index < 200; index += 1) {
			useTabeloStore.getState().undo();
		}
		state = useTabeloStore.getState();
		expect(state.document.rows[0]?.cells[columnId ?? ""]).toBe("Value 5");
		expect(state.document.rows[0]?.id).toBe(rowId);
		expect(state.document.columns[0]?.id).toBe(columnId);

		for (let index = 0; index < 200; index += 1) {
			useTabeloStore.getState().redo();
		}
		state = useTabeloStore.getState();
		expect(state.document.rows[0]?.cells[columnId ?? ""]).toBe("Value 205");
		expect(state.document.rows[0]?.id).toBe(rowId);
		expect(state.document.columns[0]?.id).toBe(columnId);
	});
});

describe("structure deletion", () => {
	it("refuses to delete every selected column through the keyboard action", () => {
		const document = documentFromMatrix(
			[
				["Name", "Role", "City"],
				["Ingrid", "Designer", "Rio"],
			],
			{ headerRow: true },
		);
		useTabeloStore.setState({
			document,
			selection: selectionOf({
				anchor: { row: 0, column: 0 },
				focus: { row: 0, column: 2 },
				mode: "column",
			}),
		});

		const refusal = useTabeloStore.getState().deleteSelectedStructure();

		expect(refusal).toBe("last-column");
		expect(useTabeloStore.getState().document).toBe(document);
		expect(useTabeloStore.getState().past).toHaveLength(0);
	});

	it("still deletes a proper subset of selected rows", () => {
		const document = documentFromMatrix([["Name"], ["Ingrid"], ["Paulo"]], {
			headerRow: true,
		});
		useTabeloStore.setState({
			document,
			selection: createSelection({ row: 0, column: 0 }, "row"),
		});

		const refusal = useTabeloStore.getState().deleteSelectedStructure();

		expect(refusal).toBeNull();
		expect(documentToMatrix(useTabeloStore.getState().document)).toEqual([
			["Name"],
			["Paulo"],
		]);
	});
});

describe("structure insertion", () => {
	it("inserts as many rows or columns as the selection covers", () => {
		const document = documentFromMatrix(
			[
				["Name", "Role"],
				["Ingrid", "Designer"],
				["Paulo", "Developer"],
			],
			{ headerRow: true },
		);
		useTabeloStore.setState({
			document,
			selection: selectionOf({
				anchor: { row: 0, column: 0 },
				focus: { row: 1, column: 0 },
				mode: "row",
			}),
		});

		useTabeloStore.getState().addRowAbove();

		expect(useTabeloStore.getState().document.rows).toHaveLength(4);

		useTabeloStore.setState({
			document,
			selection: selectionOf({
				anchor: { row: 0, column: 0 },
				focus: { row: 0, column: 1 },
				mode: "column",
			}),
		});

		useTabeloStore.getState().addColumnLeft();

		expect(useTabeloStore.getState().document.columns).toHaveLength(4);
	});
});

describe("pending header decision", () => {
	it("does not change the document or history before an answer", () => {
		const before = useTabeloStore.getState();

		before.importText("Name,Role\nIngrid,Designer", "csv");

		const pending = useTabeloStore.getState();
		expect(pending.document).toBe(before.document);
		expect(pending.past).toEqual(before.past);
		expect(pending.pendingImport?.prepared.source).toBe("csv");
	});

	it("uses row 1 as headers in one undoable document step", () => {
		useTabeloStore.getState().importText("Name,Role\nIngrid,Designer", "csv");

		useTabeloStore.getState().answerPendingImport(true);

		expect(documentToMatrix(useTabeloStore.getState().document)).toEqual([
			["Name", "Role"],
			["Ingrid", "Designer"],
		]);
		expect(useTabeloStore.getState().pendingImport).toBeNull();
		expect(useTabeloStore.getState().past).toHaveLength(1);

		useTabeloStore.getState().undo();
		expect(useTabeloStore.getState().document).toBe(initialState.document);
	});

	it("keeps row 1 as data under empty headers", () => {
		useTabeloStore.getState().pasteClipboard({ text: "1\t2\n3\t4" });

		useTabeloStore.getState().answerPendingImport(false);

		expect(documentToMatrix(useTabeloStore.getState().document)).toEqual([
			["", ""],
			["1", "2"],
			["3", "4"],
		]);
	});

	it("cancels without changing document, selection, or history", () => {
		const before = useTabeloStore.getState();
		before.importText("Name,Role\nIngrid,Designer", "csv");

		useTabeloStore.getState().cancelPendingImport();

		const after = useTabeloStore.getState();
		expect(after.document).toBe(before.document);
		expect(after.selection).toBe(before.selection);
		expect(after.past).toBe(before.past);
		expect(after.pendingImport).toBeNull();
	});

	it("replaces an unanswered request with the latest import", () => {
		const store = useTabeloStore.getState();
		store.importText("Old\nvalue", "csv");
		store.importText("New\nvalue", "csv");

		useTabeloStore.getState().answerPendingImport(true);

		expect(documentToMatrix(useTabeloStore.getState().document)).toEqual([
			["New"],
			["value"],
		]);
	});

	it("imports a declared Markdown header without asking", () => {
		useTabeloStore
			.getState()
			.importText("| Name |\n| --- |\n| Ingrid |", "markdown");

		expect(useTabeloStore.getState().pendingImport).toBeNull();
		expect(useTabeloStore.getState().document.columns[0]?.header).toBe("Name");
	});

	it("keeps paste into existing content as a matrix write", () => {
		useTabeloStore.getState().editCell(0, 0, "Existing");

		useTabeloStore.getState().pasteClipboard({ text: "Name\tRole" });

		const state = useTabeloStore.getState();
		expect(state.pendingImport).toBeNull();
		expect(
			state.document.rows[0]?.cells[state.document.columns[0]?.id ?? ""],
		).toBe("Name");
	});
});

describe("copied ranges", () => {
	function twoByThree() {
		return documentFromMatrix(
			[
				["Name", "Role", "City"],
				["Ingrid", "Designer", "Rio"],
				["Paulo", "Engineer", "Madrid"],
			],
			{ headerRow: true },
		);
	}

	it("snapshots the selection at the moment of the copy", () => {
		useTabeloStore.setState({
			document: twoByThree(),
			selection: selectionOf({
				anchor: { row: 0, column: 0 },
				focus: { row: 1, column: 1 },
				mode: "cell",
			}),
		});

		useTabeloStore.getState().markCopiedRanges();

		expect(useTabeloStore.getState().copiedRanges).toEqual([
			{ top: 0, left: 0, bottom: 1, right: 1 },
		]);
	});

	it("carries the header row when a whole column is copied", () => {
		useTabeloStore.setState({
			document: twoByThree(),
			selection: createSelection({ row: HEADER_ROW, column: 1 }, "column"),
		});

		useTabeloStore.getState().markCopiedRanges();

		expect(useTabeloStore.getState().copiedRanges[0]?.top).toBe(HEADER_ROW);
	});

	it("outlives every selection change, which is the whole point of storing it", () => {
		useTabeloStore.setState({ document: twoByThree() });
		useTabeloStore.getState().markCopiedRanges();
		const marked = useTabeloStore.getState().copiedRanges;

		useTabeloStore.getState().selectCell({ row: 1, column: 2 });
		useTabeloStore.getState().extendSelection({ row: 1, column: 2 });
		useTabeloStore.getState().setSelection(
			selectionOf({
				anchor: { row: 0, column: 0 },
				focus: { row: 1, column: 1 },
				mode: "cell",
			}),
		);

		expect(useTabeloStore.getState().copiedRanges).toBe(marked);
	});

	it("is dropped by a document change, because the coordinates stop describing it", () => {
		useTabeloStore.setState({ document: twoByThree() });
		useTabeloStore.getState().markCopiedRanges();

		useTabeloStore.getState().editCell(1, 1, "Mabel");

		expect(useTabeloStore.getState().copiedRanges).toHaveLength(0);
	});

	it("is dropped by undo and by redo", () => {
		useTabeloStore.setState({ document: twoByThree() });
		useTabeloStore.getState().editCell(1, 1, "Mabel");

		useTabeloStore.getState().markCopiedRanges();
		useTabeloStore.getState().undo();
		expect(useTabeloStore.getState().copiedRanges).toHaveLength(0);

		useTabeloStore.getState().markCopiedRanges();
		useTabeloStore.getState().redo();
		expect(useTabeloStore.getState().copiedRanges).toHaveLength(0);
	});

	it("is dropped by a source commit", () => {
		const paneId = useTabeloStore
			.getState()
			.workspace.panes.find((pane) => pane.view === "markdown")?.id;
		expect(paneId).toBeDefined();
		useTabeloStore.getState().markCopiedRanges();

		useTabeloStore
			.getState()
			.setDraft(paneId ?? "", "markdown", "| Name |\n| --- |\n| Ingrid |");

		expect(useTabeloStore.getState().copiedRanges).toHaveLength(0);
	});

	it("never becomes a history step", () => {
		useTabeloStore.setState({ document: twoByThree() });
		const before = useTabeloStore.getState();

		before.markCopiedRanges();

		const after = useTabeloStore.getState();
		expect(after.document).toBe(before.document);
		expect(after.past).toHaveLength(0);
		expect(after.future).toHaveLength(0);
	});
});

// The selection can hold several separate regions once the modifier has been
// used. Each operation below is either explicitly aware of all of them, or
// refuses because it has no single place to act.
describe("contiguous block movement", () => {
	const roster = () =>
		documentFromMatrix(samplePeopleMatrix(), { headerRow: true });

	it("moves selected rows in one history step and translates the range", () => {
		useTabeloStore.setState({
			document: roster(),
			selection: selectionOf({
				anchor: { row: 2, column: 2 },
				focus: { row: 1, column: 1 },
				mode: "cell",
			}),
		});

		expect(useTabeloStore.getState().moveSelectedRow(1)).toBeNull();

		const state = useTabeloStore.getState();
		expect(
			documentToMatrix(state.document)
				.slice(1)
				.map((row) => row[0]),
		).toEqual(["Ingrid", "Felix", "Paulo", "Mabel", "Amora"]);
		expect(state.selection).toEqual(
			selectionOf({
				anchor: { row: 3, column: 2 },
				focus: { row: 2, column: 1 },
				mode: "cell",
			}),
		);
		expect(state.past).toHaveLength(1);
	});

	it("moves selected columns in one history step and translates the range", () => {
		useTabeloStore.setState({
			document: roster(),
			selection: selectionOf({
				anchor: { row: 2, column: 2 },
				focus: { row: 1, column: 1 },
				mode: "cell",
			}),
		});

		expect(useTabeloStore.getState().moveSelectedColumn(1)).toBeNull();

		const state = useTabeloStore.getState();
		expect(documentToMatrix(state.document)[0]).toEqual([
			"name",
			"age",
			"city",
			"role",
		]);
		expect(state.selection).toEqual(
			selectionOf({
				anchor: { row: 2, column: 3 },
				focus: { row: 1, column: 2 },
				mode: "cell",
			}),
		);
		expect(state.past).toHaveLength(1);
	});

	it.each([
		[
			"header-only",
			createSelection({ row: HEADER_ROW, column: 1 }),
			1,
			"header-row",
		],
		[
			"mixed header and data",
			selectionOf({
				anchor: { row: HEADER_ROW, column: 0 },
				focus: { row: 0, column: 1 },
				mode: "cell",
			}),
			1,
			"header-row",
		],
		[
			"first-edge",
			selectionOf({
				anchor: { row: 0, column: 0 },
				focus: { row: 1, column: 1 },
				mode: "cell",
			}),
			-1,
			"first-row",
		],
		[
			"last-edge",
			selectionOf({
				anchor: { row: 3, column: 0 },
				focus: { row: 4, column: 1 },
				mode: "cell",
			}),
			1,
			"last-row",
		],
	] as const)(
		"refuses a %s row move without changing document or selection",
		(_name, selection, offset, expected) => {
			const document = roster();
			useTabeloStore.setState({ document, selection });

			expect(useTabeloStore.getState().moveSelectedRow(offset)).toBe(expected);

			const state = useTabeloStore.getState();
			expect(state.document).toBe(document);
			expect(state.selection).toBe(selection);
			expect(state.past).toHaveLength(0);
		},
	);

	it.each([
		[0, 1, -1, "first-column"],
		[2, 3, 1, "last-column"],
	] as const)(
		"refuses a column block at columns %i-%i moved by %i",
		(from, to, offset, expected) => {
			const document = roster();
			const selection = selectionOf({
				anchor: { row: 0, column: from },
				focus: { row: 1, column: to },
				mode: "cell",
			});
			useTabeloStore.setState({ document, selection });

			expect(useTabeloStore.getState().moveSelectedColumn(offset)).toBe(
				expected,
			);
			expect(useTabeloStore.getState().document).toBe(document);
			expect(useTabeloStore.getState().selection).toBe(selection);
		},
	);
});

describe("operations over several selected regions", () => {
	const roster = () =>
		documentFromMatrix(samplePeopleMatrix(3), { headerRow: true });

	// Columns 1 and 3 of the roster: name and role, skipping city.
	const scatteredColumns = () =>
		selectionOf(
			{
				anchor: { row: HEADER_ROW, column: 0 },
				focus: { row: HEADER_ROW, column: 0 },
				mode: "column",
			},
			{
				anchor: { row: HEADER_ROW, column: 2 },
				focus: { row: HEADER_ROW, column: 2 },
				mode: "column",
			},
		);

	// Rows 1 and 3 of the roster, skipping row 2.
	const scatteredRows = () =>
		selectionOf(
			{
				anchor: { row: 0, column: 0 },
				focus: { row: 0, column: 0 },
				mode: "row",
			},
			{
				anchor: { row: 2, column: 0 },
				focus: { row: 2, column: 0 },
				mode: "row",
			},
		);

	// The gap closes, so what reaches the clipboard is a table rather than a
	// ragged payload, and pasting it back produces exactly those two columns.
	it("copies the selected columns as a well-formed table", () => {
		useTabeloStore.setState({
			document: roster(),
			selection: scatteredColumns(),
		});

		expect(useTabeloStore.getState().selectedMatrix()).toEqual([
			["name", "role"],
			["Ingrid", "Designer"],
			["Paulo", "Developer"],
			["Mabel", "Writer"],
		]);
	});

	it("copies scattered cells as the rows and columns they cover", () => {
		useTabeloStore.setState({
			document: roster(),
			selection: selectionOf(
				{
					anchor: { row: 0, column: 0 },
					focus: { row: 0, column: 0 },
					mode: "cell",
				},
				{
					anchor: { row: 2, column: 3 },
					focus: { row: 2, column: 3 },
					mode: "cell",
				},
			),
		});

		expect(useTabeloStore.getState().selectedMatrix()).toEqual([
			["Ingrid", "35"],
			["Mabel", "45"],
		]);
	});

	it("deletes every selected column, not only the active one", () => {
		useTabeloStore.setState({
			document: roster(),
			selection: scatteredColumns(),
		});

		useTabeloStore.getState().removeSelectedColumns();

		expect(documentToMatrix(useTabeloStore.getState().document)).toEqual([
			["city", "age"],
			["Rio", "35"],
			["Madrid", "35"],
			["Buenos Aires", "45"],
		]);
	});

	it("duplicates every selected row in place", () => {
		useTabeloStore.setState({ document: roster(), selection: scatteredRows() });

		useTabeloStore.getState().duplicateSelectedRows();

		expect(
			documentToMatrix(useTabeloStore.getState().document).map((row) => row[0]),
		).toEqual(["name", "Ingrid", "Ingrid", "Paulo", "Mabel", "Mabel"]);
	});

	it("deletes every selected row in one step", () => {
		useTabeloStore.setState({ document: roster(), selection: scatteredRows() });

		expect(useTabeloStore.getState().deleteSelectedStructure()).toBeNull();
		expect(
			documentToMatrix(useTabeloStore.getState().document).map((row) => row[0]),
		).toEqual(["name", "Paulo"]);
	});

	it("clears every selected region as a single undo step", () => {
		useTabeloStore.setState({
			document: roster(),
			selection: scatteredColumns(),
		});

		useTabeloStore.getState().clearSelection();

		expect(documentToMatrix(useTabeloStore.getState().document)).toEqual([
			["", "city", "", "age"],
			["", "Rio", "", "35"],
			["", "Madrid", "", "35"],
			["", "Buenos Aires", "", "45"],
		]);
		expect(useTabeloStore.getState().past).toHaveLength(1);
	});

	it("aligns every selected column at once", () => {
		useTabeloStore.setState({
			document: roster(),
			selection: scatteredColumns(),
		});

		useTabeloStore.getState().setColumnAlignment(0, "right");

		expect(
			useTabeloStore.getState().document.columns.map((column) => column.align),
		).toEqual(["right", "default", "right", "default"]);
	});

	// A column outside the selection is acted on alone: dragging one column's
	// edge must not resize something elsewhere in the table.
	it("leaves the selection alone when the target is outside it", () => {
		useTabeloStore.setState({
			document: roster(),
			selection: scatteredColumns(),
		});

		useTabeloStore.getState().setColumnAlignment(1, "center");

		expect(
			useTabeloStore.getState().document.columns.map((column) => column.align),
		).toEqual(["default", "center", "default", "default"]);
	});

	// Inserting, moving, and pasting each need one place to act. They refuse
	// rather than picking a region, and the menus disable them with a reason.
	it("refuses to insert, move, or paste", () => {
		const document = roster();
		useTabeloStore.setState({ document, selection: scatteredColumns() });
		const store = useTabeloStore.getState();

		store.addRowAbove();
		store.addColumnLeft();
		const moveRefusal = store.moveSelectedColumn(1);
		const refusal = store.pasteClipboard({ text: "x" });

		expect(moveRefusal).toBe("single-area");
		expect(refusal).toBe("single-area");
		expect(useTabeloStore.getState().document).toBe(document);
	});

	// The mark has to show every area the copy took. Marking only the active one
	// would outline one column while the clipboard held two.
	it("marks every area a copy took, not only the active one", () => {
		useTabeloStore.setState({
			document: roster(),
			selection: scatteredColumns(),
		});

		useTabeloStore.getState().markCopiedRanges();

		expect(useTabeloStore.getState().copiedRanges).toEqual([
			{ top: HEADER_ROW, bottom: 2, left: 0, right: 0 },
			{ top: HEADER_ROW, bottom: 2, left: 2, right: 2 },
		]);
	});
});

describe("fill history", () => {
	it("commits a filled rectangle as one step and undoes it exactly", () => {
		const document = documentFromMatrix(
			[
				["A", "B"],
				["a", "b"],
				["c", "d"],
				["", ""],
			],
			{ headerRow: true },
		);
		useTabeloStore.setState({
			document,
			selection: selectionOf({
				anchor: { row: 0, column: 0 },
				focus: { row: 1, column: 1 },
				mode: "cell",
			}),
		});

		expect(
			useTabeloStore.getState().fillSelection({
				top: 0,
				bottom: 2,
				left: 0,
				right: 1,
			}),
		).toBe(2);
		const filled = useTabeloStore.getState();
		expect(documentToMatrix(filled.document)).toEqual([
			["A", "B"],
			["a", "b"],
			["c", "d"],
			["a", "b"],
		]);
		expect(filled.past).toHaveLength(1);

		filled.undo();
		expect(useTabeloStore.getState().document).toBe(document);
	});

	it("refuses a fill from a header or several areas without changing history", () => {
		const before = useTabeloStore.getState();
		useTabeloStore.setState({
			selection: createSelection({ row: HEADER_ROW, column: 0 }),
		});
		expect(
			useTabeloStore.getState().fillSelection({
				top: HEADER_ROW,
				bottom: 1,
				left: 0,
				right: 0,
			}),
		).toBe(0);
		expect(useTabeloStore.getState().document).toBe(before.document);
		expect(useTabeloStore.getState().past).toBe(before.past);
	});
});
