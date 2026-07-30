import type { Locator, Page } from "@playwright/test";
import { copy } from "@/ui/copy";
import { expect, test } from "./fixtures";

// The grid is a hand-built widget, so every keyboard contract it advertises is
// one it has to implement itself. The rule that shapes the rest: arrows are
// internal navigation, and Tab wraps around reading order. Escape is how you get out.

function insideGrid(page: Page): Promise<boolean> {
	return page.evaluate(() =>
		Boolean(document.activeElement?.closest('[role="grid"]')),
	);
}

function focusedCell(page: Page): Promise<string | null> {
	return page.evaluate(
		() => document.activeElement?.getAttribute("data-cell") ?? null,
	);
}

test("Tab walks the grid in reading order and wraps around after the last cell", async ({
	page,
	tabelo,
}) => {
	await tabelo.cell(1, 1).click();
	expect(await focusedCell(page)).toBe("0:0");

	await page.keyboard.press("Tab");
	expect(await focusedCell(page)).toBe("0:1");
	await page.keyboard.press("Tab");
	expect(await focusedCell(page)).toBe("0:2");

	// Past the last column, on to the start of the next row.
	await page.keyboard.press("Tab");
	expect(await focusedCell(page)).toBe("1:0");

	await page.keyboard.press("Shift+Tab");
	expect(await focusedCell(page)).toBe("0:2");

	// Continue to the last cell.
	for (let press = 0; press < 6; press += 1) {
		await page.keyboard.press("Tab");
	}
	expect(await focusedCell(page)).toBe("2:2");

	// Tab wraps around to the first cell of the header row.
	await page.keyboard.press("Tab");
	expect(await focusedCell(page)).toBe("-1:0");
	expect(await insideGrid(page)).toBe(true);
});

test("Shift+Tab wraps around the grid at the first cell", async ({
	page,
	tabelo,
}) => {
	await tabelo.cell(1, 1).click();

	// Backwards out of the first cell wraps around to the last cell.
	for (let press = 0; press < 12; press += 1) {
		await page.keyboard.press("Shift+Tab");
		expect(await insideGrid(page)).toBe(true);
	}
});

test("arrow navigation stays inside the grid at every edge", async ({
	page,
	tabelo,
}) => {
	await tabelo.cell(1, 1).click();

	// Up from the first data row reaches the header row, which is part of the
	// table, and stops there rather than leaving the grid.
	await page.keyboard.press("ArrowUp");
	await page.keyboard.press("ArrowLeft");
	expect(await focusedCell(page)).toBe("-1:0");
	expect(await insideGrid(page)).toBe(true);

	await page.keyboard.press("ArrowUp");
	expect(await focusedCell(page)).toBe("-1:0");
	expect(await insideGrid(page)).toBe(true);

	await page.keyboard.press("ArrowDown");
	expect(await focusedCell(page)).toBe("0:0");
	await page.keyboard.press("ArrowRight");
	expect(await focusedCell(page)).toBe("0:1");
});

// The header cell is edited the way any cell is: it is one, for every purpose
// except being deletable as a row. Selecting the column moved to the index
// strip, so the header no longer answers Space.
test("a header cell is renamed with Enter or F2 like any cell", async ({
	page,
	tabelo,
}) => {
	await tabelo.header(1).click();

	await page.keyboard.press("F2");
	let editor = tabelo.grid().getByRole("textbox");
	await expect(editor).toBeVisible();
	await page.keyboard.press("Escape");

	await tabelo.header(1).click();
	await page.keyboard.press("Enter");
	editor = tabelo.grid().getByRole("textbox");
	await expect(editor).toBeVisible();
	await editor.fill("Name");
	await editor.press("Enter");
	await expect(tabelo.header(1)).toHaveText("Name");

	// Typing over it replaces it, which is what a data cell does too.
	await tabelo.header(1).click();
	await page.keyboard.press("R");
	await expect(tabelo.grid().getByRole("textbox")).toHaveValue("R");
	await page.keyboard.press("Enter");
	await expect(tabelo.header(1)).toHaveText("R");
});

test("the column is selected from the index strip", async ({
	page,
	tabelo,
}) => {
	await tabelo
		.columnIndex(1)
		.getByRole("button", {
			name: new RegExp(`^${copy.actions.selectColumn}:`),
		})
		.focus();
	await page.keyboard.press(" ");

	await expect(tabelo.cell(1, 1)).toHaveAttribute("aria-selected", "true");
	await expect(tabelo.header(1)).toHaveAttribute("aria-selected", "true");
});

test("column width controls constrain a column with long content", async ({
	page,
	tabelo,
}) => {
	await tabelo.editCell(
		1,
		1,
		"A very long single-line cell value that will certainly not fit inside the default column width",
	);

	const header = tabelo.header(1);
	const width = async () => (await header.boundingBox())?.width ?? 0;
	const original = await width();

	const menu = async () => {
		await tabelo
			.grid()
			.getByRole("button", {
				name: new RegExp(`^${copy.actions.columnActions}:`),
			})
			.first()
			.click();
		return page.getByRole("menu", {
			name: new RegExp(`^${copy.actions.columnActions}:`),
		});
	};
	const activate = async (item: Locator) => {
		await item.focus();
		await item.press("Enter");
	};
	const close = async (openMenu: Locator) => {
		await openMenu.press("Escape");
		await openMenu.waitFor({ state: "hidden" });
	};

	let open = await menu();
	await activate(
		open.getByRole("menuitem", { name: copy.actions.narrowColumn }),
	);
	await close(open);
	const narrowed = await width();
	expect(narrowed).toBeLessThan(original);

	open = await menu();
	await activate(
		open.getByRole("menuitem", { name: copy.actions.resetColumnWidth }),
	);
	await close(open);
	expect(await width()).toBeCloseTo(original, 0);

	open = await menu();
	await activate(
		open.getByRole("menuitem", { name: copy.actions.widenColumn }),
	);
	await close(open);
	expect(await width()).toBeGreaterThan(original);

	open = await menu();
	await activate(
		open.getByRole("menuitem", { name: copy.actions.resetColumnWidth }),
	);
	await close(open);
	expect(await width()).toBeCloseTo(original, 0);
	open = await menu();
	await expect(
		open.getByRole("menuitem", { name: copy.actions.resetColumnWidth }),
	).toBeDisabled();
	await close(open);

	// Narrowing still stops at the floor rather than collapsing the column, even
	// when its content is much wider than that floor.
	open = await menu();
	const narrow = open.getByRole("menuitem", {
		name: copy.actions.narrowColumn,
	});
	for (let press = 0; press < 8 && (await narrow.isEnabled()); press += 1) {
		await activate(narrow);
	}
	await expect(narrow).toBeDisabled();
	await close(open);
	expect(await width()).toBeLessThan(original);

	open = await menu();
	await activate(
		open.getByRole("menuitem", { name: copy.actions.resetColumnWidth }),
	);
	await close(open);

	// The handle lives on the index strip, which owns everything about the
	// column's shape. It stays inside its clipped cell so its complete hit target
	// remains available.
	const resizeHandle = tabelo.columnIndex(1).locator("div.cursor-col-resize");
	const handleBox = await resizeHandle.boundingBox();
	const resizedHeaderBox = await tabelo.columnIndex(1).boundingBox();
	expect(handleBox).not.toBeNull();
	expect((handleBox?.x ?? 0) + (handleBox?.width ?? 0)).toBeLessThanOrEqual(
		(resizedHeaderBox?.x ?? 0) + (resizedHeaderBox?.width ?? 0),
	);
	await page.mouse.move(
		(handleBox?.x ?? 0) + (handleBox?.width ?? 0) / 2,
		(handleBox?.y ?? 0) + (handleBox?.height ?? 0) / 2,
	);
	await page.mouse.down();
	await page.mouse.move(
		(handleBox?.x ?? 0) + (handleBox?.width ?? 0) / 2 + 24,
		(handleBox?.y ?? 0) + (handleBox?.height ?? 0) / 2,
	);
	await page.mouse.up();
	expect(await width()).toBeGreaterThan(original);

	open = await menu();
	await activate(
		open.getByRole("menuitem", { name: copy.actions.resetColumnWidth }),
	);
	await close(open);
	const beforeZoom = await width();
	await tabelo.runPaneCommand("grid", "zoomIn");
	await expect.poll(width).toBeGreaterThan(beforeZoom);
	await page.setViewportSize({ width: 500, height: 720 });
	const scrollLeft = await tabelo.grid().evaluate((grid) => {
		let scroller = grid.parentElement;
		while (scroller && scroller.scrollWidth <= scroller.clientWidth) {
			scroller = scroller.parentElement;
		}
		if (!scroller) return 0;
		scroller.scrollLeft = scroller.scrollWidth;
		return scroller.scrollLeft;
	});
	expect(scrollLeft).toBeGreaterThan(0);

	const bodyCell = tabelo.cell(1, 1);
	const headerBox = await header.boundingBox();
	const bodyBox = await bodyCell.boundingBox();
	expect(headerBox?.x).toBeCloseTo(bodyBox?.x ?? 0, 0);
	expect(headerBox?.width).toBeCloseTo(bodyBox?.width ?? 0, 0);
});

test("a cell is named by its value, not by its coordinates", async ({
	tabelo,
}) => {
	await tabelo.editCell(1, 1, "Inez");

	// Cells carry their content, while row and column headers carry context.
	await expect(
		tabelo.grid().getByRole("gridcell", { name: "Inez" }),
	).toBeVisible();
	await expect(
		tabelo.grid().getByRole("rowheader", { name: copy.a11y.rowNumber(0) }),
	).toBeVisible();
	await expect(
		tabelo.grid().getByRole("columnheader", {
			name: copy.a11y.columnLetter(0),
		}),
	).toBeVisible();
});

test("selection state is exposed on the cells it covers", async ({
	page,
	tabelo,
}) => {
	await tabelo.cell(1, 1).click();
	await expect(tabelo.cell(1, 1)).toHaveAttribute("aria-selected", "true");
	await expect(tabelo.cell(1, 2)).toHaveAttribute("aria-selected", "false");

	await page.keyboard.press("Shift+ArrowRight");
	await expect(tabelo.cell(1, 2)).toHaveAttribute("aria-selected", "true");
	await expect(tabelo.cell(2, 1)).toHaveAttribute("aria-selected", "false");
});

test("the documented grid commands still work", async ({ page, tabelo }) => {
	await tabelo.editCell(1, 1, "Inez");
	await tabelo.editCell(2, 1, "Bo");

	// Enter edits, F2 edits, Escape leaves the value alone.
	await tabelo.cell(1, 1).click();
	await page.keyboard.press("Enter");
	await expect(
		tabelo.grid().getByRole("textbox", { name: copy.a11y.cellEditor(0, 0) }),
	).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(tabelo.cell(1, 1)).toHaveText("Inez");

	// Home and End move along the row; the modifier goes to the far corner.
	await page.keyboard.press("End");
	expect(await focusedCell(page)).toBe("0:2");
	await page.keyboard.press("Home");
	expect(await focusedCell(page)).toBe("0:0");
	await page.keyboard.press("Control+End");
	expect(await focusedCell(page)).toBe("2:2");
	// The far corner the other way is the header row, which is the table's first
	// row and now reachable like any other.
	await page.keyboard.press("Control+Home");
	expect(await focusedCell(page)).toBe("-1:0");

	// Alt+Arrow reorders rather than navigating.
	await tabelo.cell(1, 1).click();
	await page.keyboard.press("Alt+ArrowDown");
	await expect(tabelo.cell(1, 1)).toHaveText("Bo");
	await expect(tabelo.cell(2, 1)).toHaveText("Inez");
	await page.keyboard.press("Alt+ArrowUp");
	await expect(tabelo.cell(1, 1)).toHaveText("Inez");

	// Backspace clears contents; the modifier removes the structure.
	await tabelo.cell(1, 1).click();
	await page.keyboard.press("Backspace");
	await expect(tabelo.cell(1, 1)).toHaveText("");
	await expect(tabelo.cell(2, 1)).toHaveText("Bo");

	const rowsBefore = await tabelo.grid().getByRole("row").count();
	await page.keyboard.press("Control+Backspace");
	expect(await tabelo.grid().getByRole("row").count()).toBe(rowsBefore - 1);
});

test("Mod+A selects the header row and every body cell", async ({
	page,
	tabelo,
}) => {
	await tabelo.cell(1, 1).click();
	await page.keyboard.press("ControlOrMeta+A");

	for (let column = 1; column <= 3; column += 1) {
		await expect(tabelo.header(column)).toHaveAttribute(
			"aria-selected",
			"true",
		);
		await expect(tabelo.cell(3, column)).toHaveAttribute(
			"aria-selected",
			"true",
		);
	}

	const copied = await tabelo.grid().evaluate((grid) => {
		const clipboardData = new DataTransfer();
		const event = new Event("copy", { bubbles: true, cancelable: true });
		Object.defineProperty(event, "clipboardData", { value: clipboardData });
		grid.dispatchEvent(event);
		return clipboardData.getData("text/plain");
	});
	// A new table has no header text, so the copied header row is empty tabs.
	// What matters is that the header row is carried at all.
	expect(copied.split("\n")[0]).toBe("\t\t");
});

test("typing in a cell never reaches the grid's structural shortcuts", async ({
	tabelo,
}) => {
	await tabelo.editCell(1, 1, "Inez");
	const rowsBefore = await tabelo.grid().getByRole("row").count();

	await tabelo.cell(1, 1).dblclick();
	const editor = tabelo
		.grid()
		.getByRole("textbox", { name: copy.a11y.cellEditor(0, 0) });
	await expect(editor).toBeFocused();

	// Backspace edits the text; the modifier does not delete the row from under
	// the editor.
	await editor.press("Backspace");
	await editor.press("Control+Backspace");
	expect(await tabelo.grid().getByRole("row").count()).toBe(rowsBefore);

	await editor.press("Escape");
	await expect(tabelo.cell(1, 1)).toHaveText("Inez");
});
