import { copy } from "@/copy/copy";
import { expect, test } from "./fixtures";

// The header row is part of the table the user edits, not chrome around it: it
// is selectable, editable, and clearable exactly like a data row. Its column
// identity comes from the index strip above it, which is what lets an empty
// header stay empty instead of being given a name nobody typed.

const modifier = process.platform === "darwin" ? "Meta" : "Control";

test("the index strip names every column and is not a table row", async ({
	tabelo,
}) => {
	await expect(tabelo.columnIndex(1)).toBeVisible();
	await expect(tabelo.columnIndex(2)).toBeVisible();
	await expect(tabelo.columnIndex(3)).toBeVisible();

	// The strip is chrome, so it must not inflate the row count or shift the
	// numbering: the header row is still row 1 and the body still starts at 2.
	await expect(tabelo.grid()).toHaveAttribute("aria-rowcount", "4");
	await expect(tabelo.grid().locator('thead [role="row"]')).toHaveCount(1);
});

test("an empty header announces its column letter", async ({ tabelo }) => {
	await expect(tabelo.header(1)).toHaveText("");

	// Once it has text of its own, that text is the name.
	await tabelo.editHeader(1, "Name");
	await expect(tabelo.header(1)).toHaveAccessibleName("Name");
});

test("the strip selects the column and the header cell selects itself", async ({
	tabelo,
}) => {
	await tabelo.editHeader(1, "Name");

	// Clicking the letter selects the whole column, header included.
	await tabelo
		.columnIndex(1)
		.getByRole("button", {
			name: `${copy.actions.selectColumn}: Name`,
		})
		.click();
	await expect(tabelo.header(1)).toHaveAttribute("aria-selected", "true");
	await expect(tabelo.cell(1, 1)).toHaveAttribute("aria-selected", "true");
	await expect(tabelo.cell(1, 2)).toHaveAttribute("aria-selected", "false");

	const unselectedFill = await tabelo
		.header(2)
		.evaluate((element) => getComputedStyle(element).backgroundColor);

	// Clicking the header text selects that one cell rather than the column,
	// because the header cell is no longer the column's handle.
	await tabelo.header(2).click();
	await expect(tabelo.header(2)).toHaveAttribute("aria-selected", "true");
	await expect(tabelo.cell(1, 2)).toHaveAttribute("aria-selected", "false");
	const selectedFill = await tabelo
		.header(2)
		.evaluate((element) => getComputedStyle(element).backgroundColor);
	expect(selectedFill).not.toBe(unselectedFill);
});

test("row 1 is selectable from its aligned number without an actions menu", async ({
	tabelo,
}) => {
	const gutter = tabelo.grid().locator('[data-row-header="-1"]');
	const select = gutter.getByRole("button", {
		name: `${copy.actions.selectRow}: ${copy.a11y.headerRow}`,
	});
	await expect(gutter.getByRole("button")).toHaveCount(1);

	await select.click();
	await expect(gutter).toHaveAttribute("aria-selected", "true");
	await expect(tabelo.header(1)).toHaveAttribute("aria-selected", "true");
	await expect(tabelo.header(2)).toHaveAttribute("aria-selected", "true");
});

// #29, absorbed here: the header button announced "Rename column" while
// activating it selected the column instead.
test("the header cell no longer claims to rename on activation", async ({
	tabelo,
}) => {
	await expect(tabelo.header(1)).not.toHaveAttribute("title");
	await expect(tabelo.header(1).getByRole("button")).toHaveCount(0);
});

test("the column menu lives on the strip and names an unnamed column", async ({
	tabelo,
}) => {
	await expect(
		tabelo.header(1).getByRole("button", {
			name: new RegExp(`^${copy.actions.columnActions}:`),
		}),
	).toHaveCount(0);

	const trigger = tabelo.columnIndex(1).getByRole("button", {
		name: `${copy.actions.columnActions}: ${copy.a11y.columnLetter(0)}`,
	});
	await trigger.click();
	await expect(
		tabelo.page.getByRole("menu", {
			name: new RegExp(`^${copy.actions.columnActions}:`),
		}),
	).toBeVisible();
});

test("Mod+A then Backspace clears the headers along with the cells", async ({
	tabelo,
}) => {
	await tabelo.paste("Name\tRole\nInez\tDesigner");
	await expect(tabelo.header(1)).toHaveText("Name");

	await tabelo.cell(1, 1).click();
	const stripFill = await tabelo
		.columnIndex(1)
		.evaluate((element) => getComputedStyle(element).backgroundColor);
	await tabelo.page.keyboard.press(`${modifier}+a`);

	// The selection says it covers the header row, and this is the assertion the
	// defect inverted: the next keystroke has to honour it.
	await expect(tabelo.header(1)).toHaveAttribute("aria-selected", "true");
	await expect(tabelo.header(2)).toHaveAttribute("aria-selected", "true");
	await expect
		.poll(() =>
			tabelo
				.columnIndex(1)
				.evaluate((element) => getComputedStyle(element).backgroundColor),
		)
		.toBe(stripFill);

	await tabelo.page.keyboard.press("Backspace");

	await expect(tabelo.header(1)).toHaveText("");
	await expect(tabelo.header(2)).toHaveText("");
	await expect(tabelo.cell(1, 1)).toHaveText("");

	// One operation, so one undo step brings all of it back.
	await tabelo.runAppCommand("undo");
	await expect(tabelo.header(1)).toHaveText("Name");
	await expect(tabelo.cell(1, 1)).toHaveText("Inez");
});

test("Shift and arrows extend the selection into the header row", async ({
	tabelo,
}) => {
	await tabelo.paste("Name\tRole\nInez\tDesigner");

	await tabelo.cell(1, 1).click();
	await tabelo.page.keyboard.press("Shift+ArrowUp");
	await expect(tabelo.header(1)).toHaveAttribute("aria-selected", "true");

	await tabelo.page.keyboard.press("Backspace");
	await expect(tabelo.header(1)).toHaveText("");
	await expect(tabelo.cell(1, 1)).toHaveText("");
	// The neighbour was never in the selection.
	await expect(tabelo.header(2)).toHaveText("Role");
});

test("arrows stop at the header row rather than leaving the grid", async ({
	tabelo,
}) => {
	await tabelo.cell(1, 1).click();
	await tabelo.page.keyboard.press("ArrowUp");
	await expect(tabelo.header(1)).toBeFocused();

	await tabelo.page.keyboard.press("ArrowUp");
	await expect(tabelo.header(1)).toBeFocused();
});

test("Mod+Backspace refuses to remove the header row", async ({ tabelo }) => {
	await tabelo.paste("Name\tRole\nInez\tDesigner");

	await tabelo.header(1).click();
	await tabelo.page.keyboard.press("Shift+ArrowRight");
	await tabelo.page.keyboard.press(`${modifier}+Backspace`);

	await expect(tabelo.notice("warning")).toBeVisible();
	// The header row is still there and still holds its text.
	await expect(tabelo.header(1)).toHaveText("Name");
	await expect(tabelo.cell(1, 1)).toHaveText("Inez");
});

test("right-clicking the header row's gutter offers row actions", async ({
	tabelo,
}) => {
	// The measured defect inverted: this lookup used to match nothing, so the
	// menu fell through to cell actions on a cell that does not exist.
	await tabelo.grid().locator('[data-row-header="-1"]').click({
		button: "right",
	});

	const menu = tabelo.page.getByRole("menu");
	await expect(
		menu.getByRole("menuitem", { name: copy.actions.insertRowsBelow(1) }),
	).toBeVisible();
	// Removing it is offered but refused, with the reason given.
	await expect(
		menu.getByRole("menuitem", { name: copy.actions.deleteRows(1) }),
	).toBeDisabled();
});

test("a new table starts unnamed and stays clearable without confirmation", async ({
	tabelo,
}) => {
	await expect(tabelo.header(1)).toHaveText("");
	await expect(tabelo.source("markdown")).toContainText("|  |");
});

// Four layers stick now: the strip, the header row, the row gutter, and the two
// corners that stick on both axes. Positions are compared rather than pinned, so
// this asserts the relationships instead of a pixel layout.
test("the strip stays sticky and layered after scrolling both axes", async ({
	page,
	tabelo,
}) => {
	await tabelo.paste(
		Array.from({ length: 40 }, (_, row) => `r${row}a\tr${row}b\tr${row}c`).join(
			"\n",
		),
	);

	const body = tabelo.pane("grid").locator('[data-slot="panel-body"]');
	await body.evaluate((element) => {
		element.scrollTop = 300;
		element.scrollLeft = 60;
	});
	await page.waitForTimeout(100);

	const geometry = await tabelo.grid().evaluate((grid) => {
		const read = (selector: string) => {
			const element = grid.querySelector(selector);
			if (!element) return null;
			return {
				zIndex: Number(getComputedStyle(element).zIndex) || 0,
				sticky: getComputedStyle(element).position === "sticky",
			};
		};
		return {
			strip: read('[data-column-header="0"]'),
			headerCell: read('[data-cell="-1:0"]'),
			headerGutter: read('[data-row-header="-1"]'),
			bodyCell: read('[data-cell="30:0"]'),
			bodyGutter: read('[data-row-header="30"]'),
		};
	});

	const { strip, headerCell, headerGutter, bodyCell, bodyGutter } = geometry;
	if (!strip || !headerCell || !headerGutter || !bodyCell || !bodyGutter) {
		throw new Error("the grid did not expose every layer");
	}

	// All the chrome held its position while the body scrolled away under it.
	expect(strip.sticky).toBe(true);
	expect(headerCell.sticky).toBe(true);
	expect(bodyCell.sticky).toBe(false);

	// The gutter paints over the strip and header on the horizontal axis, and
	// both paint over the body.
	expect(headerGutter.zIndex).toBeGreaterThan(headerCell.zIndex);
	expect(headerCell.zIndex).toBeGreaterThan(bodyGutter.zIndex);
	expect(bodyGutter.zIndex).toBeGreaterThan(0);
});
