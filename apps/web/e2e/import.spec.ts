import { expect, test } from "./fixtures";

test("a malformed named file preserves the current table", async ({
	tabelo,
}) => {
	await tabelo.editCell(1, 1, "keep me");
	await tabelo.importFile(
		"broken.csv",
		'Name,Note\nInez,"unterminated',
		"text/csv",
	);

	await expect(tabelo.cell(1, 1)).toHaveText("keep me");
	await expect(tabelo.status).toHaveText(
		"This file is not valid CSV. The current table was not changed.",
	);
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
	await expect(tabelo.status).toHaveText(
		"This import has 501 rows, above Tabelo's supported limit of 500. The current table was not changed.",
	);
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
	await expect(tabelo.status).toHaveText(
		"This import has 501 rows, above Tabelo's supported limit of 500. The current table was not changed.",
	);
});

test("cancelling the file picker leaves the current table unchanged", async ({
	tabelo,
}) => {
	await tabelo.editCell(1, 1, "keep me");
	await tabelo.cancelFileImport();

	await expect(tabelo.cell(1, 1)).toHaveText("keep me");
});
