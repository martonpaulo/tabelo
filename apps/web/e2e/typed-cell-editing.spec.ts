import type { Page } from "@playwright/test";
import { copy } from "@/copy/copy";
import type { CellValueType, ExpectedColumnType } from "@/core/types";
import { expect, test } from "./fixtures";
import type { TabeloPage } from "./helpers";

async function setExpectedType(
	page: Page,
	tabelo: TabeloPage,
	type: ExpectedColumnType,
) {
	const trigger = tabelo.columnIndex(1).getByRole("button", {
		name: /column actions: .*expected type/i,
	});
	await trigger.click();
	const menu = page.getByRole("menu", {
		name: /column actions: .*expected type/i,
	});
	const group = menu.getByRole("group", { name: copy.actions.expectedType });
	await expect(group.getByRole("menuitemradio")).toHaveCount(3);
	await expect(group.getByRole("menuitemradio", { checked: true })).toHaveCount(
		1,
	);
	await group
		.getByRole("menuitemradio", {
			name: copy.cellTypes.expected[type],
			exact: true,
		})
		.click();
	await menu.waitFor({ state: "hidden" });
}

async function enterCellText(
	tabelo: TabeloPage,
	row: number,
	column: number,
	value: string,
) {
	const cell = tabelo.cell(row, column);
	await cell.click();
	await cell.press("a");
	const editor = tabelo.grid().getByRole("textbox");
	await editor.fill(value);
	await editor.press("Enter");
}

function visibleCellTypeMenu(page: Page) {
	return page.getByRole("menu").filter({
		has: page.getByText(copy.actions.cellType, { exact: true }),
	});
}

async function chooseCellType(
	page: Page,
	tabelo: TabeloPage,
	type: CellValueType,
) {
	const cell = tabelo.cell(1, 1);
	await cell.click({ button: "right" });
	const menu = visibleCellTypeMenu(page);
	await expect(menu.getByRole("menuitemradio", { checked: true })).toHaveCount(
		1,
	);
	await menu
		.getByRole("menuitemradio", {
			name: copy.cellTypes.real[type],
			exact: true,
		})
		.click();
	await menu.waitFor({ state: "hidden" });
}

test("column expectation guides canonical and escaped cell entry", async ({
	page,
	tabelo,
}) => {
	const cell = tabelo.cell(1, 1);
	await enterCellText(tabelo, 1, 1, "007");
	await expect(cell).toHaveAttribute("title", "007");
	await expect(cell).toHaveAttribute("data-cell-type", "string");

	await setExpectedType(page, tabelo, "number");
	await expect(cell).toHaveAttribute("title", "007");
	await expect(cell).toHaveAttribute("data-cell-type", "string");
	await expect(cell).toHaveAttribute("data-cell-type-divergent", "true");

	await enterCellText(tabelo, 1, 1, "7");
	await expect(cell).toHaveAttribute("title", "7");
	await expect(cell).toHaveAttribute("data-cell-type", "number");
	await expect(cell).not.toHaveAttribute("data-cell-type-divergent");

	await enterCellText(tabelo, 1, 1, "'hello");
	await expect(cell).toHaveAttribute("title", "hello");
	await expect(cell).toHaveAttribute("data-cell-type", "string");
	await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("representation-changing number input requires an explicit choice", async ({
	page,
	tabelo,
}) => {
	await setExpectedType(page, tabelo, "number");
	const cell = tabelo.cell(1, 1);

	await enterCellText(tabelo, 1, 1, "007");
	let dialog = page.getByRole("dialog", {
		name: copy.typedEditing.choiceTitle,
	});
	await expect(dialog).toBeVisible();
	await dialog
		.getByRole("button", { name: copy.typedEditing.keepAsText })
		.click();
	await expect(dialog).toBeHidden();
	await expect(cell).toHaveAttribute("title", "007");
	await expect(cell).toHaveAttribute("data-cell-type", "string");
	await expect(cell).toBeFocused();

	await enterCellText(tabelo, 1, 1, "007");
	dialog = page.getByRole("dialog", {
		name: copy.typedEditing.choiceTitle,
	});
	await dialog
		.getByRole("button", {
			name: copy.typedEditing.convertTo("number"),
		})
		.click();
	await expect(dialog).toBeHidden();
	await expect(cell).toHaveAttribute("title", "7");
	await expect(cell).toHaveAttribute("data-cell-type", "number");
	await expect(cell).toBeFocused();

	await tabelo.runAppCommand("undo");
	await expect(cell).toHaveAttribute("title", "007");
	await expect(cell).toHaveAttribute("data-cell-type", "string");
});

test("invalid typed input remains editable before it can become text", async ({
	page,
	tabelo,
}) => {
	await setExpectedType(page, tabelo, "boolean");
	const cell = tabelo.cell(1, 1);

	await enterCellText(tabelo, 1, 1, "yes");
	let dialog = page.getByRole("dialog", {
		name: copy.typedEditing.invalidTitle,
	});
	await dialog
		.getByRole("button", { name: copy.typedEditing.keepEditing })
		.click();
	const editor = tabelo.grid().getByRole("textbox");
	await expect(editor).toBeFocused();
	await expect(editor).toHaveValue("yes");

	await editor.press("Enter");
	dialog = page.getByRole("dialog", {
		name: copy.typedEditing.invalidTitle,
	});
	await dialog
		.getByRole("button", { name: copy.typedEditing.changeToText })
		.click();
	await expect(dialog).toBeHidden();
	await expect(cell).toHaveAttribute("title", "yes");
	await expect(cell).toHaveAttribute("data-cell-type", "string");
	await expect(cell).toBeFocused();
});

test("the cell menu exposes explicit conversions and disables invalid ones", async ({
	page,
	tabelo,
}) => {
	const cell = tabelo.cell(1, 1);
	await enterCellText(tabelo, 1, 1, "7");
	await chooseCellType(page, tabelo, "number");
	await expect(cell).toHaveAttribute("data-cell-type", "number");

	await chooseCellType(page, tabelo, "string");
	await expect(cell).toHaveAttribute("title", "7");
	await expect(cell).toHaveAttribute("data-cell-type", "string");
	await tabelo.runAppCommand("undo");
	await expect(cell).toHaveAttribute("data-cell-type", "number");

	await enterCellText(tabelo, 1, 1, "hello");
	await cell.click({ button: "right" });
	const menu = visibleCellTypeMenu(page);
	const booleanOption = menu.getByRole("menuitemradio", {
		name: new RegExp(copy.cellTypes.real.boolean, "i"),
	});
	await expect(booleanOption).toBeDisabled();
	await booleanOption.hover();
	const tooltip = page.getByRole("tooltip");
	await expect(tooltip).toBeVisible();
	await page.keyboard.press("Escape");
	await tooltip.waitFor({ state: "hidden" });
	await page.keyboard.press("Escape");
	await menu.waitFor({ state: "hidden" });

	await cell.click();
	await tabelo.cell(1, 2).click({ modifiers: ["Shift"] });
	await cell.click({ button: "right" });
	const rangeMenu = visibleCellTypeMenu(page);
	const rangeOptions = rangeMenu.getByRole("menuitemradio");
	await expect(rangeOptions).toHaveCount(4);
	for (const option of await rangeOptions.all()) {
		await expect(option).toBeDisabled();
	}
});
