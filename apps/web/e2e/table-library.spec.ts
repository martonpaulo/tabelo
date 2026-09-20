import { copy } from "@/copy/copy";
import { DEFAULT_TABLE_NAME } from "@/copy/product";
import { expect, test } from "./fixtures";
import type { TabeloPage } from "./helpers";

// The library (#403): several tables live in this browser, the app menu lists
// them, and one of them is active. What the tests assert is that a table's
// content and its name stay with it, because that is what switching away and
// back has to preserve.

async function createTable(tabelo: TabeloPage): Promise<void> {
	await tabelo.runAppCommand("newTable");
	const welcome = tabelo.page.getByRole("region", { name: copy.empty.title });
	await expect(welcome).toBeVisible();
	await welcome.getByRole("button", { name: copy.empty.emptyAction }).click();
}

test("a new table is added beside the current one and both keep their content", async ({
	tabelo,
}) => {
	await tabelo.editCell(1, 1, "First table");

	await createTable(tabelo);
	await expect(tabelo.cell(1, 1)).toHaveText("");
	await tabelo.editCell(1, 1, "Second table");

	const menu = await tabelo.openAppMenu();
	const entries = menu.getByRole("menuitem", { name: DEFAULT_TABLE_NAME });
	await expect(entries).toHaveCount(2);
	await entries.first().click();

	await expect(tabelo.cell(1, 1)).toHaveText("First table");

	const back = await tabelo.openAppMenu();
	await back.getByRole("menuitem", { name: DEFAULT_TABLE_NAME }).last().click();
	await expect(tabelo.cell(1, 1)).toHaveText("Second table");
});

test("a table survives a reload with the table that was active", async ({
	tabelo,
}) => {
	await tabelo.editCell(1, 1, "Kept");
	await createTable(tabelo);
	await tabelo.editCell(1, 1, "Active one");

	await tabelo.page.reload();
	await expect(tabelo.workspace).toBeVisible();
	await expect(tabelo.cell(1, 1)).toHaveText("Active one");

	const menu = await tabelo.openAppMenu();
	await expect(
		menu.getByRole("menuitem", { name: DEFAULT_TABLE_NAME }),
	).toHaveCount(2);
});

test("deleting a table asks first and leaves the others alone", async ({
	tabelo,
}) => {
	await tabelo.editCell(1, 1, "Keep me");
	await createTable(tabelo);
	await tabelo.editCell(1, 1, "Delete me");

	await tabelo.runAppCommand("deleteTable");
	const dialog = tabelo.page.getByRole("dialog", {
		name: copy.deleteTable.title,
	});
	await expect(dialog).toBeVisible();
	await expect(
		dialog.getByRole("button", { name: copy.deleteTable.confirm }),
	).toHaveAttribute("data-variant", "destructive");
	await dialog.getByRole("button", { name: copy.actions.cancel }).click();
	await expect(tabelo.cell(1, 1)).toHaveText("Delete me");

	await tabelo.runAppCommand("deleteTable");
	await dialog.getByRole("button", { name: copy.deleteTable.confirm }).click();

	await expect(tabelo.cell(1, 1)).toHaveText("Keep me");
	const menu = await tabelo.openAppMenu();
	await expect(
		menu.getByRole("menuitem", { name: DEFAULT_TABLE_NAME }),
	).toHaveCount(0);
});
