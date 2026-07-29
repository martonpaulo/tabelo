import type { Locator } from "@playwright/test";
import { expect, test } from "./fixtures";

const invalidMarkdown =
	"| Name | Role |\n| not a divider |\n| Inez | Designer |";
const validMarkdown =
	"| Name | Role |\n| --- | --- |\n| Immediate | Designer |";

async function editorSnapshot(editor: Locator) {
	return editor.evaluate((element) => {
		const selection = element.ownerDocument.getSelection();
		if (!selection?.anchorNode) return null;
		const range = element.ownerDocument.createRange();
		range.selectNodeContents(element);
		range.setEnd(selection.anchorNode, selection.anchorOffset);
		const scroller = element
			.closest(".cm-editor")
			?.querySelector<HTMLElement>(".cm-scroller");
		return {
			offset: range.toString().length,
			scrollTop: scroller?.scrollTop ?? 0,
		};
	});
}

test("valid source edits synchronize without a pending healthy status", async ({
	tabelo,
}) => {
	await tabelo.source("markdown").fill(validMarkdown);

	await expect(tabelo.cell(1, 1)).toHaveText("Immediate");
	await expect(tabelo.pane("markdown").getByRole("status")).toHaveCount(0);
});

test("transient invalid source stays quiet and keeps the last valid table", async ({
	tabelo,
}) => {
	await tabelo.source("markdown").fill(invalidMarkdown);
	await expect(tabelo.pane("markdown").getByRole("status")).toHaveCount(0);
	await expect(tabelo.cell(1, 1)).toHaveText("");

	await tabelo.source("markdown").fill(validMarkdown);
	await expect(tabelo.cell(1, 1)).toHaveText("Immediate");
	await expect(tabelo.pane("markdown").getByRole("status")).toHaveCount(0);
});

test("persistent invalid source is underlined while the grid stays valid", async ({
	tabelo,
}) => {
	await tabelo.source("markdown").fill(invalidMarkdown);

	await expect(
		tabelo.pane("markdown").locator(".cm-diagnosticError"),
	).toHaveCount(1);
	await expect(tabelo.cell(1, 1)).toHaveText("");
});

test("source cursor and local undo survive a 200-row synchronization", async ({
	tabelo,
}) => {
	const source = [
		"| Name |",
		"| --- |",
		...Array.from({ length: 200 }, (_, index) => `| Value ${index} |`),
	].join("\n");
	const editor = tabelo.source("markdown");

	await editor.fill(source);
	await expect(tabelo.grid()).toHaveAttribute("aria-rowcount", "201");
	await expect(editor).toBeFocused();

	await editor.press("End");
	await editor.press("ArrowLeft");
	await editor.press("ArrowLeft");
	const beforeInsert = await editorSnapshot(editor);
	await editor.press("X");
	await expect(tabelo.cell(200, 1)).toHaveText("Value 199X");
	await expect(editor).toBeFocused();
	const afterInsert = await editorSnapshot(editor);
	expect(afterInsert?.offset).toBe((beforeInsert?.offset ?? 0) + 1);
	expect(afterInsert?.scrollTop).toBe(beforeInsert?.scrollTop);

	await editor.press("ControlOrMeta+z");
	await expect(tabelo.cell(200, 1)).toHaveText("Value 199");
	await expect(editor).toBeFocused();
	const afterUndo = await editorSnapshot(editor);
	expect(afterUndo).toEqual(beforeInsert);
});
