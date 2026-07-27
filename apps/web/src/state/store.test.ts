import { beforeEach, describe, expect, it } from "vitest";
import { documentToMatrix } from "@/core/document";
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
