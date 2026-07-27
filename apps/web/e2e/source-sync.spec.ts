import { expect, test } from "./fixtures";

const invalidMarkdown =
	"| Name | Role |\n| not a divider |\n| Ana | Designer |";
const validMarkdown =
	"| Name | Role |\n| --- | --- |\n| Immediate | Designer |";

test("valid source edits synchronize without a pending healthy status", async ({
	tabelo,
}) => {
	await expect(tabelo.pane("Markdown")).not.toContainText("In sync");

	await tabelo.source("Markdown").fill(validMarkdown);

	await expect(tabelo.cell(1, 1)).toHaveText("Immediate");
	await expect(tabelo.pane("Markdown")).not.toContainText("Editing");
	await expect(tabelo.pane("Markdown")).not.toContainText("In sync");
});

test("transient invalid source stays quiet and keeps the last valid table", async ({
	tabelo,
}) => {
	await tabelo.source("Markdown").fill(invalidMarkdown);
	await expect(tabelo.pane("Markdown")).not.toContainText(
		"Source is not valid yet.",
	);
	await expect(tabelo.cell(1, 1)).toHaveText("");

	await tabelo.source("Markdown").fill(validMarkdown);
	await expect(tabelo.cell(1, 1)).toHaveText("Immediate");
	await expect(tabelo.pane("Markdown")).not.toContainText(
		"Source is not valid yet.",
	);
});

test("persistent invalid source shows the written recovery contract", async ({
	tabelo,
}) => {
	await tabelo.source("Markdown").fill(invalidMarkdown);

	await expect(tabelo.pane("Markdown")).toContainText(
		"Source is not valid yet. Other views still show the last valid table.",
	);
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
	const editor = tabelo.source("Markdown");

	await editor.fill(source);
	await expect(tabelo.grid()).toHaveAttribute("aria-rowcount", "201");
	await expect(editor).toBeFocused();

	await editor.press("End");
	await editor.press("ArrowLeft");
	await editor.press("ArrowLeft");
	await editor.press("X");
	await expect(tabelo.cell(200, 1)).toHaveText("Value 199X");
	await expect(editor).toBeFocused();

	await editor.press("ControlOrMeta+z");
	await expect(tabelo.cell(200, 1)).toHaveText("Value 199");
	await expect(editor).toBeFocused();
});
