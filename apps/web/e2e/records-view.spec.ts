import { copy } from "@/copy/copy";
import { expect, test } from "./fixtures";
import type { TabeloPage } from "./helpers";

// Records is the second format with a document precondition, and the first
// whose precondition is about row values rather than headers alone. These
// cover the shape it produces, the blocked state for each of its three
// preconditions, and that its two download-only options never reach the pane.
//
// A new table starts with three data rows, so every test that needs a valid
// document fills the first column of all three: the precondition requires
// every one of them to be non-empty and unique, not only the row a test cares
// about.

async function nameColumns(
	tabelo: TabeloPage,
	...headers: readonly string[]
): Promise<void> {
	for (const [index, header] of headers.entries()) {
		await tabelo.editHeader(index + 1, header);
	}
}

async function fillFirstColumn(
	tabelo: TabeloPage,
	...values: readonly string[]
): Promise<void> {
	for (const [index, value] of values.entries()) {
		await tabelo.editCell(index + 1, 1, value);
	}
}

function blockedReason(tabelo: TabeloPage) {
	return tabelo
		.pane("records")
		.getByRole("status", { name: copy.a11y.blockedView });
}

test("renders a title line and a hyphen bullet per remaining column", async ({
	tabelo,
}) => {
	await nameColumns(tabelo, "Product", "Price");
	await fillFirstColumn(tabelo, "Product A", "Product B", "Product C");
	await tabelo.editCell(1, 2, "€20");

	await tabelo.choosePaneView("markdown", "records");

	const source = tabelo.source("records");
	await expect(source).toContainText("Product: Product A");
	await expect(source).toContainText("- Price: €20");
});

test("an unnamed table cannot be converted to the view at all", async ({
	tabelo,
}) => {
	// A new table starts with no header text and no cell values, which fails
	// every one of records' preconditions before the pane ever shows it.
	const dialog = await tabelo.openChangeViewDialog("markdown");
	await expect(
		dialog.getByRole("radio", { name: copy.views.records.label }),
	).toBeDisabled();
	await expect(
		dialog.getByRole("radio", { name: copy.views.csv.label }),
	).toBeEnabled();
});

test("an empty first column value blocks the open view", async ({ tabelo }) => {
	await nameColumns(tabelo, "Product", "Price");
	await fillFirstColumn(tabelo, "Product A", "Product B", "Product C");
	await tabelo.choosePaneView("markdown", "records");
	await expect(tabelo.source("records")).toBeVisible();

	await tabelo.editCell(1, 1, "");

	await expect(tabelo.source("records")).toHaveCount(0);
	await expect(blockedReason(tabelo)).toBeVisible();
});

test("a duplicated first column value blocks the open view", async ({
	tabelo,
}) => {
	await nameColumns(tabelo, "Product", "Price");
	await fillFirstColumn(tabelo, "Product A", "Product B", "Product C");
	await tabelo.choosePaneView("markdown", "records");
	await expect(tabelo.source("records")).toBeVisible();

	await tabelo.editCell(2, 1, "Product A");

	await expect(tabelo.source("records")).toHaveCount(0);
	await expect(blockedReason(tabelo)).toBeVisible();
});

test("correcting the duplicate restores the view in place", async ({
	tabelo,
}) => {
	// A pane cannot be switched to a view while its precondition already fails
	// (see "cannot be converted to the view at all" above), so the duplicate is
	// introduced after records is already the open view, exactly as the two
	// blocking tests above do it.
	await nameColumns(tabelo, "Product", "Price");
	await fillFirstColumn(tabelo, "Product A", "Product B", "Product C");
	await tabelo.choosePaneView("markdown", "records");
	await expect(tabelo.source("records")).toBeVisible();

	await tabelo.editCell(2, 1, "Product A");
	await expect(blockedReason(tabelo)).toBeVisible();

	await tabelo.editCell(2, 1, "Product B");

	await expect(blockedReason(tabelo)).toHaveCount(0);
	await expect(tabelo.source("records")).toContainText("Product: Product A");
});

test("the download chooser's options never change what the pane shows", async ({
	page,
	tabelo,
}) => {
	await nameColumns(tabelo, "Product", "Price");
	await fillFirstColumn(tabelo, "Product A", "Product B", "Product C");
	await tabelo.editCell(1, 2, "€20");
	await tabelo.choosePaneView("markdown", "records");

	await page.getByRole("button", { name: copy.actions.openAppMenu }).click();
	await page
		.getByRole("menuitem", { name: copy.actions.downloadTable })
		.click();
	const dialog = page.getByRole("dialog");
	await dialog.getByRole("radio", { name: copy.views.records.label }).click();

	await dialog
		.getByRole("checkbox", {
			name: copy.download.option("includeFirstColumnName"),
		})
		.click();
	await dialog
		.getByRole("checkbox", { name: copy.download.option("includeEmptyValues") })
		.click();
	await page.keyboard.press("Escape");

	await expect(tabelo.source("records")).toContainText("Product: Product A");
	await expect(tabelo.source("records")).toContainText("- Price: €20");
});
