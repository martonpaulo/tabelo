import { expect, test } from "./fixtures";

const invalidMarkdown =
	"| Name | Role |\n| not a divider |\n| Ana | Designer |";

test("only the exact source pane owns an invalid draft", async ({ tabelo }) => {
	await tabelo.chooseLayout("Four panes");
	await tabelo.choosePaneView("CSV", "Markdown");

	const projection = tabelo.paneAt("Markdown", 0);
	const owner = tabelo.paneAt("Markdown", 1);
	await tabelo.sourceAt("Markdown", 1).fill(invalidMarkdown);

	await expect(owner).toContainText("Not valid yet");
	await expect(projection).not.toContainText("Not valid yet");
	await expect(tabelo.sourceAt("Markdown", 0)).not.toContainText(
		"not a divider",
	);

	await tabelo.choosePaneView("Markdown", "CSV", 0);
	await expect(tabelo.pane("Markdown")).toContainText("Not valid yet");
	await expect(tabelo.sourceAt("Markdown", 0)).toContainText("not a divider");
});

test("a layout collapse keeps an invalid draft reachable", async ({
	tabelo,
}) => {
	await tabelo.chooseLayout("Four panes");
	await tabelo.choosePaneView("CSV", "Markdown");
	await tabelo.sourceAt("Markdown", 1).fill(invalidMarkdown);
	await expect(tabelo.paneAt("Markdown", 1)).toContainText("Not valid yet");

	await tabelo.chooseLayout("Single");

	await expect(tabelo.pane("Markdown")).toBeVisible();
	await expect(tabelo.source("Markdown")).toContainText("not a divider");
	await expect(tabelo.pane("Markdown")).toContainText("Not valid yet");
});
