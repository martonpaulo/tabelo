import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

// The grid is a hand-built widget, so every keyboard contract it advertises is
// one it has to implement itself. The rule that shapes the rest: arrows are
// internal navigation, and Tab is how you get out.

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

test("Tab walks the cells in reading order and wraps at the row end", async ({
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
});

// The defect this issue was opened for: Tab used to preventDefault at every
// edge, so the last cell held focus for ever.
test("Tab leaves the grid at the last cell instead of trapping focus", async ({
	page,
	tabelo,
}) => {
	await tabelo.cell(3, 3).click();
	expect(await focusedCell(page)).toBe("2:2");

	await page.keyboard.press("Tab");

	expect(await focusedCell(page)).toBeNull();
	expect(await insideGrid(page)).toBe(false);
});

test("Shift+Tab leaves the grid at the first cell", async ({
	page,
	tabelo,
}) => {
	await tabelo.cell(1, 1).click();

	// Backwards out of the first cell walks the grid's own controls and then
	// leaves; what matters is that it never stops moving.
	for (let press = 0; press < 12; press += 1) {
		await page.keyboard.press("Shift+Tab");
		if (!(await insideGrid(page))) return;
	}
	throw new Error("Focus never left the grid going backwards.");
});

test("arrow navigation stays inside the grid at every edge", async ({
	page,
	tabelo,
}) => {
	await tabelo.cell(1, 1).click();

	await page.keyboard.press("ArrowUp");
	await page.keyboard.press("ArrowLeft");
	expect(await focusedCell(page)).toBe("0:0");
	expect(await insideGrid(page)).toBe(true);

	await page.keyboard.press("ArrowDown");
	expect(await focusedCell(page)).toBe("1:0");
	await page.keyboard.press("ArrowRight");
	expect(await focusedCell(page)).toBe("1:1");
});

test("a column header is renamed with Enter or F2 and selected with Space", async ({
	page,
	tabelo,
}) => {
	const headerButton = tabelo.header(1).getByRole("button").first();
	await headerButton.focus();

	await page.keyboard.press("F2");
	let editor = tabelo.grid().getByRole("textbox", { name: /^Rename/ });
	await expect(editor).toBeVisible();
	await page.keyboard.press("Escape");

	await headerButton.focus();
	await page.keyboard.press("Enter");
	editor = tabelo.grid().getByRole("textbox", { name: /^Rename/ });
	await expect(editor).toBeVisible();
	await editor.fill("Name");
	await editor.press("Enter");
	await expect(tabelo.header(1)).toHaveText("Name");

	// Activating the button still does what activating a button does.
	await tabelo.header(1).getByRole("button").first().focus();
	await page.keyboard.press(" ");
	await expect(tabelo.cell(1, 1)).toHaveAttribute("aria-selected", "true");
});

test("column width is changed, reset, and floored without a pointer", async ({
	page,
	tabelo,
}) => {
	const header = tabelo.header(1);
	const width = async () => (await header.boundingBox())?.width ?? 0;
	const original = await width();

	const menu = async () => {
		await tabelo
			.grid()
			.getByRole("button", { name: /^Column actions: / })
			.first()
			.click();
		return page.getByRole("menu", { name: /^Column actions: / });
	};

	let open = await menu();
	await expect(open).toContainText("Column width 168px");
	await open.getByRole("menuitem", { name: "Widen column" }).click();
	await expect(open).toContainText("Column width 192px");
	await page.keyboard.press("Escape");
	expect(await width()).toBeGreaterThan(original);

	open = await menu();
	await open.getByRole("menuitem", { name: "Reset column width" }).click();
	await expect(open).toContainText("Column width 168px");
	await expect(
		open.getByRole("menuitem", { name: "Reset column width" }),
	).toBeDisabled();
	await page.keyboard.press("Escape");
	expect(await width()).toBeCloseTo(original, 0);

	// Narrowing stops at the floor rather than collapsing the column: the step
	// disables itself instead of taking the column to nothing.
	open = await menu();
	const narrow = open.getByRole("menuitem", { name: "Narrow column" });
	for (let press = 0; press < 8 && (await narrow.isEnabled()); press += 1) {
		await narrow.click();
	}
	await expect(open).toContainText("Column width 72px");
	await expect(narrow).toBeDisabled();
});

test("a cell is named by its value, not by its coordinates", async ({
	tabelo,
}) => {
	await tabelo.editCell(1, 1, "Ana");

	// The grid's accessible tree: cells carry their content, and the row and
	// column headers carry the context around them.
	await expect(tabelo.grid()).toMatchAriaSnapshot(`
      - grid "Table editor":
        - rowgroup:
          - row /Column 1/:
            - columnheader
            - columnheader "Column 1"
        - rowgroup:
          - row "Row 1 Ana":
            - rowheader "Row 1"
            - gridcell "Ana"
    `);
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
	await tabelo.editCell(1, 1, "Ana");
	await tabelo.editCell(2, 1, "Bo");

	// Enter edits, F2 edits, Escape leaves the value alone.
	await tabelo.cell(1, 1).click();
	await page.keyboard.press("Enter");
	await expect(
		tabelo.grid().getByRole("textbox", { name: "Row 1, column 1" }),
	).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(tabelo.cell(1, 1)).toHaveText("Ana");

	// Home and End move along the row; the modifier goes to the far corner.
	await page.keyboard.press("End");
	expect(await focusedCell(page)).toBe("0:2");
	await page.keyboard.press("Home");
	expect(await focusedCell(page)).toBe("0:0");
	await page.keyboard.press("Control+End");
	expect(await focusedCell(page)).toBe("2:2");
	await page.keyboard.press("Control+Home");
	expect(await focusedCell(page)).toBe("0:0");

	// Alt+Arrow reorders rather than navigating.
	await page.keyboard.press("Alt+ArrowDown");
	await expect(tabelo.cell(1, 1)).toHaveText("Bo");
	await expect(tabelo.cell(2, 1)).toHaveText("Ana");
	await page.keyboard.press("Alt+ArrowUp");
	await expect(tabelo.cell(1, 1)).toHaveText("Ana");

	// Backspace clears contents; the modifier removes the structure.
	await tabelo.cell(1, 1).click();
	await page.keyboard.press("Backspace");
	await expect(tabelo.cell(1, 1)).toHaveText("");
	await expect(tabelo.cell(2, 1)).toHaveText("Bo");

	const rowsBefore = await tabelo.grid().getByRole("row").count();
	await page.keyboard.press("Control+Backspace");
	expect(await tabelo.grid().getByRole("row").count()).toBe(rowsBefore - 1);
});

test("typing in a cell never reaches the grid's structural shortcuts", async ({
	tabelo,
}) => {
	await tabelo.editCell(1, 1, "Ana");
	const rowsBefore = await tabelo.grid().getByRole("row").count();

	await tabelo.cell(1, 1).dblclick();
	const editor = tabelo
		.grid()
		.getByRole("textbox", { name: "Row 1, column 1" });
	await expect(editor).toBeFocused();

	// Backspace edits the text; the modifier does not delete the row from under
	// the editor.
	await editor.press("Backspace");
	await editor.press("Control+Backspace");
	expect(await tabelo.grid().getByRole("row").count()).toBe(rowsBefore);

	await editor.press("Escape");
	await expect(tabelo.cell(1, 1)).toHaveText("Ana");
});
