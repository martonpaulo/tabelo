import { copy } from "@/copy/copy";
import { samplePeopleCsv } from "@/core/sample-data";
import { expect, test } from "./fixtures";
import type { TabeloPage } from "./helpers";

// Sorting is a document operation rather than a view state, so the browser
// contract is what a unit test cannot reach: the grid, the Markdown pane, and
// the history all describe the same order, immediately, from one command.

const modifier = process.platform === "darwin" ? "Meta" : "Control";

// The roster in roster order, which is not name order: sorting by name has
// something to do.
async function seedRoster(tabelo: TabeloPage): Promise<void> {
	await tabelo.paste(samplePeopleCsv(4).replaceAll(",", "\t"));
	await tabelo.dismissNotices();
}

// The first column's data cells, top to bottom. The header row carries the
// row sentinel in its own coordinate, so excluding it needs no other rule.
function names(tabelo: TabeloPage): Promise<string[]> {
	return tabelo
		.grid()
		.locator('[data-cell$=":0"]:not([data-cell^="-1:"])')
		.allInnerTexts();
}

async function sortColumn(
	tabelo: TabeloPage,
	column: number,
	label: string,
): Promise<void> {
	const menu = await tabelo.openColumnMenu(column);
	await menu.getByRole("menuitem", { name: label }).click();
	await menu.waitFor({ state: "hidden" });
}

test("sorting a column reorders the document for every open view", async ({
	tabelo,
}) => {
	await seedRoster(tabelo);
	await sortColumn(tabelo, 1, copy.actions.sortAscending);

	await expect(tabelo.cell(1, 1)).toHaveText("Felix");
	await expect(tabelo.cell(4, 1)).toHaveText("Paulo");
	// The Markdown pane is a projection of the same document, so it agrees
	// without any further action.
	const source = tabelo.source("markdown");
	await expect(source).toContainText("Felix");
	const markdown = await source.innerText();
	expect(markdown.indexOf("Felix")).toBeLessThan(markdown.indexOf("Paulo"));

	await sortColumn(tabelo, 1, copy.actions.sortDescending);
	await expect(tabelo.cell(1, 1)).toHaveText("Paulo");
	await expect(tabelo.cell(4, 1)).toHaveText("Felix");
});

test("a sort is one undo step, and redo returns to the sorted order", async ({
	tabelo,
}) => {
	await seedRoster(tabelo);
	const before = await names(tabelo);

	await sortColumn(tabelo, 1, copy.actions.sortAscending);
	const sorted = await names(tabelo);
	expect(sorted).not.toEqual(before);

	await tabelo.runAppCommand("undo");
	expect(await names(tabelo)).toEqual(before);

	await tabelo.runAppCommand("redo");
	expect(await names(tabelo)).toEqual(sorted);
});

test("sorting is reachable and announced from the keyboard", async ({
	page,
	tabelo,
}) => {
	await seedRoster(tabelo);
	// Select the age column first and let the grid finish saying so. Opening a
	// menu on an unselected column selects it, and that summary settles on a
	// timer: waiting for it here is what makes the announcement under test the
	// sort's own rather than whichever of the two landed last.
	await tabelo.columnIndex(4).getByRole("button").first().click();
	await expect(tabelo.announcements).not.toBeEmpty();

	const trigger = tabelo.columnIndex(4).getByRole("button", {
		name: new RegExp(`^${copy.actions.columnActions}:`),
	});
	await trigger.focus();
	await page.keyboard.press("Enter");

	const menu = page.getByRole("menu", {
		name: new RegExp(`^${copy.actions.columnActions}:`),
	});
	await menu.waitFor({ state: "visible" });
	const item = menu.getByRole("menuitem", {
		name: copy.actions.sortDescending,
	});
	await item.focus();
	await page.keyboard.press("Enter");
	await menu.waitFor({ state: "hidden" });

	// The age column, descending: the oldest of the four is first.
	await expect(tabelo.cell(1, 4)).toHaveText("60");
	await expect(tabelo.announcements).toContainText(copy.status.rowsSorted(4));
	// Focus returns to the control the menu was opened from.
	await expect(trigger).toBeFocused();
});

test("sorting an ordered table says so instead of claiming rows moved", async ({
	tabelo,
}) => {
	await seedRoster(tabelo);
	// Select the column and let the grid finish saying so before any sort. The
	// menu selects its target column when it opens, and that summary settles on
	// a timer that would otherwise land after the announcement under test.
	await tabelo.columnIndex(1).getByRole("button").first().click();
	await expect(tabelo.announcements).not.toBeEmpty();

	await sortColumn(tabelo, 1, copy.actions.sortAscending);
	const sorted = await names(tabelo);

	await sortColumn(tabelo, 1, copy.actions.sortAscending);
	expect(await names(tabelo)).toEqual(sorted);
	await expect(tabelo.announcements).toContainText(
		copy.status.rowsAlreadySorted,
	);
});

test("a one-row table says why it cannot be sorted", async ({ tabelo }) => {
	await tabelo.paste("name\tcity\nIngrid\tRio");
	await tabelo.dismissNotices();

	const menu = await tabelo.openColumnMenu(1);
	const item = menu.getByRole("menuitem", { name: copy.actions.sortAscending });
	// Unavailable through the accessibility tree, so the reason stays reachable
	// rather than the item dropping out of the menu's keyboard order.
	await expect(item).toBeDisabled();
	await item.hover();
	const tooltip = tabelo.page.locator('[role="tooltip"][data-open]');
	await expect(tooltip).toBeVisible();
	await expect(tooltip).toContainText(copy.disabled.sortSingleRow);
	await expect(item).toHaveAccessibleDescription(copy.disabled.sortSingleRow);
});

test("sorting acts on the menu's column and keeps every selected area", async ({
	page,
	tabelo,
}) => {
	await seedRoster(tabelo);
	// The city column and the age column, selected as two separate areas.
	const handle = (column: number) =>
		tabelo.columnIndex(column).getByRole("button").first();
	await handle(2).click();
	await handle(4).click({ modifiers: [modifier] });

	// Opening the city column's own menu keeps both areas: a menu only
	// collapses a selection that does not already hold its target.
	await sortColumn(tabelo, 2, copy.actions.sortAscending);

	// Sorted by city, which is neither roster order nor name order.
	await expect(tabelo.cell(1, 2)).toHaveText("Buenos Aires");
	await expect(tabelo.cell(1, 1)).toHaveText("Mabel");
	for (const column of [2, 4]) {
		await expect(tabelo.header(column)).toHaveAttribute(
			"aria-selected",
			"true",
		);
	}
	// The columns that were never selected still are not.
	await expect(tabelo.header(1)).toHaveAttribute("aria-selected", "false");
	// Nothing about the sort moved the focus out of the grid.
	await expect(
		page.locator('[data-cell][aria-selected="true"]').first(),
	).toBeVisible();
});

test("a sort keeps every row of a selected block selected", async ({
	page,
	tabelo,
}) => {
	// Ascending swaps the first two rows only, so the selected block stays one
	// run while its own first row becomes the middle of it.
	await tabelo.paste("key\tvalue\nb\t1\na\t2\nc\t3");
	await tabelo.dismissNotices();

	// The sort column as a column region, which is what keeps the menu from
	// collapsing the selection, and a separate three-row block beside it.
	await tabelo.columnIndex(1).getByRole("button").first().click();
	await tabelo.cell(1, 2).click({ modifiers: [modifier] });
	await page.keyboard.press("Shift+ArrowDown");
	await page.keyboard.press("Shift+ArrowDown");

	await sortColumn(tabelo, 1, copy.actions.sortAscending);
	await expect(tabelo.cell(1, 1)).toHaveText("a");

	// All three cells of the block are still selected. Losing the one whose
	// row moved to the middle would silently change what a later copy or clear
	// acts on.
	for (const row of [1, 2, 3]) {
		await expect(tabelo.cell(row, 2)).toHaveAttribute("aria-selected", "true");
	}
});
