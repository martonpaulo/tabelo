import type { Locator, Page } from "@playwright/test";
import { copy } from "@/copy/copy";
import { samplePerson } from "@/core/sample-data";
import { listViews } from "@/views/registry";
import type { ViewId } from "@/views/types";
import { expect, test } from "./fixtures";
import {
	editorScroller,
	openSubmenu,
	renderedSource,
	type TabeloPage,
} from "./helpers";

// Line numbers act on rows in the views whose rows are blocks (#402): a JSON
// object, a Records entry, an HTML `<tr>`. Each codec maps its rows from its
// own parse, so every line of a row names it, brackets and tags included, and
// a line outside every row offers nothing. These views have no header line of
// cells, so they show no column letters. The views are read from the registry
// by what their codec declares; the per-format cases below then spell a row
// the way a user might, across lines the serializer would not use.

const ingrid = samplePerson(0);
const paulo = samplePerson(1);

const TABLE = [
	"| Name | City |",
	"| --- | --- |",
	`| ${ingrid.name} | ${ingrid.city} |`,
	`| ${paulo.name} | ${paulo.city} |`,
].join("\n");

const blockViews = listViews().filter(
	(view) =>
		view.kind === "source" &&
		view.capabilities.editable &&
		view.codec?.mapsSourceRows &&
		!view.codec.mapsSourceColumns,
);

async function seed(tabelo: TabeloPage, view: ViewId): Promise<Locator> {
	await tabelo.source("markdown").fill(TABLE);
	await expect(tabelo.cell(2, 1)).toHaveText(paulo.name);
	await tabelo.choosePaneView("markdown", view);
	return tabelo.pane(view);
}

// The line number of the text line at `index`, counted from 0.
function lineNumberAt(pane: Locator, index: number): Locator {
	return editorScroller(pane)
		.locator(".cm-lineNumbers .cm-gutterElement")
		.filter({ hasText: new RegExp(`^${index + 1}$`) });
}

// The index of the first rendered line that `matches`.
async function lineIndex(
	pane: Locator,
	matches: (line: string) => boolean,
): Promise<number> {
	const lines = (await renderedSource(editorScroller(pane))).split("\n");
	const index = lines.findIndex(matches);
	expect(index).toBeGreaterThanOrEqual(0);
	return index;
}

// A row menu's Move submenu, as the grid's row menu has it (#369).
async function moveRow(page: Page, menu: Locator, name: string): Promise<void> {
	const move = await openSubmenu(page, menu, copy.actions.move);
	await move.getByRole("menuitem", { name }).click();
}

async function closed(page: Page): Promise<void> {
	await expect(page.getByRole("menu")).toHaveCount(0);
}

const values = ["Name", "City", ingrid.name, ingrid.city, paulo.name];

for (const view of blockViews) {
	test(`${view.id}: no letters, and a line outside every row offers nothing`, async ({
		page,
		tabelo,
	}) => {
		const pane = await seed(tabelo, view.id);
		await expect(pane.locator(".cm-tabeloColumnMarker:visible")).toHaveCount(0);
		// The array's bracket, the table's tag, or the blank line between two
		// records: whichever the format writes first outside a row.
		const outside = await lineIndex(
			pane,
			(line) => !values.some((value) => line.includes(value)),
		);
		await lineNumberAt(pane, outside).click({ button: "right" });
		await expect(page.getByRole("menu")).toHaveCount(0);
	});

	test(`${view.id}: every line of a row names it, and its menu acts on it`, async ({
		page,
		tabelo,
	}) => {
		const pane = await seed(tabelo, view.id);
		// The last line holding Paulo's row: his city, or the tag or bracket
		// that closes the row after it.
		const city = await lineIndex(pane, (line) => line.includes(paulo.city));
		await lineNumberAt(pane, city).click({ button: "right" });
		const menu = page.getByRole("menu");
		await expect(menu).toHaveAccessibleName(
			copy.actions.rowActionsFor(copy.a11y.rowNumber(1)),
		);
		await moveRow(page, menu, copy.actions.moveUp);
		await closed(page);
		await expect(tabelo.cell(1, 1)).toHaveText(paulo.name);
		await expect(tabelo.cell(2, 1)).toHaveText(ingrid.name);
		await page.keyboard.press("ControlOrMeta+Z");
		await expect(tabelo.cell(1, 1)).toHaveText(ingrid.name);
	});

	test(`${view.id}: a click on a row's line number selects the row, and the keyboard opens its menu`, async ({
		page,
		tabelo,
	}) => {
		const pane = await seed(tabelo, view.id);
		const line = await lineIndex(pane, (text) => text.includes(ingrid.name));
		await lineNumberAt(pane, line).click();
		await expect(tabelo.source(view.id)).toBeFocused();
		await page.keyboard.press("ContextMenu");
		const menu = page.getByRole("menu");
		await expect(menu).toHaveAccessibleName(
			copy.actions.rowActionsFor(copy.a11y.rowNumber(0)),
		);
		await menu
			.getByRole("menuitem", { name: copy.actions.duplicateRows(1) })
			.click();
		await closed(page);
		await expect(tabelo.cell(2, 1)).toHaveText(ingrid.name);
		await expect(tabelo.cell(3, 1)).toHaveText(paulo.name);
	});
}

test("json: an object the user spread over many lines is one row from its brace to its brace", async ({
	page,
	tabelo,
}) => {
	const pane = await seed(tabelo, "json");
	const editor = tabelo.source("json");
	await editor.fill(
		[
			"[",
			"  {",
			`    "Name": "${ingrid.name}",`,
			`    "City": "${ingrid.city}"`,
			"  },",
			"  {",
			`    "City": "${paulo.city}",`,
			`    "Name": "${paulo.name}"`,
			"  }",
			"]",
		].join("\n"),
	);
	await expect(tabelo.cell(2, 2)).toHaveText(paulo.city);
	// The closing brace of the second object, a line with no value on it.
	await lineNumberAt(pane, 8).click({ button: "right" });
	const menu = page.getByRole("menu");
	await expect(menu).toHaveAccessibleName(
		copy.actions.rowActionsFor(copy.a11y.rowNumber(1)),
	);
	await moveRow(page, menu, copy.actions.moveUp);
	await closed(page);
	await expect(tabelo.cell(1, 1)).toHaveText(paulo.name);
	await expect(tabelo.cell(1, 2)).toHaveText(paulo.city);
});

test("json: a draft that does not parse names no row", async ({
	page,
	tabelo,
}) => {
	const pane = await seed(tabelo, "json");
	const editor = tabelo.source("json");
	const text = await renderedSource(editorScroller(pane));
	await editor.fill(text.replace(/\]\s*$/, ""));
	const line = await lineIndex(pane, (entry) => entry.includes(paulo.name));
	await lineNumberAt(pane, line).click({ button: "right" });
	await expect(tabelo.notice("warning")).toBeVisible();
	await expect(page.getByRole("menu")).toHaveCount(0);
	await expect(tabelo.cell(2, 1)).toHaveText(paulo.name);
});

test("records: a bullet line names its record", async ({ page, tabelo }) => {
	const pane = await seed(tabelo, "records");
	const bullet = await lineIndex(pane, (line) =>
		line.includes(`City: ${paulo.city}`),
	);
	await lineNumberAt(pane, bullet).click();
	await page.keyboard.press("ContextMenu");
	const menu = page.getByRole("menu");
	await expect(menu).toHaveAccessibleName(
		copy.actions.rowActionsFor(copy.a11y.rowNumber(1)),
	);
	await moveRow(page, menu, copy.actions.moveUp);
	await closed(page);
	await expect(tabelo.cell(1, 1)).toHaveText(paulo.name);
});

test("html: a row written with attributes and loose whitespace keeps its row menu", async ({
	page,
	tabelo,
}) => {
	const pane = await seed(tabelo, "html");
	await tabelo
		.source("html")
		.fill(
			[
				'<table class="people">',
				'  <tr data-note="a > b"><th>Name</th><th>City</th></tr>',
				"  <tr>",
				`    <td title='first'>${ingrid.name}</td>`,
				`    <td>${ingrid.city}</td>`,
				"  </tr>",
				`  <TR><TD>${paulo.name}</TD><TD>${paulo.city}</TD></TR>`,
				"</table>",
			].join("\n"),
		);
	await expect(tabelo.cell(2, 2)).toHaveText(paulo.city);
	// The bare `<tr>` line opening Ingrid's row names it.
	await lineNumberAt(pane, 2).click({ button: "right" });
	const menu = page.getByRole("menu");
	await expect(menu).toHaveAccessibleName(
		copy.actions.rowActionsFor(copy.a11y.rowNumber(0)),
	);
	await moveRow(page, menu, copy.actions.moveDown);
	await closed(page);
	await expect(tabelo.cell(1, 1)).toHaveText(paulo.name);
	await expect(tabelo.cell(2, 1)).toHaveText(ingrid.name);
});
