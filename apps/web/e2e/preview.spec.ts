import type { Locator } from "@playwright/test";
import { copy } from "@/copy/copy";
import { expect, test } from "./fixtures";
import { TabeloPage } from "./helpers";

// The rendered preview is a neutral document table: the reader's view of what
// leaves Tabelo, not a surface with a treatment of its own. These cover the
// three rules it used to break and the two gaps it used to have.

function previewTable(pane: Locator): Locator {
	return pane.getByRole("table", { name: copy.a11y.preview });
}

// The hairline is authored as `0.0625rem`, so the threshold has to be derived
// from the running document's root size rather than guessed in pixels.
function hairlinePixels(table: Locator): Promise<number> {
	return table.evaluate(
		(element) =>
			Number.parseFloat(
				getComputedStyle(element.ownerDocument.documentElement).fontSize,
			) * 0.0625,
	);
}

function borderWidths(table: Locator): Promise<number[]> {
	return table.evaluate((element) =>
		[...element.querySelectorAll("th, td")].flatMap((cell) => {
			const styles = getComputedStyle(cell);
			return [
				styles.borderTopWidth,
				styles.borderRightWidth,
				styles.borderBottomWidth,
				styles.borderLeftWidth,
			].map((width) => Number.parseFloat(width));
		}),
	);
}

async function openPreview(tabelo: TabeloPage): Promise<Locator> {
	// A paste leaves the header-guess notice floating over the pane header, and
	// the pane menu is underneath it.
	await tabelo.dismissNotices();
	await tabelo.choosePaneView("markdown", "html-preview");
	return tabelo.pane("html-preview");
}

test("no rule in the preview is heavier than the product hairline", async ({
	tabelo,
}) => {
	await tabelo.paste("Name\tCity\nIngrid\tRio\nPaulo\tMadrid");
	const table = previewTable(await openPreview(tabelo));

	const hairline = await hairlinePixels(table);
	const widths = await borderWidths(table);
	expect(widths.length).toBeGreaterThan(0);
	for (const width of widths) {
		expect(width).toBeLessThanOrEqual(hairline + 0.5);
	}
});

test("body rows carry no alternating tint", async ({ tabelo }) => {
	await tabelo.paste(
		"Name\tCity\nIngrid\tRio\nPaulo\tMadrid\nIngrid\tMadrid\nPaulo\tRio",
	);
	const table = previewTable(await openPreview(tabelo));

	const backgrounds = await table.evaluate((element) => [
		...new Set(
			[...element.querySelectorAll("tbody tr")].map(
				(row) => getComputedStyle(row).backgroundColor,
			),
		),
	]);
	expect(backgrounds).toHaveLength(1);
});

test("the table sits directly on the pane, without a card around it", async ({
	tabelo,
}) => {
	await tabelo.paste("Name\tCity\nIngrid\tRio");
	const pane = await openPreview(tabelo);
	const table = previewTable(pane);

	const parentSlot = await table.evaluate((element) =>
		element.parentElement?.getAttribute("data-slot"),
	);
	expect(parentSlot).toBe("preview-scroller");
});

test("column alignment reaches the preview", async ({ page, tabelo }) => {
	await tabelo.paste("Name\tCity\nIngrid\tRio");

	await tabelo
		.columnIndex(2)
		.getByRole("button", {
			name: new RegExp(`^${copy.actions.columnActions}:`),
		})
		.click();
	await page
		.getByRole("menuitemradio", { name: copy.actions.alignRight })
		.click();

	const table = previewTable(await openPreview(tabelo));
	await expect(table.getByRole("columnheader").nth(1)).toHaveCSS(
		"text-align",
		"right",
	);
	await expect(table.getByRole("cell").nth(1)).toHaveCSS("text-align", "right");
});

// The grid refuses to delete the last row and every parse seeds one, so a
// document with columns and no rows is only reachable through storage, which
// the persisted schema accepts. Restoring one must not leave a bare header row.
const rowlessDocument = JSON.stringify({
	version: 4,
	document: {
		columns: [
			{ id: "column-name", header: "Name", align: "default" },
			{ id: "column-city", header: "City", align: "default" },
		],
		rows: [],
	},
	workspace: {
		layout: "single",
		panes: [
			{
				id: "pane-preview",
				view: "html-preview",
				slots: ["a", "b", "c", "d"],
				zoom: 1,
				wrap: false,
			},
		],
		wrappedColumns: [],
		columnRatio: 0.5,
		rowRatio: 0.5,
		activePaneId: "pane-preview",
	},
	draft: null,
});

test("a document with no rows shows a written empty state", async ({
	page,
}) => {
	await page.addInitScript((value) => {
		window.localStorage.setItem("tabelo.document", value);
	}, rowlessDocument);
	const tabelo = new TabeloPage(page);
	await page.goto("/");
	await tabelo.workspace.waitFor({ state: "visible" });

	const pane = tabelo.pane("html-preview");
	await expect(pane.locator('[data-slot="preview-empty"]')).toBeVisible();
	await expect(previewTable(pane)).toHaveCount(0);
});
