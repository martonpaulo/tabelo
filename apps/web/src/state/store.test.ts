import { beforeEach, describe, expect, it } from "vitest";
import { documentFromMatrix, documentToMatrix } from "@/core/document";
import { samplePeopleMatrix } from "@/core/sample-data";
import {
	createSelection,
	type GridSelection,
	HEADER_ROW,
	type SelectionRange,
} from "@/core/selection";
import { conditionNoticeIds } from "./notice-queue";
import { useTabeloStore } from "./store";

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

	it("keeps a successful import to one document-history operation", () => {
		const before = documentToMatrix(useTabeloStore.getState().document);

		useTabeloStore.getState().importText("Name,Role\nIngrid,Designer", "csv");

		expect(useTabeloStore.getState().past).toHaveLength(1);
		useTabeloStore.getState().undo();
		expect(documentToMatrix(useTabeloStore.getState().document)).toEqual(
			before,
		);
	});
});

describe("document history", () => {
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

describe("header correction", () => {
	it("does not offer correction when a numeric first row stays data", () => {
		useTabeloStore.getState().pasteClipboard({ text: "1\t2\n3\t4" });

		const state = useTabeloStore.getState();
		expect(state.headerCorrection).toBeNull();
		expect(documentToMatrix(state.document)).toEqual([
			["", ""],
			["1", "2"],
			["3", "4"],
		]);
	});

	it("does not offer correction when a blank first-row cell stays data", () => {
		useTabeloStore.getState().importText("Name,\nIngrid,Designer", "csv");

		const state = useTabeloStore.getState();
		expect(state.headerCorrection).toBeNull();
		expect(documentToMatrix(state.document)[0]).toEqual(["", ""]);
	});

	it("binds text-header correction to the imported document", () => {
		useTabeloStore
			.getState()
			.pasteClipboard({ text: "Name\tRole\nIngrid\tDesigner" });

		const state = useTabeloStore.getState();
		expect(state.headerCorrection?.document).toBe(state.document);
	});

	it("invalidates correction after a grid edit", () => {
		useTabeloStore
			.getState()
			.pasteClipboard({ text: "Name\tRole\nIngrid\tDesigner" });

		useTabeloStore.getState().editCell(0, 0, "Paulo");

		expect(useTabeloStore.getState().headerCorrection).toBeNull();
	});

	it("invalidates correction after a successful source commit", () => {
		useTabeloStore
			.getState()
			.pasteClipboard({ text: "Name\tRole\nIngrid\tDesigner" });

		const state = useTabeloStore.getState();
		const paneId = state.workspace.panes.find(
			(pane) => pane.view === "markdown",
		)?.id;
		expect(paneId).toBeDefined();
		state.setDraft(
			paneId ?? "",
			"markdown",
			"| Other | Role |\n| --- | --- |\n| Paulo | Developer |",
		);

		expect(useTabeloStore.getState().headerCorrection).toBeNull();
	});

	it("refuses a correction whose imported revision is no longer current", () => {
		useTabeloStore
			.getState()
			.pasteClipboard({ text: "Name\tRole\nIngrid\tDesigner" });
		const imported = useTabeloStore.getState().document;
		const replacement = documentFromMatrix(
			[
				["Other", "Role"],
				["Paulo", "Developer"],
			],
			{ headerRow: true },
		);
		useTabeloStore.setState({
			document: replacement,
			headerCorrection: { document: imported },
		});

		useTabeloStore.getState().demoteHeader();

		expect(useTabeloStore.getState().document).toBe(replacement);
		expect(useTabeloStore.getState().headerCorrection).toBeNull();
	});

	it("makes correction and undo one atomic step each", () => {
		useTabeloStore
			.getState()
			.pasteClipboard({ text: "Name\tRole\nIngrid\tDesigner" });
		const imported = documentToMatrix(useTabeloStore.getState().document);

		useTabeloStore.getState().demoteHeader();

		expect(documentToMatrix(useTabeloStore.getState().document)).toEqual([
			["", ""],
			["Name", "Role"],
			["Ingrid", "Designer"],
		]);
		expect(useTabeloStore.getState().headerCorrection).toBeNull();

		useTabeloStore.getState().undo();

		expect(documentToMatrix(useTabeloStore.getState().document)).toEqual(
			imported,
		);
		expect(useTabeloStore.getState().headerCorrection).toBeNull();
	});

	it("dismisses only the correction notice", () => {
		useTabeloStore
			.getState()
			.pasteClipboard({ text: "Name\tRole\nIngrid\tDesigner" });
		const before = useTabeloStore.getState().document;

		useTabeloStore
			.getState()
			.dismissNotice(conditionNoticeIds.headerCorrection);

		expect(useTabeloStore.getState().document).toBe(before);
		expect(useTabeloStore.getState().headerCorrection).toBeNull();
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
		store.moveSelectedColumn(1);
		const refusal = store.pasteClipboard({ text: "x" });

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
