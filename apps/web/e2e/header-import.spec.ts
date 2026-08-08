import { copy } from "@/copy/copy";
import { expect, test } from "./fixtures";

function headerDialog(page: import("@playwright/test").Page) {
	return page.getByRole("dialog", { name: copy.headerImport.title });
}

test("a delimited paste asks before creating the document", async ({
	page,
	tabelo,
}) => {
	await tabelo.paste("Name\tRole\nIngrid\tDesigner", undefined, null);

	const dialog = headerDialog(page);
	await expect(dialog).toBeVisible();

	await dialog
		.getByRole("button", { name: copy.headerImport.asHeaders })
		.click();

	await expect(dialog).toHaveCount(0);
	await expect(tabelo.header(1)).toHaveText("Name");
	await expect(tabelo.cell(1, 1)).toHaveText("Ingrid");
});

test("keeping row 1 as data creates empty headers and one undo step", async ({
	page,
	tabelo,
}) => {
	await tabelo.paste("1\t2\n3\t4", undefined, null);
	await headerDialog(page)
		.getByRole("button", { name: copy.headerImport.asData })
		.click();

	await expect(tabelo.header(1)).toHaveText("");
	await expect(tabelo.cell(1, 1)).toHaveText("1");

	await tabelo.runAppCommand("undo");
	await expect(tabelo.header(1)).toHaveText("");
	await expect(tabelo.cell(1, 1)).toHaveText("");
});

test("cancelling a replacement import preserves content and focus", async ({
	page,
	tabelo,
}) => {
	await tabelo.editCell(1, 1, "keep me");
	await tabelo.importFile(
		"people.csv",
		"Name,Role\nIngrid,Designer",
		"text/csv",
	);

	const dialog = headerDialog(page);
	await expect(dialog).toBeVisible();
	await dialog.getByRole("button", { name: copy.actions.cancel }).click();

	await expect(dialog).toHaveCount(0);
	await expect(tabelo.cell(1, 1)).toHaveText("keep me");
	await expect(
		page.getByRole("button", { name: copy.actions.openAppMenu }),
	).toBeFocused();
});

test("TSV and plain text replacement files also ask", async ({
	page,
	tabelo,
}) => {
	await tabelo.editCell(1, 1, "keep me");

	for (const [name, text, mimeType] of [
		["people.tsv", "Name\tRole\nIngrid\tDesigner", "text/tab-separated-values"],
		["people.txt", "Ingrid\nPaulo", "text/plain"],
	] as const) {
		await tabelo.importFile(name, text, mimeType);
		const dialog = headerDialog(page);
		await expect(dialog).toBeVisible();
		await dialog.getByRole("button", { name: copy.actions.cancel }).click();
		await expect(tabelo.cell(1, 1)).toHaveText("keep me");
	}
});

test("declared-header formats import without asking", async ({
	page,
	tabelo,
}) => {
	const cases = [
		[
			"table.md",
			"| Name | Role |\n| --- | --- |\n| Ingrid | Designer |",
			"text/markdown",
		],
		["table.jira.txt", "||Name||Role||\n|Ingrid|Designer|", "text/plain"],
		[
			"table.html",
			"<table><tr><th>Name</th><th>Role</th></tr><tr><td>Ingrid</td><td>Designer</td></tr></table>",
			"text/html",
		],
		["table.json", '[{"Name":"Ingrid","Role":"Designer"}]', "application/json"],
		["table.records.txt", "Name: Ingrid\n- Role: Designer", "text/plain"],
	] as const;

	for (const [name, text, mimeType] of cases) {
		await tabelo.importFile(name, text, mimeType);
		await expect(headerDialog(page)).toHaveCount(0);
		await expect(tabelo.header(1)).toHaveText("Name");
	}
});

test("an HTML data row creates empty headers without asking", async ({
	page,
	tabelo,
}) => {
	await tabelo.importFile(
		"table.html",
		"<table><tr><td>Ingrid</td><td>Designer</td></tr></table>",
		"text/html",
	);

	await expect(headerDialog(page)).toHaveCount(0);
	await expect(tabelo.header(1)).toHaveText("");
	await expect(tabelo.cell(1, 1)).toHaveText("Ingrid");
});

test("a Markdown paste uses its divider row without asking", async ({
	page,
	tabelo,
}) => {
	await tabelo.paste("| Name | Role |\n| --- | --- |\n| Ingrid | Designer |");

	await expect(headerDialog(page)).toHaveCount(0);
	await expect(tabelo.header(1)).toHaveText("Name");
	await expect(tabelo.cell(1, 1)).toHaveText("Ingrid");
});

test("the trusted welcome paste keeps its payload through the question", async ({
	page,
	tabelo,
}) => {
	await tabelo.runAppCommand("newTable");
	const welcome = page.getByRole("region", { name: copy.empty.title });
	await expect(welcome).toBeVisible();

	await page.evaluate(() => {
		const data = new DataTransfer();
		data.setData("text/plain", "Name\tRole\nIngrid\tDesigner");
		const event = new Event("paste", { bubbles: true, cancelable: true });
		Object.defineProperty(event, "clipboardData", { value: data });
		window.dispatchEvent(event);
	});

	const dialog = headerDialog(page);
	await expect(dialog).toBeVisible();
	await dialog
		.getByRole("button", { name: copy.headerImport.asHeaders })
		.click();

	await expect(welcome).toHaveCount(0);
	await expect(tabelo.header(1)).toHaveText("Name");
	await expect(tabelo.cell(1, 1)).toHaveText("Ingrid");
});

test("paste into an existing selection never asks a document question", async ({
	page,
	tabelo,
}) => {
	await tabelo.editCell(1, 1, "existing");
	await tabelo.cell(1, 1).click();

	await tabelo.paste("Name\tRole\nIngrid\tDesigner");

	await expect(headerDialog(page)).toHaveCount(0);
	await expect(tabelo.cell(1, 1)).toHaveText("Name");
});
