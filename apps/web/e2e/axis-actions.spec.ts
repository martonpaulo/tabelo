import type { Locator } from "@playwright/test";
import { copy } from "@/copy/copy";
import { samplePeopleCsv } from "@/core/sample-data";
import { expect, test } from "./fixtures";
import { openSubmenu, type TabeloPage } from "./helpers";

// Row and column actions live in the grid's one context menu (#288). There is
// no affordance icon beside a row number or a column letter any more: each
// label is one control, and right-click, `Shift`+`F10`, or the `ContextMenu`
// key opens the menu on it.

async function seedRoster(tabelo: TabeloPage): Promise<void> {
	await tabelo.paste(samplePeopleCsv(4).replaceAll(",", "\t"));
	await tabelo.dismissNotices();
}

test("a row number and a column letter are the only control on their cell", async ({
	tabelo,
}) => {
	await seedRoster(tabelo);
	await tabelo.cell(1, 1).click();

	// Selected or not, and whatever is hovered, a label shows no icon beside it.
	for (const row of [1, 2, 3]) {
		await expect(tabelo.rowIndex(row).getByRole("button")).toHaveCount(1);
		await expect(
			tabelo.rowIndex(row).getByRole("button", {
				name:
					row === 1
						? copy.a11y.selectHeaderRow
						: new RegExp(`^${copy.actions.selectRow}:`),
			}),
		).toHaveCount(1);
	}
	for (const column of [1, 2]) {
		await expect(tabelo.columnIndex(column).getByRole("button")).toHaveCount(1);
		await expect(
			tabelo.columnIndex(column).getByRole("button", {
				name: new RegExp(`^${copy.actions.selectColumn}:`),
			}),
		).toHaveCount(1);
	}
	await expect(
		tabelo.gridSurface().getByRole("button", {
			name: new RegExp(
				`^(${copy.actions.rowActions}|${copy.actions.columnActions}):`,
			),
		}),
	).toHaveCount(0);
	await expect(tabelo.gridSurface().locator("[data-reorder-grip]")).toHaveCount(
		0,
	);
});

test("a three-digit row number fits the narrow gutter without clipping", async ({
	tabelo,
}) => {
	await tabelo.paste(
		[
			"name",
			...Array.from({ length: 120 }, (_, index) => `Ingrid ${index}`),
		].join("\n"),
	);
	await tabelo.dismissNotices();

	// Row 121 is the widest number the table shows. Its digits stay inside the
	// label, and the label inside the gutter cell. Measured from the text
	// itself: the digits are end-aligned, so an overflow would run off the
	// leading edge, where no scroll width reports it.
	const gutter = tabelo.rowIndex(121);
	await gutter.scrollIntoViewIfNeeded();
	const fits = await gutter.getByRole("button").evaluate((label) => {
		const range = label.ownerDocument.createRange();
		range.selectNodeContents(label);
		const digits = range.getBoundingClientRect();
		const box = label.getBoundingClientRect();
		const cell = label.parentElement?.getBoundingClientRect();
		return (
			cell !== undefined &&
			digits.left >= box.left &&
			digits.right <= box.right &&
			box.left >= cell.left &&
			box.right <= cell.right
		);
	});
	expect(fits).toBe(true);
});

test("right-clicking a column letter offers the column's own options", async ({
	page,
	tabelo,
}) => {
	await seedRoster(tabelo);

	const menu = await tabelo.openColumnMenu(2);
	await expect(
		menu.getByRole("menuitem", { name: copy.actions.fitColumnToContent }),
	).toBeVisible();
	await expect(
		menu.getByRole("menuitemcheckbox", { name: copy.actions.wrapColumnText }),
	).toBeVisible();
	await menu
		.getByRole("group", { name: copy.actions.alignment })
		.getByRole("menuitemradio", { name: copy.actions.alignRight })
		.click();
	await expect(menu).toBeHidden();

	const reopened = await tabelo.openColumnMenu(2);
	await reopened
		.getByRole("group", { name: copy.actions.expectedType })
		.getByRole("menuitemradio")
		.last()
		.click();
	await expect(reopened).toBeHidden();
	// No city is a boolean, so the change asks before the rest convert (#392).
	const confirm = page.getByRole("dialog");
	await confirm
		.getByRole("button", { name: copy.columnTypeChange.confirm })
		.click();
	await expect(confirm).toBeHidden();

	// The column took both, and nothing else did.
	await expect(tabelo.header(2)).toHaveCSS("text-align", "right");
	await expect(tabelo.header(1)).not.toHaveCSS("text-align", "right");
	await expect(tabelo.columnIndex(2)).not.toHaveAttribute(
		"data-expected-type",
		"text",
	);
	await expect(tabelo.columnIndex(1)).toHaveAttribute(
		"data-expected-type",
		"text",
	);
	// Still the shared table actions below the column's own.
	await tabelo.openColumnMenu(2);
	await expect(
		page.getByRole("menuitem", { name: copy.actions.insertColumnsRight(1) }),
	).toBeVisible();
});

test("right-clicking a row number offers row actions and no column options", async ({
	tabelo,
}) => {
	await seedRoster(tabelo);

	const menu = await tabelo.openRowMenu(3);
	await expect(
		menu.getByRole("menuitem", { name: copy.actions.insertRowsAbove(1) }),
	).toBeVisible();
	await expect(
		menu.getByRole("group", { name: copy.actions.alignment }),
	).toHaveCount(0);
	await expect(
		menu.getByRole("menuitem", { name: copy.actions.fitColumnToContent }),
	).toHaveCount(0);
	// The menu acted on what was clicked: that row, as a row.
	await expect(tabelo.cell(2, 1)).toHaveAttribute("aria-selected", "true");
	await expect(tabelo.cell(2, 3)).toHaveAttribute("aria-selected", "true");
	await expect(tabelo.cell(1, 1)).toHaveAttribute("aria-selected", "false");
});

test("Alt+Down moves a two-row selection as one block", async ({
	page,
	tabelo,
}) => {
	await seedRoster(tabelo);
	await tabelo.cell(1, 1).click();
	await page.keyboard.press("Shift+ArrowDown");
	await page.keyboard.press("Shift+ArrowRight");
	await expect(tabelo.announcements).toHaveText(
		copy.a11y.selectionSummary(2, 2),
	);

	await page.keyboard.press("Alt+ArrowDown");

	await expect(tabelo.cell(1, 1)).toHaveText("Mabel");
	await expect(tabelo.cell(2, 1)).toHaveText("Ingrid");
	await expect(tabelo.cell(3, 1)).toHaveText("Paulo");
	for (const row of [2, 3]) {
		for (const column of [1, 2]) {
			await expect(tabelo.cell(row, column)).toHaveAttribute(
				"aria-selected",
				"true",
			);
		}
	}
	await expect(tabelo.cell(1, 1)).toHaveAttribute("aria-selected", "false");
	await expect(tabelo.announcements).toHaveText(
		copy.a11y.selectionSummary(2, 2),
	);
});

test("the column menu moves a two-column selection as one block", async ({
	page,
	tabelo,
}) => {
	await seedRoster(tabelo);
	await tabelo.columnIndex(1).getByRole("button").first().click();
	await tabelo
		.columnIndex(2)
		.getByRole("button")
		.first()
		.click({ modifiers: ["Shift"] });

	const menuName = `${copy.actions.columnActions}: ${copy.a11y.columnWithExpectedType("name", 0, "text")}`;
	await tabelo.columnIndex(1).click({ button: "right" });
	const menu = page.getByRole("menu", { name: menuName });
	await expect(menu).toBeVisible();
	await (await openSubmenu(page, menu, copy.actions.move))
		.getByRole("menuitem", { name: copy.actions.moveRight })
		.click();

	await expect(tabelo.header(1)).toHaveText("role");
	await expect(tabelo.header(2)).toHaveText("name");
	await expect(tabelo.header(3)).toHaveText("city");
	await expect(tabelo.cell(1, 1)).toHaveText("Designer");
	await expect(tabelo.cell(1, 2)).toHaveText("Ingrid");
	await expect(tabelo.cell(1, 3)).toHaveText("Rio");
	await expect(tabelo.header(1)).toHaveAttribute("aria-selected", "false");
	await expect(tabelo.header(2)).toHaveAttribute("aria-selected", "true");
	await expect(tabelo.header(3)).toHaveAttribute("aria-selected", "true");
});

test("the move actions advertise the binding the grid already answers", async ({
	page,
	tabelo,
}) => {
	await seedRoster(tabelo);
	await tabelo.rowIndex(3).getByRole("button").first().click();

	const menuName = `${copy.actions.rowActions}: ${copy.a11y.rowNumber(2)}`;
	await tabelo.rowIndex(4).click({ button: "right" });
	const moveDown = (
		await openSubmenu(
			page,
			page.getByRole("menu", { name: menuName }),
			copy.actions.move,
		)
	).getByRole("menuitem", { name: copy.actions.moveDown });

	// The legend follows the keyboard the user actually has: a glyph on Apple
	// platforms, the printed word everywhere else. The expectation comes from
	// the OS running the browser rather than from the app's own detection.
	const apple = process.platform === "darwin";
	const keys = moveDown.locator("kbd");
	await expect(keys.filter({ hasText: apple ? "⌥" : "Alt" })).toHaveCount(1);
	await expect(keys.filter({ hasText: "↓" })).toHaveCount(1);
	// The compact legend never reaches a screen reader as a lone symbol.
	await expect(moveDown).toHaveAccessibleName(/Down arrow/);

	// What it advertises is what the grid does: pressing the binding moves the
	// same row the menu item would have.
	await page.keyboard.press("Escape");
	await page.keyboard.press("Escape");
	await tabelo.cell(2, 1).click();
	await page.keyboard.press("Alt+ArrowDown");
	await expect(tabelo.cell(2, 1)).toHaveText("Mabel");
	await expect(tabelo.cell(3, 1)).toHaveText("Paulo");
});

test("Alt+Down refuses the header row without changing the selection", async ({
	page,
	tabelo,
}) => {
	await seedRoster(tabelo);
	await tabelo.header(2).click();

	await page.keyboard.press("Alt+ArrowDown");

	await expect(tabelo.notice("warning")).toBeVisible();
	await expect(tabelo.header(2)).toHaveAttribute("aria-selected", "true");
	await expect(tabelo.cell(1, 2)).toHaveAttribute("aria-selected", "false");
	await expect(tabelo.header(2)).toHaveText("city");
	await expect(tabelo.cell(1, 2)).toHaveText("Rio");
});

test("Move down is disabled for a block ending at the last row", async ({
	page,
	tabelo,
}) => {
	await seedRoster(tabelo);
	await tabelo.rowIndex(4).getByRole("button").first().click();
	await tabelo
		.rowIndex(5)
		.getByRole("button")
		.first()
		.click({ modifiers: ["Shift"] });

	const menuName = `${copy.actions.rowActions}: ${copy.a11y.rowNumber(3)}`;
	await tabelo.rowIndex(5).click({ button: "right" });
	const menu = page.getByRole("menu", { name: menuName });
	const moveDown = (await openSubmenu(page, menu, copy.actions.move)).getByRole(
		"menuitem",
		{ name: copy.actions.moveDown },
	);
	await expect(moveDown).toBeDisabled();
	await moveDown.hover();
	await expect(page.getByRole("tooltip")).toBeVisible();
});

test("the row and cell menus describe the same actions", async ({
	page,
	tabelo,
}) => {
	// One action list serves every menu, so the row and cell menus cannot drift
	// into different vocabularies.
	await tabelo.cell(1, 1).click();
	await tabelo.rowIndex(2).click({ button: "right" });
	const rowMenu = page.getByRole("menu", {
		name: `${copy.actions.rowActions}: ${copy.a11y.rowNumber(0)}`,
	});
	await expect(rowMenu).toBeVisible();
	const fromRow = await rowMenu
		.getByRole("menuitem")
		.evaluateAll((items) => items.map((item) => item.textContent?.trim()));
	await page.keyboard.press("Escape");
	await expect(rowMenu).toBeHidden();

	await tabelo.cell(1, 1).click({ button: "right" });
	const contextMenu = page.getByRole("menu");
	await expect(contextMenu).toBeVisible();
	const fromContext = await contextMenu
		.getByRole("menuitem")
		.evaluateAll((items) => items.map((item) => item.textContent?.trim()));

	// The row menu is the row-scoped subset of the same descriptions.
	for (const action of [
		copy.actions.copy,
		copy.actions.cut,
		copy.actions.paste,
		copy.actions.clear,
	]) {
		expect(fromRow.some((label) => label?.startsWith(action))).toBe(true);
		expect(fromContext.some((label) => label?.startsWith(action))).toBe(true);
	}
	expect(
		fromRow.some((label) => label?.startsWith(copy.actions.insertRowsAbove(1))),
	).toBe(true);
	// A row menu offers nothing about columns.
	expect(fromRow.some((label) => label?.includes("column"))).toBe(false);
});

// How many keys a shortcut legend names, read from the words a screen reader
// hears ("Option plus Enter") rather than from how the legend is drawn.
async function keyCount(item: Locator): Promise<number> {
	const words = await item.locator(".sr-only").first().textContent();
	return (words ?? "").split(" plus ").length;
}

test("both menu surfaces show the same insert legends", async ({
	page,
	tabelo,
}) => {
	const apple = process.platform === "darwin";
	// The expectation comes from the OS running the browser rather than from
	// the app's own platform detection, so the two have to agree independently.
	const columnKeys = apple ? "⌥↵" : "Alt+Enter";

	const columnMenu = await tabelo.openColumnMenu(1);
	const fromAxis = columnMenu.getByRole("menuitem", {
		name: copy.actions.insertColumnsRight(1),
	});
	await expect(fromAxis.locator("kbd")).toHaveText(columnKeys);
	await page.keyboard.press("Escape");

	// Back to one selected cell, so the labels are the singular ones. Opening
	// the column menu selected the whole column, and a menu names what it will
	// act on.
	await tabelo.cell(1, 1).click();
	await tabelo.cell(1, 1).click({ button: "right" });
	const contextMenu = page.getByRole("menu");
	await expect(
		contextMenu
			.getByRole("menuitem", { name: copy.actions.insertColumnsRight(1) })
			.locator("kbd"),
	).toHaveText(columnKeys);
	// Rows take the platform modifier, columns take Alt, and Shift chooses the
	// preceding side. Three keys is the ceiling for all four.
	expect(
		await keyCount(
			contextMenu.getByRole("menuitem", {
				name: copy.actions.insertColumnsLeft(1),
			}),
		),
	).toBe(3);
	expect(
		await keyCount(
			contextMenu.getByRole("menuitem", {
				name: copy.actions.insertRowsBelow(1),
			}),
		),
	).toBe(2);
	expect(
		await keyCount(
			contextMenu.getByRole("menuitem", {
				name: copy.actions.insertRowsAbove(1),
			}),
		),
	).toBe(3);
});

test("context menu refuses to delete every selected column", async ({
	page,
	tabelo,
}) => {
	await tabelo.cell(1, 1).click();
	await page.keyboard.press("ControlOrMeta+a");
	await tabelo.cell(1, 2).click({ button: "right" });

	const action = page
		.getByRole("menu")
		.getByRole("menuitem", { name: copy.actions.deleteColumns(3) });
	await expect(
		page
			.getByRole("menu")
			.getByRole("menuitem", { name: copy.actions.insertColumnsLeft(3) }),
	).toBeVisible();
	await expect(action).toBeDisabled();
	await action.hover();
	await expect(page.getByRole("tooltip")).toBeVisible();
	await page.keyboard.press("Escape");
	await page.keyboard.press("Escape");

	await tabelo.cell(1, 1).click();
	await page.keyboard.press("ControlOrMeta+a");
	await page.keyboard.press("ControlOrMeta+Backspace");
	await expect(tabelo.notice("warning")).toBeVisible();
	await expect(tabelo.header(1)).toHaveAccessibleName("A");
	await expect(tabelo.header(3)).toHaveAccessibleName("C");
});

test("context menu refuses to delete every selected row", async ({
	page,
	tabelo,
}) => {
	await tabelo.cell(1, 2).click();
	await page.keyboard.press("Shift+ArrowDown");
	await page.keyboard.press("Shift+ArrowDown");
	await tabelo.cell(2, 2).click({ button: "right" });

	const action = page
		.getByRole("menu")
		.getByRole("menuitem", { name: copy.actions.deleteRows(3) });
	await expect(
		page
			.getByRole("menu")
			.getByRole("menuitem", { name: copy.actions.insertRowsAbove(3) }),
	).toBeVisible();
	await expect(action).toBeDisabled();
	await action.hover();
	await expect(page.getByRole("tooltip")).toBeVisible();
	await page.keyboard.press("Escape");
	await page.keyboard.press("Escape");

	await tabelo.cell(2, 2).focus();
	await page.keyboard.press("ControlOrMeta+Backspace");
	await expect(tabelo.notice("warning")).toBeVisible();
	await expect(tabelo.cell(3, 1)).toBeVisible();
});

test("column headers extend selection by drag and by Shift", async ({
	page,
	tabelo,
}) => {
	const selected = async (column: number) =>
		(await tabelo.header(column).getAttribute("aria-selected")) === "true";

	const first = await tabelo
		.columnIndex(1)
		.getByRole("button")
		.first()
		.boundingBox();
	const third = await tabelo
		.columnIndex(3)
		.getByRole("button")
		.first()
		.boundingBox();
	expect(first).not.toBeNull();
	expect(third).not.toBeNull();
	await page.mouse.move((first?.x ?? 0) + 4, (first?.y ?? 0) + 4);
	await page.mouse.down();
	await page.mouse.move((third?.x ?? 0) + 4, (third?.y ?? 0) + 4);
	await page.mouse.up();
	expect(await selected(1)).toBe(true);
	expect(await selected(2)).toBe(true);
	expect(await selected(3)).toBe(true);

	await tabelo.columnIndex(1).getByRole("button").first().click();
	await tabelo
		.columnIndex(2)
		.getByRole("button")
		.first()
		.click({ modifiers: ["Shift"] });
	expect(await selected(1)).toBe(true);
	expect(await selected(2)).toBe(true);
	expect(await selected(3)).toBe(false);
});

test("row numbers extend selection by drag and by Shift", async ({
	page,
	tabelo,
}) => {
	const selected = async (row: number) =>
		(await tabelo.cell(row, 1).getAttribute("aria-selected")) === "true";

	const first = await tabelo
		.rowIndex(2)
		.getByRole("button")
		.first()
		.boundingBox();
	const third = await tabelo
		.rowIndex(4)
		.getByRole("button")
		.first()
		.boundingBox();
	expect(first).not.toBeNull();
	expect(third).not.toBeNull();
	await page.mouse.move((first?.x ?? 0) + 4, (first?.y ?? 0) + 4);
	await page.mouse.down();
	await page.mouse.move((third?.x ?? 0) + 4, (third?.y ?? 0) + 4);
	await page.mouse.up();
	expect(await selected(1)).toBe(true);
	expect(await selected(2)).toBe(true);
	expect(await selected(3)).toBe(true);

	await tabelo.rowIndex(2).getByRole("button").first().click();
	await tabelo
		.rowIndex(3)
		.getByRole("button")
		.first()
		.click({ modifiers: ["Shift"] });
	expect(await selected(1)).toBe(true);
	expect(await selected(2)).toBe(true);
	expect(await selected(3)).toBe(false);
});

test("the header row's select handle extends into data rows", async ({
	tabelo,
}) => {
	const selected = async (row: number) =>
		(await tabelo.cell(row, 1).getAttribute("aria-selected")) === "true";
	const headerSelected = async () =>
		(await tabelo.header(1).getAttribute("aria-selected")) === "true";

	await tabelo.rowIndex(1).getByRole("button").first().click();
	await tabelo
		.rowIndex(3)
		.getByRole("button")
		.first()
		.click({ modifiers: ["Shift"] });

	expect(await headerSelected()).toBe(true);
	expect(await selected(1)).toBe(true);
	expect(await selected(2)).toBe(true);
	expect(await selected(3)).toBe(false);
});

test("Space on a focused row handle selects that row like a click", async ({
	page,
	tabelo,
}) => {
	const button = tabelo.rowIndex(3).getByRole("button").first();
	await button.focus();
	await page.keyboard.press("Space");

	await expect(tabelo.cell(2, 1)).toHaveAttribute("aria-selected", "true");
	await expect(tabelo.cell(1, 1)).toHaveAttribute("aria-selected", "false");
});

test("releasing a row drag stops it from continuing to extend the selection", async ({
	page,
	tabelo,
}) => {
	const selected = async (row: number) =>
		(await tabelo.cell(row, 1).getAttribute("aria-selected")) === "true";

	const first = await tabelo
		.rowIndex(2)
		.getByRole("button")
		.first()
		.boundingBox();
	expect(first).not.toBeNull();
	await page.mouse.move((first?.x ?? 0) + 4, (first?.y ?? 0) + 4);
	await page.mouse.down();
	await page.mouse.up();
	expect(await selected(1)).toBe(true);
	expect(await selected(2)).toBe(false);

	// A drag that already ended must not resume extending on a later hover.
	const third = await tabelo
		.rowIndex(4)
		.getByRole("button")
		.first()
		.boundingBox();
	expect(third).not.toBeNull();
	await page.mouse.move((third?.x ?? 0) + 4, (third?.y ?? 0) + 4);
	expect(await selected(1)).toBe(true);
	expect(await selected(3)).toBe(false);
});

test("Shift+click on row numbers extends the selection and Mod+Backspace removes exactly those rows", async ({
	page,
	tabelo,
}) => {
	await tabelo.paste(
		"Name\tRole\nInez\tDesigner\nMark\tEngineer\nInez\tWriter\nMark\tAnalyst\nInez\tOwner",
	);

	await tabelo.rowIndex(2).getByRole("button").first().click();
	await tabelo
		.rowIndex(5)
		.getByRole("button")
		.first()
		.click({ modifiers: ["Shift"] });

	for (const row of [1, 2, 3, 4]) {
		await expect(tabelo.cell(row, 1)).toHaveAttribute("aria-selected", "true");
	}
	await expect(tabelo.cell(5, 1)).toHaveAttribute("aria-selected", "false");

	const modifier = process.platform === "darwin" ? "Meta" : "Control";
	await tabelo.cell(2, 1).focus();
	await page.keyboard.press(`${modifier}+Backspace`);

	await expect(tabelo.cell(1, 1)).toHaveText("Inez");
	await expect(tabelo.cell(1, 2)).toHaveText("Owner");
});
