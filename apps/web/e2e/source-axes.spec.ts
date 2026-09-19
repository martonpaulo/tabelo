import type { Locator, Page } from "@playwright/test";
import { copy } from "@/copy/copy";
import { listViews } from "@/views/registry";
import type { ViewId } from "@/views/types";
import { expect, test } from "./fixtures";
import {
	editorScroller,
	openSubmenu,
	renderedSource,
	type TabeloPage,
} from "./helpers";

// A source view's column letters and line numbers act like the grid's axes
// (#395). Where the view's codec maps rows, a letter opens its column's menu
// and a table row's line number its row's menu, and a click selects what the
// label names. The
// keyboard reaches the same menus from the selection, as in the grid. Views
// are read from the registry by what their codec declares, so a view added
// later is covered by its declaration rather than by name.

const TABLE = [
	"| Name | City |",
	"| --- | --- |",
	"| Ingrid | Rio |",
	"| Paulo | Madrid |",
].join("\n");

const sourceViews = listViews().filter(
	(view) => view.kind === "source" && view.capabilities.editable,
);
const mappedViews = sourceViews.filter((view) => view.codec?.mapsSourceRows);
const unmappedViews = sourceViews.filter((view) => !view.codec?.mapsSourceRows);

async function seed(tabelo: TabeloPage, view: ViewId): Promise<Locator> {
	await tabelo.source("markdown").fill(TABLE);
	await expect(tabelo.cell(2, 1)).toHaveText("Paulo");
	if (view !== "markdown") await tabelo.choosePaneView("markdown", view);
	return tabelo.pane(view);
}

// The letter over a column, counted from 1 as the grid's strip is.
function letter(pane: Locator, column: number): Locator {
	return pane.locator(`.cm-tabeloColumnMarker[data-column="${column - 1}"]`);
}

// The line number of the text line holding `text`, whatever line the format
// spells that row on.
async function lineNumber(pane: Locator, text: string): Promise<Locator> {
	const scroller = editorScroller(pane);
	const lines = (await renderedSource(scroller)).split("\n");
	const index = lines.findIndex((line) => line.includes(text));
	expect(index).toBeGreaterThanOrEqual(0);
	return scroller
		.locator(".cm-lineNumbers .cm-gutterElement")
		.filter({ hasText: new RegExp(`^${index + 1}$`) });
}

// Waits until no menu remains, the closing one's exit included, so the next
// gesture opens a menu of its own rather than landing on one still leaving.
async function closed(page: Page): Promise<void> {
	await expect(page.getByRole("menu")).toHaveCount(0);
}

async function order(tabelo: TabeloPage): Promise<string[]> {
	return [
		(await tabelo.cell(1, 1).innerText()).trim(),
		(await tabelo.cell(2, 1).innerText()).trim(),
	];
}

async function headers(tabelo: TabeloPage): Promise<string[]> {
	return [
		(await tabelo.header(1).innerText()).trim(),
		(await tabelo.header(2).innerText()).trim(),
	];
}

for (const view of mappedViews) {
	test(`${view.id}: a column letter opens its column's menu, and a move is one undo step`, async ({
		page,
		tabelo,
	}) => {
		const pane = await seed(tabelo, view.id);
		await letter(pane, 1).click({ button: "right" });
		const menu = page.getByRole("menu");
		await expect(menu).toBeVisible();
		// Named as the grid's column menu is, by the column it acts on.
		await expect(menu).toHaveAccessibleName(/Name/);
		// Grid-only preferences stay in the grid.
		await expect(
			menu.getByRole("menuitem", { name: copy.actions.setColumnWidth }),
		).toHaveCount(0);
		await expect(menu.getByRole("menuitemradio").first()).toBeVisible();
		const move = await openSubmenu(page, menu, copy.actions.move);
		await move.getByRole("menuitem", { name: copy.actions.moveRight }).click();
		await closed(page);
		expect(await headers(tabelo)).toEqual(["City", "Name"]);

		await page.keyboard.press("ControlOrMeta+Z");
		await expect(tabelo.header(1)).toHaveText("Name");
	});

	test(`${view.id}: a row's line number opens its row's menu`, async ({
		page,
		tabelo,
	}) => {
		const pane = await seed(tabelo, view.id);
		await (await lineNumber(pane, "Paulo")).click({ button: "right" });
		const menu = page.getByRole("menu");
		await expect(menu).toHaveAccessibleName(
			copy.actions.rowActionsFor(copy.a11y.rowNumber(1)),
		);
		await menu
			.getByRole("menuitem", { name: copy.actions.duplicateRows(1) })
			.click();
		await closed(page);
		await expect(tabelo.cell(3, 1)).toHaveText("Paulo");
		await page.keyboard.press("ControlOrMeta+Z");
		await expect(tabelo.cell(3, 1)).toHaveCount(0);
	});

	test(`${view.id}: a letter's click selects its column, so typing edits every cell`, async ({
		page,
		tabelo,
	}) => {
		const pane = await seed(tabelo, view.id);
		await letter(pane, 2).click();
		await expect(tabelo.source(view.id)).toBeFocused();
		await page.keyboard.type("Oslo");
		await expect(tabelo.header(2)).toHaveText("Oslo");
		await expect(tabelo.cell(1, 2)).toHaveText("Oslo");
		await expect(tabelo.cell(2, 2)).toHaveText("Oslo");
		await expect(tabelo.cell(1, 1)).toHaveText("Ingrid");
	});

	test(`${view.id}: from the keyboard, a selected row or column opens its own menu`, async ({
		page,
		tabelo,
	}) => {
		await seed(tabelo, view.id);
		const editor = tabelo.source(view.id);
		await editor.click();
		await editor.press("ControlOrMeta+End");
		await page.keyboard.press("ContextMenu");
		const menu = page.getByRole("menu");
		await menu.getByRole("menuitem", { name: copy.actions.selectRow }).click();
		await closed(page);
		await expect(editor).toBeFocused();
		await page.keyboard.press("ContextMenu");
		await expect(menu).toHaveAccessibleName(
			copy.actions.rowActionsFor(copy.a11y.rowNumber(1)),
		);
		await page.keyboard.press("Escape");
		await closed(page);

		// Back into the last row's last value, whatever closes the line.
		await page.keyboard.press("End");
		await page.keyboard.press("ArrowLeft");
		await page.keyboard.press("ArrowLeft");
		await page.keyboard.press("ContextMenu");
		await menu
			.getByRole("menuitem", { name: copy.actions.selectColumn })
			.click();
		await closed(page);
		await page.keyboard.press("ContextMenu");
		await expect(menu).toHaveAccessibleName(/City/);
		await menu
			.getByRole("menuitem", { name: copy.actions.sortAscending })
			.click();
		await expect(tabelo.cell(1, 1)).toHaveText("Paulo");
		expect(await order(tabelo)).toEqual(["Paulo", "Ingrid"]);
	});
}

test("a line that names no table row offers no menu", async ({
	page,
	tabelo,
}) => {
	const pane = await seed(tabelo, "markdown");
	await (await lineNumber(pane, "---")).click({ button: "right" });
	await expect(page.getByRole("menu")).toHaveCount(0);
});

for (const view of unmappedViews) {
	test(`${view.id}: a format that maps no rows has no letters, and its line numbers open the text menu`, async ({
		page,
		tabelo,
	}) => {
		const pane = await seed(tabelo, view.id);
		await expect(pane.locator(".cm-tabeloColumnMarker:visible")).toHaveCount(0);
		await editorScroller(pane)
			.locator(".cm-lineNumbers .cm-gutterElement")
			.filter({ hasText: /^1$/ })
			.click({ button: "right" });
		const menu = page.getByRole("menu");
		await expect(menu).toBeVisible();
		await expect(
			menu.getByRole("menuitem", { name: copy.actions.selectRow }),
		).toHaveCount(0);
	});
}
