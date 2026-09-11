import { copy } from "@/copy/copy";
import {
	DEFAULT_TABLE_NAME,
	product,
	tableDocumentTitle,
} from "@/copy/product";

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

// #362: the product, its author, and its source are said on first sight, and
// the same words are in the HTML a crawler without JavaScript reads.
test("the first visit and the page source credit the author and link the source", async ({
	page,
	request,
}) => {
	const html = await (await request.get("/")).text();
	expect(html.match(/<h1\b/g)?.length).toBe(1);
	expect(html).toContain(`href="${product.author.url}"`);
	expect(html).toContain(`href="${product.repositoryUrl}"`);

	await page.goto("/");
	const welcome = page.getByRole("region", { name: copy.empty.title });
	await expect(welcome).toBeVisible();
	await expect(
		welcome.getByRole("link", { name: product.author.name }),
	).toHaveAttribute("href", product.author.url);
	await expect(
		welcome.getByRole("link", { name: copy.empty.source }),
	).toHaveAttribute("href", product.repositoryUrl);
	// Once the app is up there is still exactly one page heading.
	await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
});
