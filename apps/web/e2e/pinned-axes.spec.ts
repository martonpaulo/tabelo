import type { Locator } from "@playwright/test";
import { copy } from "@/copy/copy";
import {
	samplePeople,
	samplePeopleCsv,
	samplePeopleHeaders,
} from "@/core/sample-data";
import { expect, test } from "./fixtures";
import type { TabeloPage } from "./helpers";

// The header row, the column letters, and the row numbers were already sticky.
// What the user can now ask for is the first row and the first column of their
// own data, which in most tables is the one that says which record a cell
// belongs to.

// Enough rows to scroll past. The roster cycles rather than growing: what this
// needs is length, and inventing thirty more people to get it would add nothing.
const ROW_COUNT = 30;

function tallRoster(): string {
	const body = Array.from({ length: ROW_COUNT }, (_, index) => {
		const person = samplePeople[index % samplePeople.length];
		if (!person) throw new Error("Expected a sample person.");
		return [person.name, person.city, person.role, String(person.age)];
	});
	return [[...samplePeopleHeaders], ...body]
		.map((row) => row.join("\t"))
		.join("\n");
}

function scroller(tabelo: TabeloPage): Locator {
	return tabelo.pane("grid").locator('[data-slot="panel-body"]');
}

async function scrollGrid(
	tabelo: TabeloPage,
	left: number,
	top: number,
): Promise<void> {
	await scroller(tabelo).evaluate(
		(element, to) => {
			element.scrollTo({ left: to.left, top: to.top, behavior: "auto" });
		},
		{ left, top },
	);
}

// Which cell actually answers at the middle of this one's own box. Itself means
// it is inside the scrollport and nothing is painted over it, which is the whole
// contract for a pinned layer: still there, and still on top. Anything else,
// including nothing at all, means it has scrolled away or been covered.
async function cellAtItsOwnCentre(cell: Locator): Promise<string | null> {
	return cell.evaluate((element) => {
		const box = element.getBoundingClientRect();
		const found = element.ownerDocument.elementFromPoint(
			box.left + box.width / 2,
			box.top + box.height / 2,
		);
		return found?.closest("[data-cell]")?.getAttribute("data-cell") ?? null;
	});
}

async function openColumnMenu(
	tabelo: TabeloPage,
	column: number,
	header: string,
): Promise<Locator> {
	const name = `${copy.actions.columnActions}: ${copy.a11y.columnWithExpectedType(header, column - 1, "text")}`;
	const menu = tabelo.page.getByRole("menu", { name });
	await menu.waitFor({ state: "hidden" });
	await tabelo.grid().getByRole("button", { name }).click();
	await menu.waitFor();
	return menu;
}

async function openRowMenu(
	tabelo: TabeloPage,
	dataRow: number,
): Promise<Locator> {
	const name = `${copy.actions.rowActions}: ${copy.a11y.rowNumber(dataRow - 1)}`;
	const menu = tabelo.page.getByRole("menu", { name });
	await menu.waitFor({ state: "hidden" });
	// Exact, because "Row 2" is also a prefix of "Row 20" through "Row 29".
	await tabelo.grid().getByRole("button", { name, exact: true }).click();
	await menu.waitFor();
	return menu;
}

// Only one axis menu root exists, so the next menu cannot open until this one
// has finished closing. Waiting for that is what keeps a second open from
// racing the first one's exit.
async function closeMenu(tabelo: TabeloPage, menu: Locator): Promise<void> {
	await tabelo.page.keyboard.press("Escape");
	await menu.waitFor({ state: "hidden" });
}

function pinItem(menu: Locator, axis: "row" | "column"): Locator {
	return menu.getByRole("menuitemcheckbox", {
		name:
			axis === "row" ? copy.actions.pinFirstRow : copy.actions.pinFirstColumn,
	});
}

async function seed(tabelo: TabeloPage): Promise<void> {
	await tabelo.paste(tallRoster());
	await tabelo.dismissNotices();
}

test("a pinned first column holds its place while the grid scrolls sideways", async ({
	tabelo,
}) => {
	await seed(tabelo);
	const first = tabelo.cell(1, 1);

	// Unpinned, it scrolls away like any other cell.
	await scrollGrid(tabelo, 400, 0);
	expect(await cellAtItsOwnCentre(first)).not.toBe("0:0");

	await scrollGrid(tabelo, 0, 0);
	const menu = await openColumnMenu(tabelo, 1, samplePeopleHeaders[0]);
	const pin = pinItem(menu, "column");
	await expect(pin).not.toBeChecked();
	await pin.click();
	await expect(pin).toBeChecked();
	await closeMenu(tabelo, menu);

	await scrollGrid(tabelo, 400, 0);
	expect(await cellAtItsOwnCentre(first)).toBe("0:0");
	await expect(first).toHaveText(samplePeople[0]?.name ?? "");
});

test("a pinned first row holds its place while the grid scrolls down", async ({
	tabelo,
}) => {
	await seed(tabelo);
	const first = tabelo.cell(1, 2);

	await scrollGrid(tabelo, 0, 400);
	expect(await cellAtItsOwnCentre(first)).not.toBe("0:1");

	await scrollGrid(tabelo, 0, 0);
	const menu = await openRowMenu(tabelo, 1);
	const pin = pinItem(menu, "row");
	await expect(pin).not.toBeChecked();
	await pin.click();
	await expect(pin).toBeChecked();
	await closeMenu(tabelo, menu);

	await scrollGrid(tabelo, 0, 400);
	expect(await cellAtItsOwnCentre(first)).toBe("0:1");
});

test("both axes pinned keep their intersection on top at every scroll position", async ({
	tabelo,
}) => {
	await seed(tabelo);
	await pinBoth(tabelo);

	// At rest, all three are simply where they belong.
	await scrollGrid(tabelo, 0, 0);
	expect(await cellAtItsOwnCentre(tabelo.cell(1, 1))).toBe("0:0");
	expect(await cellAtItsOwnCentre(tabelo.cell(1, 2))).toBe("0:1");
	expect(await cellAtItsOwnCentre(tabelo.cell(2, 1))).toBe("1:0");

	// Scrolled down, the pinned row is still the row: its second cell has
	// nothing in front of it, because the pinned column is at rest.
	await scrollGrid(tabelo, 0, 400);
	expect(await cellAtItsOwnCentre(tabelo.cell(1, 1))).toBe("0:0");
	expect(await cellAtItsOwnCentre(tabelo.cell(1, 2))).toBe("0:1");

	// Scrolled sideways, the pinned column is still the column, and the row
	// beside its first cell has passed underneath it, which is what pinning a
	// column means.
	await scrollGrid(tabelo, 400, 0);
	expect(await cellAtItsOwnCentre(tabelo.cell(1, 1))).toBe("0:0");
	expect(await cellAtItsOwnCentre(tabelo.cell(2, 1))).toBe("1:0");
	expect(await cellAtItsOwnCentre(tabelo.cell(1, 2))).not.toBe("0:1");

	// Both at once is the case the layering exists for: one cell belongs to two
	// pinned layers, and it renders once, on top, still carrying its value.
	// Each layer has swallowed the other's second cell, symmetrically.
	await scrollGrid(tabelo, 400, 400);
	expect(await cellAtItsOwnCentre(tabelo.cell(1, 1))).toBe("0:0");
	expect(await cellAtItsOwnCentre(tabelo.cell(1, 2))).not.toBe("0:1");
	expect(await cellAtItsOwnCentre(tabelo.cell(2, 1))).not.toBe("1:0");
	await expect(tabelo.cell(1, 1)).toHaveText(samplePeople[0]?.name ?? "");

	// And the pinned column continues underneath it: whatever row has scrolled
	// to just below the pinned row is still showing its first column there.
	expect(await columnJustBelowTheCorner(tabelo)).toBe(0);
});

// Which column answers immediately below the pinned intersection, at the
// intersection's own horizontal middle. Zero means the pinned column is still
// the column at that edge, whatever row has scrolled into it.
async function columnJustBelowTheCorner(
	tabelo: TabeloPage,
): Promise<number | null> {
	return tabelo.grid().evaluate((grid) => {
		const corner = grid.querySelector("[data-pinned-row][data-pinned-column]");
		if (!corner) return null;
		const box = corner.getBoundingClientRect();
		const found = grid.ownerDocument.elementFromPoint(
			box.left + box.width / 2,
			box.bottom + 4,
		);
		const id = found?.closest("[data-cell]")?.getAttribute("data-cell");
		const column = id?.split(":")[1];
		return column === undefined ? null : Number(column);
	});
}

test("both preferences survive a reload", async ({ tabelo }) => {
	await seed(tabelo);
	await pinBoth(tabelo);

	await tabelo.page.reload();
	await tabelo.grid().waitFor();

	const menu = await openColumnMenu(tabelo, 1, samplePeopleHeaders[0]);
	await expect(pinItem(menu, "column")).toBeChecked();
	await closeMenu(tabelo, menu);
	const rowMenu = await openRowMenu(tabelo, 1);
	await expect(pinItem(rowMenu, "row")).toBeChecked();
	await closeMenu(tabelo, rowMenu);

	await scrollGrid(tabelo, 400, 400);
	expect(await cellAtItsOwnCentre(tabelo.cell(1, 1))).toBe("0:0");
});

test("pinning reaches no serialized view and no history step", async ({
	page,
	tabelo,
}) => {
	// Short on purpose: the source pane renders the whole projection, so a
	// comparison over it sees everything the document would have carried.
	await tabelo.paste(samplePeopleCsv(2).replaceAll(",", "\t"));
	await tabelo.dismissNotices();
	const source = tabelo.source("markdown");
	await tabelo.editCell(2, 2, "Lisbon");
	const before = await source.textContent();

	await pinBoth(tabelo);

	// A preference that leaked into the document would show up here, because
	// Markdown is a projection of the whole document and nothing else.
	expect(await source.textContent()).toBe(before);

	// Undo has one step to spend, and it is the cell edit. Pinning took none, so
	// the pins are still on once the edit is gone.
	await tabelo.cell(1, 1).click();
	await page.keyboard.press("ControlOrMeta+z");
	await expect(tabelo.cell(2, 2)).toHaveText(samplePeople[1]?.city ?? "");

	const menu = await openRowMenu(tabelo, 1);
	await expect(pinItem(menu, "row")).toBeChecked();
});

test("the pin toggles from the keyboard and reads back its own state", async ({
	page,
	tabelo,
}) => {
	await seed(tabelo);

	const name = `${copy.actions.rowActions}: ${copy.a11y.rowNumber(0)}`;
	await tabelo.grid().getByRole("button", { name, exact: true }).focus();
	await page.keyboard.press("Enter");
	const menu = page.getByRole("menu", { name });
	await menu.waitFor();

	const pin = pinItem(menu, "row");
	await pin.focus();
	await page.keyboard.press("Enter");
	await expect(pin).toBeChecked();
});

test("a one-column table keeps the preference until it has a column to pin against", async ({
	tabelo,
}) => {
	const [ingrid, paulo] = samplePeople;
	await tabelo.paste(`name\n${ingrid?.name}\n${paulo?.name}`);
	await tabelo.dismissNotices();

	let menu = await openColumnMenu(tabelo, 1, samplePeopleHeaders[0]);
	const pin = pinItem(menu, "column");
	await pin.click();
	await expect(pin).toBeChecked();

	// The only column holds its place against nothing, so no layer is drawn.
	await expect(tabelo.cell(1, 1)).not.toHaveAttribute("data-pinned-column");

	await menu
		.getByRole("menuitem", { name: copy.actions.insertColumnsRight(1) })
		.click();

	// The preference was kept, so it becomes effective by itself once the table
	// grows past one column.
	await expect(tabelo.cell(1, 1)).toHaveAttribute("data-pinned-column", "true");
	menu = await openColumnMenu(tabelo, 1, samplePeopleHeaders[0]);
	await expect(pinItem(menu, "column")).toBeChecked();
});

async function pinBoth(tabelo: TabeloPage): Promise<void> {
	const columnMenu = await openColumnMenu(tabelo, 1, samplePeopleHeaders[0]);
	const columnPin = pinItem(columnMenu, "column");
	await columnPin.click();
	await expect(columnPin).toBeChecked();
	await closeMenu(tabelo, columnMenu);

	const rowMenu = await openRowMenu(tabelo, 1);
	const rowPin = pinItem(rowMenu, "row");
	await rowPin.click();
	await expect(rowPin).toBeChecked();
	await closeMenu(tabelo, rowMenu);
}
