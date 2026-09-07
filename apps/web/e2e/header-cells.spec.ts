import type { Locator, Page } from "@playwright/test";
import { copy } from "@/copy/copy";
import { expect, test } from "./fixtures";
import type { TabeloPage } from "./helpers";

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

test("the strip's controls are owned by the surface, not by the grid", async ({
	tabelo,
}) => {
	// `role="grid"` may own nothing but `row` and `rowgroup`, and the strip
	// holds real controls. Keeping it inside the table re-parented those
	// controls onto the grid itself, whatever role the row claimed.
	await expect(tabelo.grid().locator("[data-column-strip]")).toHaveCount(0);
	await expect(tabelo.gridSurface().locator("[data-column-strip]")).toHaveCount(
		1,
	);

	// Outside the table and still on the keyboard path, which is the reason the
	// strip was never simply hidden from assistive technology.
	const select = tabelo.columnIndex(2).getByRole("button", {
		name: new RegExp(`^${copy.actions.selectColumn}:`),
	});
	await tabelo.cell(1, 1).click();
	await select.focus();
	await tabelo.page.keyboard.press("Space");
	await expect(tabelo.header(2)).toHaveAttribute("aria-selected", "true");
	await expect(tabelo.header(1)).toHaveAttribute("aria-selected", "false");
});

test("each letter stays over the column it names", async ({ tabelo }) => {
	// The strip and the table are laid out from one width model but by two
	// different mechanisms, grid tracks and a colgroup, so this is the pairing
	// the split has to keep. Asserted as containment rather than as equal
	// geometry: the contract is that the letter is over its column, at whatever
	// width the column happens to have.
	const centredOverColumn = async (column: number) => {
		const strip = await tabelo.columnIndex(column).boundingBox();
		const header = await tabelo.header(column).boundingBox();
		if (!strip || !header) throw new Error("the column did not render");
		const centre = header.x + header.width / 2;
		return centre > strip.x && centre < strip.x + strip.width;
	};

	expect(await centredOverColumn(1)).toBe(true);
	expect(await centredOverColumn(3)).toBe(true);

	// A resized column carries its letter with it. The keyboard path is used
	// because it is the one that leaves no pointer hovering the strip.
	const before = (await tabelo.columnIndex(1).boundingBox())?.width ?? 0;
	await tabelo.cell(1, 1).click();
	for (let step = 0; step < 4; step += 1) {
		await tabelo.page.keyboard.press("Alt+Shift+ArrowRight");
	}
	await expect
		.poll(async () => (await tabelo.columnIndex(1).boundingBox())?.width ?? 0)
		.toBeGreaterThan(before);
	expect(await centredOverColumn(1)).toBe(true);
	expect(await centredOverColumn(3)).toBe(true);
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

	// The sticky header composites its tint over an opaque base, so the fill is
	// the pair and not the colour alone: both states share that base and differ
	// only in the layer painted on it.
	const fillOf = (column: number) =>
		tabelo.header(column).evaluate((element) => {
			const style = getComputedStyle(element);
			return `${style.backgroundColor} ${style.backgroundImage}`;
		});

	const unselectedFill = await fillOf(2);

	// Clicking the header text selects that one cell rather than the column,
	// because the header cell is no longer the column's handle.
	await tabelo.header(2).click();
	await expect(tabelo.header(2)).toHaveAttribute("aria-selected", "true");
	await expect(tabelo.cell(1, 2)).toHaveAttribute("aria-selected", "false");
	const selectedFill = await fillOf(2);
	expect(selectedFill).not.toBe(unselectedFill);
});

test("row 1 uses the same selectable number and actions anatomy", async ({
	tabelo,
}) => {
	const gutter = tabelo.grid().locator('[data-row-header="-1"]');
	const select = gutter.getByRole("button", {
		name: `${copy.actions.selectRow}: ${copy.a11y.headerRow}`,
	});
	await expect(gutter.getByRole("button")).toHaveCount(2);
	await expect(
		gutter.getByRole("button", {
			name: new RegExp(`^${copy.actions.rowActions}:`),
		}),
	).toBeVisible();
	await expect(select).toHaveCSS("text-align", "right");
	await expect(select).toHaveCSS("font-weight", "400");

	await select.click();
	await expect(gutter).not.toHaveAttribute("aria-selected");
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
		name: `${copy.actions.columnActions}: ${copy.a11y.columnWithExpectedType("", 0, "text")}`,
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
	await tabelo.paste("Name\tRole\nIngrid\tDesigner");
	await expect(tabelo.header(1)).toHaveText("Name");

	await tabelo.cell(1, 1).click();
	const stripFill = await tabelo
		.columnIndex(1)
		.evaluate((element) => getComputedStyle(element).backgroundColor);
	const gutterFills = await tabelo
		.grid()
		.locator("[data-row-header]")
		.evaluateAll((gutters) =>
			gutters.map((gutter) => getComputedStyle(gutter).backgroundColor),
		);
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
	expect(
		await tabelo
			.grid()
			.locator("[data-row-header]")
			.evaluateAll((gutters) =>
				gutters.map((gutter) => getComputedStyle(gutter).backgroundColor),
			),
	).toEqual(gutterFills);

	await tabelo.page.keyboard.press("Backspace");

	await expect(tabelo.header(1)).toHaveText("");
	await expect(tabelo.header(2)).toHaveText("");
	await expect(tabelo.cell(1, 1)).toHaveText("");

	// One operation, so one undo step brings all of it back.
	await tabelo.runAppCommand("undo");
	await expect(tabelo.header(1)).toHaveText("Name");
	await expect(tabelo.cell(1, 1)).toHaveText("Ingrid");
});

test("Shift and arrows extend the selection into the header row", async ({
	tabelo,
}) => {
	await tabelo.paste("Name\tRole\nIngrid\tDesigner");

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

// Removing the header row is the one row action that used to refuse. It no
// longer does: the row under it moves up, so the table goes from one header row
// to one header row without ever being headerless.
test("Mod+Backspace on the header row promotes the row below it", async ({
	tabelo,
}) => {
	await tabelo.paste("Name\tRole\nIngrid\tDesigner\nPaulo\tDeveloper");

	await tabelo.header(1).click();
	await tabelo.page.keyboard.press("Shift+ArrowRight");
	await tabelo.page.keyboard.press(`${modifier}+Backspace`);

	await expect(tabelo.header(1)).toHaveText("Ingrid");
	await expect(tabelo.header(2)).toHaveText("Designer");
	await expect(tabelo.cell(1, 1)).toHaveText("Paulo");
	await expect(tabelo.notice("warning")).toBeHidden();

	// One gesture, one step back.
	await tabelo.runAppCommand("undo");
	await expect(tabelo.header(1)).toHaveText("Name");
	await expect(tabelo.cell(1, 1)).toHaveText("Ingrid");
	await expect(tabelo.cell(2, 1)).toHaveText("Paulo");
});

test("deleting a range that starts at the header promotes the first survivor", async ({
	tabelo,
}) => {
	await tabelo.paste("Name\tRole\nIngrid\tDesigner\nPaulo\tDeveloper");

	// One range covering the header cell and the first data cell under it.
	await tabelo.header(1).click();
	await tabelo.page.keyboard.press("Shift+ArrowDown");
	await tabelo.page.keyboard.press(`${modifier}+Backspace`);

	// Paulo survives the range and becomes the header, rather than Ingrid, who
	// was inside it.
	await expect(tabelo.header(1)).toHaveText("Paulo");
	await expect(tabelo.header(2)).toHaveText("Developer");
	await expect(tabelo.cell(1, 1)).toHaveText("");
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
	// Removing it is offered, and offered as the one row it removes.
	await expect(
		menu.getByRole("menuitem", { name: copy.actions.deleteRows(1) }),
	).toBeEnabled();
});

// The menu and the keyboard reach the same rule, so the row menu promotes too.
test("the header row's menu deletes it and promotes the row below", async ({
	tabelo,
}) => {
	await tabelo.paste("Name\tRole\nIngrid\tDesigner\nPaulo\tDeveloper");

	await tabelo.grid().locator('[data-row-header="-1"]').click({
		button: "right",
	});
	await tabelo.page
		.getByRole("menu")
		.getByRole("menuitem", { name: copy.actions.deleteRows(1) })
		.click();

	await expect(tabelo.header(1)).toHaveText("Ingrid");
	await expect(tabelo.cell(1, 1)).toHaveText("Paulo");
});

test("a new table starts unnamed and stays clearable without confirmation", async ({
	tabelo,
}) => {
	await expect(tabelo.header(1)).toHaveText("");
	// An empty cell, matched by its shape rather than by a count of spaces:
	// Markdown pads a column to hold the empty-value placeholder, so the width
	// of that padding belongs to the serializer rather than to this test.
	await expect(tabelo.source("markdown")).toContainText(/\|\s+\|/);
});

// Four layers stick now: the strip, the header row, the row gutter, and the two
// corners that stick on both axes. Positions are compared rather than pinned, so
// this asserts the relationships instead of a pixel layout.
test("the strip stays sticky and layered after scrolling both axes", async ({
	tabelo,
}) => {
	await tabelo.paste(
		Array.from({ length: 40 }, (_, row) =>
			Array.from({ length: 10 }, (_, column) => `r${row}c${column}`).join("\t"),
		).join("\n"),
	);

	const body = tabelo.pane("grid").locator('[data-slot="panel-body"]');
	await body.evaluate((element) => {
		element.scrollTop = 300;
		element.scrollLeft = 60;
	});
	await expect
		.poll(() =>
			body.evaluate((element) => ({
				left: element.scrollLeft,
				top: element.scrollTop,
			})),
		)
		.toEqual({ left: 60, top: 300 });

	const geometry = await tabelo.gridSurface().evaluate((surface) => {
		const read = (selector: string) => {
			const element = surface.querySelector(selector);
			if (!element) return null;
			return {
				zIndex: Number(getComputedStyle(element).zIndex) || 0,
				sticky: getComputedStyle(element).position === "sticky",
			};
		};
		return {
			// The strip sticks as one element: it is chrome beside the table, so
			// its cells ride on the container rather than each sticking alone.
			strip: read("[data-column-strip]"),
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

// A pointer drag across the header/data boundary. The header row is an
// ordinary row of the cell selection, so one gesture may start on either side
// of the boundary and finish on the other.
//
// Both endpoints are reached through hover rather than a bounding box read up
// front: the box is resolved once at press time and once at release time, so a
// column width settling between the two cannot land the press on the wrong
// cell. Reading both boxes first made this drag miss roughly one run in twenty.
async function dragBetween(
	page: Page,
	from: Locator,
	to: Locator,
): Promise<void> {
	await from.hover();
	await page.mouse.down();
	// The extension reads the endpoint the pointer entered, so the destination's
	// own enter is what completes the rectangle.
	await to.hover();
	await page.mouse.up();
}

// The rectangle both drag directions are expected to produce over the pasted
// table: the first two columns, from the header row down to the second data
// row, with the third column untouched.
async function expectHeaderBlock(
	tabelo: TabeloPage,
	selected: boolean,
): Promise<void> {
	const state = String(selected);
	await expect(tabelo.header(1)).toHaveAttribute("aria-selected", state);
	await expect(tabelo.header(2)).toHaveAttribute("aria-selected", state);
	await expect(tabelo.cell(1, 1)).toHaveAttribute("aria-selected", state);
	await expect(tabelo.cell(1, 2)).toHaveAttribute("aria-selected", state);
	await expect(tabelo.cell(2, 1)).toHaveAttribute("aria-selected", state);
	await expect(tabelo.cell(2, 2)).toHaveAttribute("aria-selected", state);
}

// The third column sits outside both endpoints, which is what proves the
// horizontal extent follows them instead of collapsing to one column or
// growing to the whole row.
async function expectThirdColumnOutside(tabelo: TabeloPage): Promise<void> {
	await expect(tabelo.header(3)).toHaveAttribute("aria-selected", "false");
	await expect(tabelo.cell(1, 3)).toHaveAttribute("aria-selected", "false");
	await expect(tabelo.cell(2, 3)).toHaveAttribute("aria-selected", "false");
}

test("a pointer drag selects one rectangle across the header boundary either way", async ({
	page,
	tabelo,
}) => {
	await tabelo.paste(
		"Name\tRole\tCity\nIngrid\tDesigner\tRio\nPaulo\tDeveloper\tMadrid",
	);

	// Upwards, out of the body and into the header.
	await dragBetween(page, tabelo.cell(2, 1), tabelo.header(2));
	await expectHeaderBlock(tabelo, true);
	await expectThirdColumnOutside(tabelo);

	// The same two endpoints the other way round produce the same rectangle,
	// after a single click outside the block has cleared it.
	await tabelo.cell(2, 3).click();
	await expectHeaderBlock(tabelo, false);
	await dragBetween(page, tabelo.header(2), tabelo.cell(2, 1));
	await expectHeaderBlock(tabelo, true);
	await expectThirdColumnOutside(tabelo);

	// The release ended the gesture, so hovering afterwards extends nothing.
	await tabelo.cell(2, 3).hover();
	await expectHeaderBlock(tabelo, true);
	await expectThirdColumnOutside(tabelo);
});

test("Shift and click extend the cell range across the header boundary either way", async ({
	tabelo,
}) => {
	await tabelo.paste(
		"Name\tRole\tCity\nIngrid\tDesigner\tRio\nPaulo\tDeveloper\tMadrid",
	);

	await tabelo.cell(2, 1).click();
	await tabelo.header(2).click({ modifiers: ["Shift"] });
	await expectHeaderBlock(tabelo, true);
	await expectThirdColumnOutside(tabelo);

	await tabelo.header(2).click();
	await tabelo.cell(2, 1).click({ modifiers: ["Shift"] });
	await expectHeaderBlock(tabelo, true);
	await expectThirdColumnOutside(tabelo);
});

test("a dragged header and data block clears and undoes as one step", async ({
	page,
	tabelo,
}) => {
	await tabelo.paste(
		"Name\tRole\tCity\nIngrid\tDesigner\tRio\nPaulo\tDeveloper\tMadrid",
	);

	await dragBetween(page, tabelo.cell(2, 1), tabelo.header(2));
	await tabelo.page.keyboard.press("Backspace");

	// The whole rectangle emptied, and only it.
	await expect(tabelo.header(1)).toHaveText("");
	await expect(tabelo.header(2)).toHaveText("");
	await expect(tabelo.cell(1, 1)).toHaveText("");
	await expect(tabelo.cell(2, 2)).toHaveText("");
	await expect(tabelo.header(3)).toHaveText("City");
	await expect(tabelo.cell(1, 3)).toHaveText("Rio");

	// One operation, so one step brings the header and the data back together.
	await tabelo.runAppCommand("undo");
	await expect(tabelo.header(1)).toHaveText("Name");
	await expect(tabelo.header(2)).toHaveText("Role");
	await expect(tabelo.cell(1, 1)).toHaveText("Ingrid");
	await expect(tabelo.cell(2, 2)).toHaveText("Developer");
});

// A table wide enough that the grid pane scrolls horizontally, so a drag can
// run past the pane edge and autoscroll while staying at header height.
function wideTable(columns = 14): string {
	const header = Array.from(
		{ length: columns },
		(_, column) => `Column ${column + 1}`,
	);
	return [
		header.join("\t"),
		...Array.from({ length: 2 }, (_, row) =>
			header.map((_, column) => `${row + 1}:${column + 1}`).join("\t"),
		),
	].join("\n");
}

// Autoscroll re-samples the cell under the pointer on every tick. That sample
// used to be clamped below the header row, which was harmless only while a cell
// drag could not start in the header: once it could, a header drag running past
// the pane edge sampled the first data row instead, and pulled data rows into a
// header-only selection that Backspace would then clear.
test("a header drag that autoscrolls sideways keeps the data rows out of it", async ({
	page,
	tabelo,
}) => {
	await tabelo.paste(wideTable());
	const scroller = tabelo.pane("grid").locator('[data-slot="panel-body"]');
	const scrollerBox = await scroller.boundingBox();
	if (!scrollerBox) throw new Error("the grid pane did not lay out");

	const start = await tabelo.header(2).boundingBox();
	if (!start) throw new Error("the header did not lay out");
	const headerHeight = start.y + start.height / 2;

	await page.mouse.move(start.x + start.width / 2, headerHeight);
	await page.mouse.down();
	// Past the trailing pane edge, still at the header's own height.
	await page.mouse.move(scrollerBox.x + scrollerBox.width + 8, headerHeight);

	await expect
		.poll(() => scroller.evaluate((element) => element.scrollLeft))
		.toBeGreaterThan(0);

	// The gesture never left the header row, so nothing in the body belongs to
	// it however far the autoscroll travelled.
	await expect
		.poll(() =>
			tabelo.grid().locator('[role="gridcell"][aria-selected="true"]').count(),
		)
		.toBe(0);
	// It did keep extending across the header itself.
	await expect
		.poll(() =>
			tabelo
				.grid()
				.locator('[role="columnheader"][aria-selected="true"]')
				.count(),
		)
		.toBeGreaterThan(1);

	await page.mouse.up();
});

// The same autoscroll must still admit a rectangle that genuinely spans both,
// so the fix above cannot be a blanket exclusion of the data rows.
test("a header drag that reaches a data row still autoscrolls into both", async ({
	page,
	tabelo,
}) => {
	await tabelo.paste(wideTable());
	const scroller = tabelo.pane("grid").locator('[data-slot="panel-body"]');
	const scrollerBox = await scroller.boundingBox();
	if (!scrollerBox) throw new Error("the grid pane did not lay out");

	const start = await tabelo.header(2).boundingBox();
	const dataRow = await tabelo.cell(1, 2).boundingBox();
	if (!start || !dataRow) throw new Error("the grid did not lay out both rows");

	await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
	await page.mouse.down();
	// Down into the first data row, then out past the trailing pane edge at
	// that row's height.
	await page.mouse.move(
		dataRow.x + dataRow.width / 2,
		dataRow.y + dataRow.height / 2,
	);
	await page.mouse.move(
		scrollerBox.x + scrollerBox.width + 8,
		dataRow.y + dataRow.height / 2,
	);

	await expect
		.poll(() => scroller.evaluate((element) => element.scrollLeft))
		.toBeGreaterThan(0);

	// Both rows of the rectangle survived the autoscrolled extension.
	await expect
		.poll(() =>
			tabelo
				.grid()
				.locator('[role="columnheader"][aria-selected="true"]')
				.count(),
		)
		.toBeGreaterThan(1);
	await expect
		.poll(() =>
			tabelo.grid().locator('[role="gridcell"][aria-selected="true"]').count(),
		)
		.toBeGreaterThan(1);

	await page.mouse.up();
});
