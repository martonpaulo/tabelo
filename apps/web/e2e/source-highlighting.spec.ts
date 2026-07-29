import { copy } from "@/ui/copy";
import type { ViewId } from "@/views/types";
import { expect, test } from "./fixtures";

test("every source format highlights its table structure", async ({
	tabelo,
}) => {
	const expectHeaderLine = async (view: ViewId) => {
		const pane = tabelo.pane(view);
		await expect(pane.locator(".cm-tableHeaderLine")).toHaveCount(1);
		await expect(pane.locator(".cm-line span").first()).toBeVisible();
	};

	await expectHeaderLine("markdown");

	await tabelo.choosePaneView("markdown", "csv");
	await expectHeaderLine("csv");

	await tabelo.choosePaneView("csv", "tsv");
	await expectHeaderLine("tsv");

	await tabelo.choosePaneView("tsv", "jira");
	await expectHeaderLine("jira");

	await tabelo.choosePaneView("jira", "html");
	const html = tabelo.pane("html");
	const headerCellLine = html
		.locator(".cm-line")
		.filter({ hasText: "<th" })
		.first();
	await expect(headerCellLine).toBeVisible();
	await expect(headerCellLine.locator("span")).not.toHaveCount(0);
});

test("the first grid row is the numbered header row", async ({ tabelo }) => {
	await expect(
		tabelo.grid().getByRole("rowheader", { name: copy.a11y.headerRow }),
	).toHaveText("1");
	await expect(
		tabelo.grid().getByRole("rowheader", { name: copy.a11y.rowNumber(0) }),
	).toContainText("2");
});

test("grid headers show the current alignment", async ({ page, tabelo }) => {
	const header = tabelo.header(1);
	await expect(header.locator("svg")).toHaveCount(2);

	await header
		.getByRole("button", {
			name: new RegExp(`^${copy.actions.columnActions}:`),
		})
		.click();
	await page
		.getByRole("menuitemradio", { name: copy.actions.alignRight })
		.click();

	await expect(
		header.getByRole("button", {
			name: copy.a11y.columnLetter(0),
			exact: true,
		}),
	).toHaveCSS("text-align", "right");
});
