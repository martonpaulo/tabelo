import { expect, test } from "./fixtures";

test("a numeric first row does not offer header correction", async ({
	tabelo,
}) => {
	await tabelo.paste("1\t2\n3\t4");

	await expect(tabelo.header(1)).toContainText("Column 1");
	await expect(tabelo.cell(1, 1)).toHaveText("1");
	await expect(
		tabelo.page.getByRole("button", { name: "Use it as data instead" }),
	).toHaveCount(0);
});

test("a later document edit invalidates header correction", async ({
	tabelo,
}) => {
	await tabelo.paste("Name\tRole\nInez\tDesigner");
	await expect(tabelo.status).toContainText("First row used as headers.");

	await tabelo.editCell(1, 1, "Mark");

	await expect(
		tabelo.page.getByRole("button", { name: "Use it as data instead" }),
	).toHaveCount(0);
});

test("numeric and blank named files do not offer correction", async ({
	tabelo,
}) => {
	await tabelo.importFile("numbers.csv", "1,2\n3,4", "text/csv");

	await expect(tabelo.header(1)).toContainText("Column 1");
	await expect(tabelo.cell(1, 1)).toHaveText("1");
	await expect(
		tabelo.page.getByRole("button", { name: "Use it as data instead" }),
	).toHaveCount(0);

	await tabelo.importFile("blank.csv", "Name,\nInez,Designer", "text/csv");

	await expect(tabelo.header(1)).toContainText("Column 1");
	await expect(tabelo.cell(1, 1)).toHaveText("Name");
	await expect(
		tabelo.page.getByRole("button", { name: "Use it as data instead" }),
	).toHaveCount(0);
});

test("a text-header file offers correction once and dismissal keeps data", async ({
	tabelo,
}) => {
	await tabelo.importFile("people.csv", "Name,Role\nInez,Designer", "text/csv");
	await expect(tabelo.status).toContainText("First row used as headers.");

	await tabelo.page.getByRole("button", { name: "Dismiss" }).click();

	await expect(
		tabelo.page.getByRole("button", { name: "Use it as data instead" }),
	).toHaveCount(0);
	await expect(tabelo.header(1)).toContainText("Name");
	await expect(tabelo.cell(1, 1)).toHaveText("Inez");
});

test("header correction and undo are atomic", async ({ tabelo }) => {
	await tabelo.paste("Name\tRole\nInez\tDesigner");
	await tabelo.page
		.getByRole("button", { name: "Use it as data instead" })
		.click();

	await expect(tabelo.header(1)).toContainText("Column 1");
	await expect(tabelo.cell(1, 1)).toHaveText("Name");

	await tabelo.runAppCommand("Undo");

	await expect(tabelo.header(1)).toContainText("Name");
	await expect(tabelo.cell(1, 1)).toHaveText("Inez");
	await expect(
		tabelo.page.getByRole("button", { name: "Use it as data instead" }),
	).toHaveCount(0);
});
