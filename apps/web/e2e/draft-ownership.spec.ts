import { expect, test } from "./fixtures";

const invalidMarkdown =
	"| Name | Role |\n| not a divider |\n| Inez | Designer |";

test("only the editing source pane owns an invalid draft", async ({
	tabelo,
}) => {
	await tabelo.chooseLayout("Four panes");
	await tabelo.source("Markdown").fill(invalidMarkdown);

	await expect(
		tabelo.pane("Markdown").locator(".cm-diagnosticError"),
	).toHaveCount(1);
	await expect(tabelo.source("CSV")).not.toContainText("not a divider");
	await expect(tabelo.source("Markdown")).toContainText("not a divider");
});

test("a layout collapse keeps an invalid draft reachable", async ({
	tabelo,
}) => {
	await tabelo.chooseLayout("Four panes");
	await tabelo.source("Markdown").fill(invalidMarkdown);
	await expect(
		tabelo.pane("Markdown").locator(".cm-diagnosticError"),
	).toHaveCount(1);

	await tabelo.chooseLayout("Single");

	await expect(tabelo.pane("Markdown")).toBeVisible();
	await expect(tabelo.source("Markdown")).toContainText("not a divider");
	await expect(
		tabelo.pane("Markdown").locator(".cm-diagnosticError"),
	).toHaveCount(1);
});
