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

test("cancelling the file picker leaves the current table unchanged", async ({
	tabelo,
}) => {
	await tabelo.editCell(1, 1, "keep me");
	await tabelo.cancelFileImport();

	await expect(tabelo.cell(1, 1)).toHaveText("keep me");
});
