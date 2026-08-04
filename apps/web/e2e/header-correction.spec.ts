import { copy } from "@/copy/copy";
import { expect, test } from "./fixtures";

test("a numeric first row does not offer header correction", async ({
	tabelo,
}) => {
	await tabelo.paste("1\t2\n3\t4");

	await expect(tabelo.header(1)).toHaveText("");
	await expect(tabelo.cell(1, 1)).toHaveText("1");
	await expect(
		tabelo.page.getByRole("button", { name: copy.notices.headerGuessAction }),
	).toHaveCount(0);
});

test("a later document edit invalidates header correction", async ({
	tabelo,
}) => {
	await tabelo.paste("Name\tRole\nIngrid\tDesigner");
	await expect(tabelo.notice()).toBeVisible();

	await tabelo.editCell(1, 1, "Paulo");

	await expect(
		tabelo.page.getByRole("button", { name: copy.notices.headerGuessAction }),
	).toHaveCount(0);
});

test("numeric and blank named files do not offer correction", async ({
	tabelo,
}) => {
	await tabelo.importFile("numbers.csv", "1,2\n3,4", "text/csv");

	await expect(tabelo.header(1)).toHaveText("");
	await expect(tabelo.cell(1, 1)).toHaveText("1");
	await expect(
		tabelo.page.getByRole("button", { name: copy.notices.headerGuessAction }),
	).toHaveCount(0);

	await tabelo.importFile("blank.csv", "Name,\nIngrid,Designer", "text/csv");

	await expect(tabelo.header(1)).toHaveText("");
	await expect(tabelo.cell(1, 1)).toHaveText("Name");
	await expect(
		tabelo.page.getByRole("button", { name: copy.notices.headerGuessAction }),
	).toHaveCount(0);
});

test("a text-header file offers correction once and dismissal keeps data", async ({
	tabelo,
}) => {
	await tabelo.importFile(
		"people.csv",
		"Name,Role\nIngrid,Designer",
		"text/csv",
	);
	await expect(tabelo.notice()).toBeVisible();

	await tabelo.page.getByRole("button", { name: copy.actions.dismiss }).click();

	await expect(
		tabelo.page.getByRole("button", { name: copy.notices.headerGuessAction }),
	).toHaveCount(0);
	await expect(tabelo.header(1)).toContainText("Name");
	await expect(tabelo.cell(1, 1)).toHaveText("Ingrid");
});

test("header correction and undo are atomic", async ({ tabelo }) => {
	await tabelo.paste("Name\tRole\nIngrid\tDesigner");
	await tabelo.page
		.getByRole("button", { name: copy.notices.headerGuessAction })
		.click();

	await expect(tabelo.header(1)).toHaveText("");
	await expect(tabelo.cell(1, 1)).toHaveText("Name");

	await tabelo.runAppCommand("undo");

	await expect(tabelo.header(1)).toContainText("Name");
	await expect(tabelo.cell(1, 1)).toHaveText("Ingrid");
	await expect(
		tabelo.page.getByRole("button", { name: copy.notices.headerGuessAction }),
	).toHaveCount(0);
});
