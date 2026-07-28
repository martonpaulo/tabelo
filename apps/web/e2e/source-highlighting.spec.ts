import { expect, test } from "./fixtures";

test("every source format highlights its table structure", async ({
	tabelo,
}) => {
	const expectHeaderLine = async (view: string) => {
		const pane = tabelo.pane(view);
		await expect(pane.locator(".cm-tableHeaderLine")).toHaveCount(1);
		await expect(pane.locator(".cm-line span").first()).toBeVisible();
	};

	await expectHeaderLine("Markdown");

	await tabelo.choosePaneView("Markdown", "CSV");
	await expectHeaderLine("CSV");

	await tabelo.choosePaneView("CSV", "TSV");
	await expectHeaderLine("TSV");

	await tabelo.choosePaneView("TSV", "Jira");
	await expectHeaderLine("Jira");

	await tabelo.choosePaneView("Jira", "HTML source");
	const html = tabelo.pane("HTML source");
	const headerCellLine = html
		.locator(".cm-line")
		.filter({ hasText: "<th" })
		.first();
	await expect(headerCellLine).toBeVisible();
	await expect(headerCellLine.locator("span")).not.toHaveCount(0);
});

test("the first grid row is the numbered header row", async ({ tabelo }) => {
	await expect(
		tabelo.grid().getByRole("rowheader", { name: "Row 1" }),
	).toHaveText("1");
	await expect(
		tabelo.grid().getByRole("rowheader", { name: "Row 2" }),
	).toContainText("2");
});

test("grid headers show the current alignment", async ({ page, tabelo }) => {
	const header = tabelo.header(1);
	await expect(header.locator("svg")).toHaveCount(2);

	await header.getByRole("button", { name: /^Column actions:/ }).click();
	await page.getByRole("menuitemradio", { name: "Align right" }).click();

	await expect(
		header.getByRole("button", { name: "Column 1", exact: true }),
	).toHaveCSS("text-align", "right");
});
