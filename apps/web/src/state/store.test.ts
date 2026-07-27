import { beforeEach, describe, expect, it } from "vitest";
import { documentFromMatrix, documentToMatrix } from "@/core/document";
import { createSelection } from "@/core/selection";
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

		before.importText('Name,Note\nAna,"unterminated', "csv");

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

		useTabeloStore.getState().importText("Name,Role\nAna,Designer", "csv");

		expect(useTabeloStore.getState().past).toHaveLength(1);
		useTabeloStore.getState().undo();
		expect(documentToMatrix(useTabeloStore.getState().document)).toEqual(
			before,
		);
	});
});

describe("header correction", () => {
	it("does not offer correction when a numeric first row stays data", () => {
		useTabeloStore.getState().pasteClipboard({ text: "1\t2\n3\t4" });

		const state = useTabeloStore.getState();
		expect(state.headerCorrection).toBeNull();
		expect(documentToMatrix(state.document)).toEqual([
			["Column 1", "Column 2"],
			["1", "2"],
			["3", "4"],
		]);
	});

	it("does not offer correction when a blank first-row cell stays data", () => {
		useTabeloStore.getState().importText("Name,\nAna,Designer", "csv");

		const state = useTabeloStore.getState();
		expect(state.headerCorrection).toBeNull();
		expect(documentToMatrix(state.document)[0]).toEqual([
			"Column 1",
			"Column 2",
		]);
	});

	it("binds text-header correction to the imported document", () => {
		useTabeloStore
			.getState()
			.pasteClipboard({ text: "Name\tRole\nAna\tDesigner" });

		const state = useTabeloStore.getState();
		expect(state.headerCorrection?.document).toBe(state.document);
	});

	it("invalidates correction after a grid edit", () => {
		useTabeloStore
			.getState()
			.pasteClipboard({ text: "Name\tRole\nAna\tDesigner" });

		useTabeloStore.getState().editCell(0, 0, "Bruno");

		expect(useTabeloStore.getState().headerCorrection).toBeNull();
	});

	it("invalidates correction after a successful source commit", () => {
		useTabeloStore
			.getState()
			.pasteClipboard({ text: "Name\tRole\nAna\tDesigner" });

		const state = useTabeloStore.getState();
		const paneId = state.workspace.panes.find(
			(pane) => pane.view === "markdown",
		)?.id;
		expect(paneId).toBeDefined();
		state.setDraft(
			paneId ?? "",
			"markdown",
			"| Other | Role |\n| --- | --- |\n| Bruno | Developer |",
		);

		expect(useTabeloStore.getState().headerCorrection).toBeNull();
	});

	it("refuses a correction whose imported revision is no longer current", () => {
		useTabeloStore
			.getState()
			.pasteClipboard({ text: "Name\tRole\nAna\tDesigner" });
		const imported = useTabeloStore.getState().document;
		const replacement = documentFromMatrix(
			[
				["Other", "Role"],
				["Bruno", "Developer"],
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
			.pasteClipboard({ text: "Name\tRole\nAna\tDesigner" });
		const imported = documentToMatrix(useTabeloStore.getState().document);

		useTabeloStore.getState().demoteHeader();

		expect(documentToMatrix(useTabeloStore.getState().document)).toEqual([
			["Column 1", "Column 2"],
			["Name", "Role"],
			["Ana", "Designer"],
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
			.pasteClipboard({ text: "Name\tRole\nAna\tDesigner" });
		const before = useTabeloStore.getState().document;

		useTabeloStore.getState().dismissNotice();

		expect(useTabeloStore.getState().document).toBe(before);
		expect(useTabeloStore.getState().headerCorrection).toBeNull();
	});
});
