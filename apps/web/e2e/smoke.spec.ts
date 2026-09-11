import { DEFAULT_TABLE_NAME, tableDocumentTitle } from "@/copy/product";

import { expect, test } from "./fixtures";

test("opens a clean workspace through accessible product labels", async ({
	page,
	tabelo,
}) => {
	await expect(page).toHaveTitle(tableDocumentTitle(DEFAULT_TABLE_NAME));
	await expect(page.locator("head > title")).toHaveCount(1);
	await expect(page.locator('head > meta[name="description"]')).toHaveCount(1);
	await expect(page.locator('head > meta[property="og:title"]')).toHaveCount(1);
	await expect(
		page.locator('head > meta[property="og:description"]'),
	).toHaveCount(1);
	// One set of icon links, all from the one mark (#307): the generator owns
	// them, so a second hand-written set or a second source image shows up here
	// as a duplicate.
	await expect(page.locator('head > link[rel="icon"]')).toHaveCount(2);
	await expect(
		page.locator('head > link[rel="icon"][type="image/svg+xml"]'),
	).toHaveAttribute("href", /\/logo\.svg$/);
	await expect(
		page.locator('head > link[rel="icon"][href$="favicon.ico"]'),
	).toHaveAttribute("sizes", "48x48");
	await expect(page.locator('head > link[rel="apple-touch-icon"]')).toHaveCount(
		1,
	);
	await expect(tabelo.pane("grid")).toBeVisible();
	await expect(tabelo.pane("markdown")).toBeVisible();
	// The strip is chrome, so it must not inflate the row count: one header row
	// plus three data rows.
	await expect(tabelo.grid()).toHaveAttribute("aria-rowcount", "4");
	// A new table starts unnamed. Its columns are identified by the index strip,
	// and an empty header borrows that letter for its accessible name.
	await expect(tabelo.header(1)).toHaveText("");
	await expect(tabelo.columnIndex(1)).toBeVisible();
	await expect(tabelo.cell(1, 1)).toHaveText("");
	await expect(tabelo.source("markdown")).toBeVisible();
});
