import type { Locator } from "@playwright/test";
import { copy } from "@/copy/copy";
import { samplePeopleCsv } from "@/core/sample-data";
import { expect, test } from "./fixtures";
import type { TabeloPage } from "./helpers";

// Row and column actions were a small icon that only existed while the pointer
// was inside its header. They are still quiet, but they are now findable: the
// target is the product's control minimum, and the row or column you are
// working in shows its own without being hovered at all.

function opacity(trigger: Locator): Promise<string> {
	return trigger.evaluate((element) => getComputedStyle(element).opacity);
}

// The icon stays small and the ::after box carries the target, so the hit area
// has to be measured rather than read off the element's own size.
function hitArea(trigger: Locator): Promise<{ width: number; height: number }> {
	return trigger.evaluate((element) => {
		const box = element.getBoundingClientRect();
		const after = getComputedStyle(element, "::after");
		const inset = (value: string) => Math.abs(Number.parseFloat(value) || 0);
		return {
			width: box.width + inset(after.left) + inset(after.right),
			height: box.height + inset(after.top) + inset(after.bottom),
		};
	});
}

async function seedRoster(tabelo: TabeloPage): Promise<void> {
	await tabelo.paste(samplePeopleCsv(4).replaceAll(",", "\t"));
	await tabelo.dismissNotices();
}

test("row and column actions meet the control minimum target", async ({
	tabelo,
}) => {
	const row = tabelo.grid().getByRole("button", {
		name: new RegExp(`^${copy.actions.rowActions}:`),
	});
	const column = tabelo.grid().getByRole("button", {
		name: new RegExp(`^${copy.actions.columnActions}:`),
	});

	for (const trigger of [row.first(), column.first()]) {
		const area = await hitArea(trigger);
		const controlMinimum = await trigger.evaluate(() => {
			const root = getComputedStyle(document.documentElement);
			return (
				Number.parseFloat(root.getPropertyValue("--control-h-sm")) *
				Number.parseFloat(root.fontSize)
			);
		});
		expect(area.width).toBeGreaterThanOrEqual(controlMinimum);
		expect(area.height).toBeGreaterThanOrEqual(controlMinimum);
	}
});

test("the row and column being worked in reveal their own actions", async ({
	page,
	tabelo,
}) => {
	const rowTrigger = (index: number) =>
		tabelo.grid().getByRole("button", {
			name: `${copy.actions.rowActions}: ${copy.a11y.rowNumber(index - 1)}`,
		});
	const columnTrigger = (name: string) =>
		tabelo.grid().getByRole("button", {
			name: `${copy.actions.columnActions}: ${name}`,
		});

	// The rows the user is not in stay quiet. (Row 1 starts selected, so it is
	// legitimately showing its own from the first paint.)
	expect(await opacity(rowTrigger(2))).toBe("0");
	expect(await opacity(rowTrigger(3))).toBe("0");

	await tabelo.cell(2, 2).click();
	// The pointer would otherwise keep hovering whatever it just clicked.
	await page.mouse.move(0, 0);

	// Exactly the row and column the selection is in, and no others.
	await expect.poll(() => opacity(rowTrigger(2))).toBe("1");
	await expect
		.poll(() => opacity(columnTrigger(copy.a11y.columnLetter(1))))
		.toBe("1");
	await expect.poll(() => opacity(rowTrigger(1))).toBe("0");
	await expect
		.poll(() => opacity(columnTrigger(copy.a11y.columnLetter(0))))
		.toBe("0");
});

test("moving by keyboard moves the revealed affordance with it", async ({
	page,
	tabelo,
}) => {
	const rowTrigger = (index: number) =>
		tabelo.grid().getByRole("button", {
			name: `${copy.actions.rowActions}: ${copy.a11y.rowNumber(index - 1)}`,
		});

	await tabelo.cell(1, 1).click();
	await page.mouse.move(0, 0);
	await expect.poll(() => opacity(rowTrigger(1))).toBe("1");

	await page.keyboard.press("ArrowDown");

	await expect.poll(() => opacity(rowTrigger(2))).toBe("1");
	await expect.poll(() => opacity(rowTrigger(1))).toBe("0");
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

	const menuName = `${copy.actions.columnActions}: ${copy.a11y.columnHeader("name", 0)}`;
	await tabelo.grid().getByRole("button", { name: menuName }).click();
	const menu = page.getByRole("menu", { name: menuName });
	await expect(menu).toBeVisible();
	await menu.getByRole("menuitem", { name: copy.actions.moveRight }).click();

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
	await tabelo.grid().getByRole("button", { name: menuName }).click();
	const menu = page.getByRole("menu", { name: menuName });
	const moveDown = menu.getByRole("menuitem", { name: copy.actions.moveDown });
	await expect(moveDown).toBeDisabled();
	await moveDown.hover();
	await expect(page.getByRole("tooltip")).toBeVisible();
});

test("tabbing into a header reveals its actions without a pointer", async ({
	tabelo,
}) => {
	const trigger = tabelo.grid().getByRole("button", {
		name: `${copy.actions.columnActions}: ${copy.a11y.columnLetter(2)}`,
	});
	expect(await opacity(trigger)).toBe("0");

	// focus-within on the strip cell, not focus on the icon itself.
	await tabelo.columnIndex(3).getByRole("button").first().focus();

	await expect.poll(() => opacity(trigger)).toBe("1");
});

test("hovering a row still reveals its actions", async ({ tabelo }) => {
	const trigger = tabelo.grid().getByRole("button", {
		name: `${copy.actions.rowActions}: ${copy.a11y.rowNumber(2)}`,
	});
	expect(await opacity(trigger)).toBe("0");

	await tabelo.cell(3, 1).hover();

	await expect.poll(() => opacity(trigger)).toBe("1");
});

test("the axis and context menus describe the same actions", async ({
	page,
	tabelo,
}) => {
	// One action list serves both renderers, so row and context menus cannot
	// drift into different vocabularies.
	await tabelo.cell(1, 1).click();
	await tabelo
		.grid()
		.getByRole("button", {
			name: `${copy.actions.rowActions}: ${copy.a11y.rowNumber(0)}`,
		})
		.click();
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

test("four panes stay quiet: no action icons in the cells", async ({
	tabelo,
}) => {
	await tabelo.chooseLayout("quad");
	await tabelo.cell(1, 1).click();

	// Only the row and column in play show a trigger; the cells carry none.
	const visible = await tabelo
		.grid()
		.getByRole("button", {
			name: new RegExp(
				`^(${copy.actions.rowActions}|${copy.actions.columnActions}):`,
			),
		})
		.evaluateAll(
			(items) =>
				items.filter((item) => getComputedStyle(item).opacity === "1").length,
		);
	expect(visible).toBe(2);
	await expect(tabelo.grid().getByRole("gridcell").first()).not.toContainText(
		"actions",
	);
});
