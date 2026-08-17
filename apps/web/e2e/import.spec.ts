import { IMPORT_LIMITS } from "@/import/prepare";
import { expect, test } from "./fixtures";

test("a malformed named file preserves the current table", async ({
	tabelo,
}) => {
	await tabelo.editCell(1, 1, "keep me");
	await tabelo.importFile(
		"broken.csv",
		'Name,Note\nIngrid,"unterminated',
		"text/csv",
	);

	await expect(tabelo.cell(1, 1)).toHaveText("keep me");
	// The refusal is reported as a failure. Its wording is editorial and is
	// deliberately not asserted here.
	await expect(tabelo.notice("error")).toBeVisible();
});

test("a typed JSON import preserves native scalars through an edit and projection", async ({
	tabelo,
}) => {
	await tabelo.importFile(
		"typed.json",
		'[{"qty":1,"ok":true,"note":null,"name":"x","code":"007"}]',
		"application/json",
	);

	await expect(tabelo.cell(1, 1)).toHaveText("1");
	await expect(tabelo.cell(1, 2)).toHaveText("true");
	await expect(tabelo.cell(1, 3)).toHaveText("");
	await expect(tabelo.cell(1, 5)).toHaveText("007");
	await tabelo.editCell(1, 4, "edited");
	await tabelo.choosePaneView("markdown", "json");

	const source = tabelo.source("json");
	await expect(source).toContainText('"qty":1');
	await expect(source).toContainText('"ok":true');
	await expect(source).toContainText('"note":null');
	await expect(source).toContainText('"name":"edited"');
	await expect(source).toContainText('"code":"007"');
});

test("a JSON file with nested cells preserves the current table", async ({
	tabelo,
}) => {
	await tabelo.editCell(1, 1, "keep me");
	await tabelo.importFile(
		"nested.json",
		'[{"person":{"name":"Ingrid"}}]',
		"application/json",
	);

	await expect(tabelo.cell(1, 1)).toHaveText("keep me");
	await expect(tabelo.notice("error")).toBeVisible();
});

test("an oversized paste is rejected without changing the table", async ({
	tabelo,
}) => {
	await tabelo.editCell(1, 1, "keep me");
	const oversized = Array.from({ length: 501 }, (_, index) => `${index}`).join(
		"\n",
	);
	await tabelo.paste(oversized);

	await expect(tabelo.cell(1, 1)).toHaveText("keep me");
	await expect(tabelo.notice("error")).toBeVisible();
});

test("an oversized named file uses the same rejection policy", async ({
	tabelo,
}) => {
	await tabelo.editCell(1, 1, "keep me");
	const oversized = Array.from(
		{ length: 501 },
		(_, index) => `${index},value`,
	).join("\n");
	await tabelo.importFile("oversized.csv", oversized, "text/csv");

	await expect(tabelo.cell(1, 1)).toHaveText("keep me");
	await expect(tabelo.notice("error")).toBeVisible();
});

test("an oversized file is rejected before its contents are read", async ({
	page,
	tabelo,
}) => {
	await page.addInitScript(() => {
		Object.defineProperty(window, "__fileTextReads", {
			value: 0,
			writable: true,
		});
		const original = File.prototype.text;
		File.prototype.text = function () {
			(window as unknown as { __fileTextReads: number }).__fileTextReads += 1;
			return original.call(this);
		};
	});
	await page.reload();
	await tabelo.dismissWelcome();
	await tabelo.editCell(1, 1, "keep me");

	await tabelo.importFile(
		"oversized.csv",
		"x".repeat(IMPORT_LIMITS.payloadBytes + 1),
		"text/csv",
	);

	await expect(tabelo.cell(1, 1)).toHaveText("keep me");
	await expect(tabelo.notice("error")).toBeVisible();
	expect(
		await page.evaluate(
			() => (window as unknown as { __fileTextReads: number }).__fileTextReads,
		),
	).toBe(0);
});

test("repeated paste is rejected when the resulting table exceeds the limit", async ({
	tabelo,
}) => {
	const atLimit = Array.from({ length: IMPORT_LIMITS.rows }, (_, index) =>
		String(index),
	).join("\n");
	await tabelo.paste(atLimit, undefined, false);
	await tabelo.cell(IMPORT_LIMITS.rows, 1).click();

	await tabelo.paste("keep\nrefuse");

	await expect(tabelo.cell(IMPORT_LIMITS.rows, 1)).toHaveText(
		String(IMPORT_LIMITS.rows - 1),
	);
	await expect(tabelo.notice("error")).toBeVisible();
	await expect(tabelo.cell(IMPORT_LIMITS.rows + 1, 1)).toHaveCount(0);
});

test("cancelling the file picker leaves the current table unchanged", async ({
	tabelo,
}) => {
	await tabelo.editCell(1, 1, "keep me");
	await tabelo.cancelFileImport();

	await expect(tabelo.cell(1, 1)).toHaveText("keep me");
});
