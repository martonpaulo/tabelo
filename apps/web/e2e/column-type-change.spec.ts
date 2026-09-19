import { copy } from "@/copy/copy";
import type { ExpectedColumnType } from "@/core/types";
import { expect, test } from "./fixtures";
import type { TabeloPage } from "./helpers";

// Changing a column's expected type converts its cells by the user's choice
// (#392, docs/adr/0008). Cells that lose nothing convert at once; when some
// cannot, the change asks first, and either way it is one Undo.

async function chooseExpectedType(
	tabelo: TabeloPage,
	column: number,
	type: ExpectedColumnType,
): Promise<void> {
	const menu = await tabelo.openColumnMenu(column);
	await menu
		.getByRole("group", { name: copy.actions.expectedType })
		.getByRole("menuitemradio", {
			name: copy.cellTypes.expected[type],
			exact: true,
		})
		.click();
	await menu.waitFor({ state: "hidden" });
}

test("a column whose cells all convert changes at once and undoes in one step", async ({
	page,
	tabelo,
}) => {
	await tabelo.importFile(
		"counts.json",
		'[{"n":"1"},{"n":"2"},{"n":""}]',
		"application/json",
	);
	await expect(tabelo.cell(1, 1)).toHaveAttribute("data-cell-type", "string");
	const json = tabelo.source("json");
	await expect(json).toContainText('"n": "1"');

	await chooseExpectedType(tabelo, 1, "number");
	await expect(page.getByRole("dialog")).toHaveCount(0);
	await expect(tabelo.columnIndex(1)).toHaveAttribute(
		"data-expected-type",
		"number",
	);
	await expect(tabelo.cell(1, 1)).toHaveAttribute("data-cell-type", "number");
	await expect(tabelo.cell(2, 1)).toHaveAttribute("data-cell-type", "number");
	// The empty cell stays empty and carries no divergence mark.
	await expect(tabelo.cell(3, 1)).not.toHaveAttribute(
		"data-cell-type-divergent",
	);
	await expect(json).toContainText('"n": 1');
	await expect(json).toContainText('"n": ""');

	await tabelo.runAppCommand("undo");
	await expect(tabelo.columnIndex(1)).toHaveAttribute(
		"data-expected-type",
		"text",
	);
	await expect(tabelo.cell(1, 1)).toHaveAttribute("data-cell-type", "string");
	await expect(json).toContainText('"n": "1"');
});

test("a column with cells that cannot convert asks first, and both answers hold", async ({
	page,
	tabelo,
}) => {
	await tabelo.importFile(
		"mixed.json",
		'[{"n":"abc"},{"n":"x"},{"n":"7"}]',
		"application/json",
	);
	await expect(tabelo.cell(3, 1)).toHaveAttribute("data-cell-type", "string");
	const dialog = page.getByRole("dialog");

	// Cancel changes nothing, not even the expected type.
	await chooseExpectedType(tabelo, 1, "number");
	await expect(dialog).toBeVisible();
	// The count of cells that cannot convert, which is data, not wording.
	await expect(dialog).toContainText("2");
	await dialog.getByRole("button", { name: copy.actions.cancel }).click();
	await expect(dialog).toBeHidden();
	await expect(tabelo.columnIndex(1)).toHaveAttribute(
		"data-expected-type",
		"text",
	);
	await expect(tabelo.cell(3, 1)).toHaveAttribute("data-cell-type", "string");

	// Convert the rest: the convertible cell converts, the others keep their
	// value and type and show the divergence mark.
	await chooseExpectedType(tabelo, 1, "number");
	await dialog
		.getByRole("button", { name: copy.columnTypeChange.confirm })
		.click();
	await expect(dialog).toBeHidden();
	await expect(tabelo.columnIndex(1)).toHaveAttribute(
		"data-expected-type",
		"number",
	);
	await expect(tabelo.cell(3, 1)).toHaveAttribute("data-cell-type", "number");
	await expect(tabelo.cell(1, 1)).toHaveAttribute("data-cell-type", "string");
	await expect(tabelo.cell(1, 1)).toHaveAttribute(
		"data-cell-type-divergent",
		"true",
	);

	// One Undo restores the expectation and every cell.
	await tabelo.runAppCommand("undo");
	await expect(tabelo.columnIndex(1)).toHaveAttribute(
		"data-expected-type",
		"text",
	);
	await expect(tabelo.cell(3, 1)).toHaveAttribute("data-cell-type", "string");
	await expect(tabelo.cell(1, 1)).not.toHaveAttribute(
		"data-cell-type-divergent",
	);
});
