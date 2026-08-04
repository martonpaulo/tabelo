import { beforeEach, describe, expect, it } from "vitest";
import { documentFromMatrix, documentToMatrix } from "@/core/document";
import { createSelection } from "@/core/selection";
import { conditionNoticeIds } from "./notice-queue";
import { useTabeloStore } from "./store";

const initialState = useTabeloStore.getInitialState();

beforeEach(() => {
	useTabeloStore.setState(initialState, true);
});

describe("transactional input", () => {
	it("preserves the document and selection after a named format failure", () => {
		useTabeloStore.setState({
			selection: createSelection({ row: 2, column: 2 }),
		});
		const before = useTabeloStore.getState();

		before.importText('Name,Note\nInez,"unterminated', "csv");

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

		useTabeloStore.getState().importText("Name,Role\nInez,Designer", "csv");

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
				["Inez", "Designer", "Porto"],
			],
			{ headerRow: true },
		);
		useTabeloStore.setState({
			document,
			selection: {
				anchor: { row: 0, column: 0 },
				focus: { row: 0, column: 2 },
				mode: "column",
			},
		});

		const refusal = useTabeloStore.getState().deleteSelectedStructure();

		expect(refusal).toBe("last-column");
		expect(useTabeloStore.getState().document).toBe(document);
		expect(useTabeloStore.getState().past).toHaveLength(0);
	});

	it("still deletes a proper subset of selected rows", () => {
		const document = documentFromMatrix([["Name"], ["Inez"], ["Mark"]], {
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
			["Mark"],
		]);
	});
});

describe("structure insertion", () => {
	it("inserts as many rows or columns as the selection covers", () => {
		const document = documentFromMatrix(
			[
				["Name", "Role"],
				["Inez", "Designer"],
				["Mark", "Developer"],
			],
			{ headerRow: true },
		);
		useTabeloStore.setState({
			document,
			selection: {
				anchor: { row: 0, column: 0 },
				focus: { row: 1, column: 0 },
				mode: "row",
			},
		});

		useTabeloStore.getState().addRowAbove();

		expect(useTabeloStore.getState().document.rows).toHaveLength(4);

		useTabeloStore.setState({
			document,
			selection: {
				anchor: { row: 0, column: 0 },
				focus: { row: 0, column: 1 },
				mode: "column",
			},
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
		useTabeloStore.getState().importText("Name,\nInez,Designer", "csv");

		const state = useTabeloStore.getState();
		expect(state.headerCorrection).toBeNull();
		expect(documentToMatrix(state.document)[0]).toEqual(["", ""]);
	});

	it("binds text-header correction to the imported document", () => {
		useTabeloStore
			.getState()
			.pasteClipboard({ text: "Name\tRole\nInez\tDesigner" });

		const state = useTabeloStore.getState();
		expect(state.headerCorrection?.document).toBe(state.document);
	});

	it("invalidates correction after a grid edit", () => {
		useTabeloStore
			.getState()
			.pasteClipboard({ text: "Name\tRole\nInez\tDesigner" });

		useTabeloStore.getState().editCell(0, 0, "Mark");

		expect(useTabeloStore.getState().headerCorrection).toBeNull();
	});

	it("invalidates correction after a successful source commit", () => {
		useTabeloStore
			.getState()
			.pasteClipboard({ text: "Name\tRole\nInez\tDesigner" });

		const state = useTabeloStore.getState();
		const paneId = state.workspace.panes.find(
			(pane) => pane.view === "markdown",
		)?.id;
		expect(paneId).toBeDefined();
		state.setDraft(
			paneId ?? "",
			"markdown",
			"| Other | Role |\n| --- | --- |\n| Mark | Developer |",
		);

		expect(useTabeloStore.getState().headerCorrection).toBeNull();
	});

	it("refuses a correction whose imported revision is no longer current", () => {
		useTabeloStore
			.getState()
			.pasteClipboard({ text: "Name\tRole\nInez\tDesigner" });
		const imported = useTabeloStore.getState().document;
		const replacement = documentFromMatrix(
			[
				["Other", "Role"],
				["Mark", "Developer"],
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
			.pasteClipboard({ text: "Name\tRole\nInez\tDesigner" });
		const imported = documentToMatrix(useTabeloStore.getState().document);

		useTabeloStore.getState().demoteHeader();

		expect(documentToMatrix(useTabeloStore.getState().document)).toEqual([
			["", ""],
			["Name", "Role"],
			["Inez", "Designer"],
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
			.pasteClipboard({ text: "Name\tRole\nInez\tDesigner" });
		const before = useTabeloStore.getState().document;

		useTabeloStore
			.getState()
			.dismissNotice(conditionNoticeIds.headerCorrection);

		expect(useTabeloStore.getState().document).toBe(before);
		expect(useTabeloStore.getState().headerCorrection).toBeNull();
	});
});
