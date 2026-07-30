import { expect, test } from "./fixtures";

const invalidMarkdown =
	"| Name | Role |\n| not a divider |\n| Inez | Designer |";

test("only the editing source pane owns an invalid draft", async ({
	tabelo,
}) => {
	await tabelo.chooseLayout("quad");
	await tabelo.source("markdown").fill(invalidMarkdown);

	await expect(
		tabelo.pane("markdown").locator(".cm-diagnosticError"),
	).toHaveCount(1);
	await expect(tabelo.source("csv")).not.toContainText("not a divider");
	await expect(tabelo.source("markdown")).toContainText("not a divider");
});

test("a layout collapse keeps an invalid draft reachable", async ({
	tabelo,
}) => {
	await tabelo.chooseLayout("quad");
	await tabelo.source("markdown").fill(invalidMarkdown);
	await expect(
		tabelo.pane("markdown").locator(".cm-diagnosticError"),
	).toHaveCount(1);

	await tabelo.chooseLayout("columns");

	await expect(tabelo.pane("markdown")).toBeVisible();
	await expect(tabelo.source("markdown")).toContainText("not a divider");
	await expect(
		tabelo.pane("markdown").locator(".cm-diagnosticError"),
	).toHaveCount(1);
});
