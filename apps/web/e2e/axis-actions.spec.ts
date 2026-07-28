import type { Locator } from "@playwright/test";
import { expect, test } from "./fixtures";

// Row and column actions were a 20px icon that only existed while the pointer
// was inside its header. They are still quiet, but they are now findable: the
// target is the product's control minimum, and the row or column you are
// working in shows its own without being hovered at all.

const CONTROL_MIN = 28;

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

test("row and column actions meet the control minimum target", async ({
	tabelo,
}) => {
	const row = tabelo.grid().getByRole("button", { name: /^Row actions: / });
	const column = tabelo
		.grid()
		.getByRole("button", { name: /^Column actions: / });

	for (const trigger of [row.first(), column.first()]) {
		const area = await hitArea(trigger);
		expect(area.width).toBeGreaterThanOrEqual(CONTROL_MIN);
		expect(area.height).toBeGreaterThanOrEqual(CONTROL_MIN);
	}
});

test("the row and column being worked in reveal their own actions", async ({
	page,
	tabelo,
}) => {
	const rowTrigger = (index: number) =>
		tabelo.grid().getByRole("button", { name: `Row actions: Row ${index}` });
	const columnTrigger = (name: string) =>
		tabelo.grid().getByRole("button", { name: `Column actions: ${name}` });

	// The rows the user is not in stay quiet. (Row 1 starts selected, so it is
	// legitimately showing its own from the first paint.)
	expect(await opacity(rowTrigger(2))).toBe("0");
	expect(await opacity(rowTrigger(3))).toBe("0");

	await tabelo.cell(2, 2).click();
	// The pointer would otherwise keep hovering whatever it just clicked.
	await page.mouse.move(0, 0);

	// Exactly the row and column the selection is in, and no others.
	await expect.poll(() => opacity(rowTrigger(2))).toBe("1");
	await expect.poll(() => opacity(columnTrigger("Column 2"))).toBe("1");
	await expect.poll(() => opacity(rowTrigger(1))).toBe("0");
	await expect.poll(() => opacity(columnTrigger("Column 1"))).toBe("0");
});

test("moving by keyboard moves the revealed affordance with it", async ({
	page,
	tabelo,
}) => {
	const rowTrigger = (index: number) =>
		tabelo.grid().getByRole("button", { name: `Row actions: Row ${index}` });

	await tabelo.cell(1, 1).click();
	await page.mouse.move(0, 0);
	await expect.poll(() => opacity(rowTrigger(1))).toBe("1");

	await page.keyboard.press("ArrowDown");

	await expect.poll(() => opacity(rowTrigger(2))).toBe("1");
	await expect.poll(() => opacity(rowTrigger(1))).toBe("0");
});

test("tabbing into a header reveals its actions without a pointer", async ({
	tabelo,
}) => {
	const trigger = tabelo
		.grid()
		.getByRole("button", { name: "Column actions: Column 3" });
	expect(await opacity(trigger)).toBe("0");

	// focus-within on the header, not focus on the icon itself.
	await tabelo.header(3).getByRole("button").first().focus();

	await expect.poll(() => opacity(trigger)).toBe("1");
});

test("hovering a row still reveals its actions", async ({ tabelo }) => {
	const trigger = tabelo
		.grid()
		.getByRole("button", { name: "Row actions: Row 3" });
	expect(await opacity(trigger)).toBe("0");

	await tabelo.cell(3, 1).hover();

	await expect.poll(() => opacity(trigger)).toBe("1");
});

test("the axis menus and the pane menu describe the same actions", async ({
	page,
	tabelo,
}) => {
	// One action list, three renderers: the row menu, the table menu, and the
	// context menu must not drift into three different vocabularies.
	await tabelo.cell(1, 1).click();
	await tabelo
		.grid()
		.getByRole("button", { name: "Row actions: Row 1" })
		.click();
	const rowMenu = page.getByRole("menu", { name: "Row actions: Row 1" });
	await expect(rowMenu).toBeVisible();
	const fromRow = await rowMenu
		.getByRole("menuitem")
		.evaluateAll((items) => items.map((item) => item.textContent?.trim()));
	await page.keyboard.press("Escape");
	await expect(rowMenu).toBeHidden();

	await page.getByRole("button", { name: "Table actions" }).click();
	const tableMenu = page.getByRole("menu", { name: "Table actions" });
	await expect(tableMenu).toBeVisible();
	const fromTable = await tableMenu
		.getByRole("menuitem")
		.evaluateAll((items) => items.map((item) => item.textContent?.trim()));

	// The row menu is the row-scoped subset of the same descriptions.
	for (const action of ["Copy", "Cut", "Paste", "Clear contents"]) {
		expect(fromRow.some((label) => label?.startsWith(action))).toBe(true);
		expect(fromTable.some((label) => label?.startsWith(action))).toBe(true);
	}
	expect(fromRow.some((label) => label?.startsWith("Insert row above"))).toBe(
		true,
	);
	// A row menu offers nothing about columns.
	expect(fromRow.some((label) => label?.includes("column"))).toBe(false);
});

test("four panes stay quiet: no action icons in the cells", async ({
	tabelo,
}) => {
	await tabelo.chooseLayout("Four panes");
	await tabelo.cell(1, 1).click();

	// Only the row and column in play show a trigger; the cells carry none.
	const visible = await tabelo
		.grid()
		.getByRole("button", { name: /^(Row|Column) actions: / })
		.evaluateAll(
			(items) =>
				items.filter((item) => getComputedStyle(item).opacity === "1").length,
		);
	expect(visible).toBe(2);
	await expect(tabelo.grid().getByRole("gridcell").first()).not.toContainText(
		"actions",
	);
});
