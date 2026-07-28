import { expect, test } from "./fixtures";

test("a new table confirms before clearing document content", async ({
	tabelo,
}) => {
	await tabelo.editCell(1, 1, "Keep me");
	await tabelo.runAppCommand("New table");

	const dialog = tabelo.page.getByRole("dialog", {
		name: "Start a new table?",
	});
	await expect(dialog).toContainText(
		"This clears the current table and any unfinished source edits.",
	);
	await dialog.getByRole("button", { name: "Cancel" }).click();
	await expect(tabelo.cell(1, 1)).toHaveText("Keep me");

	await tabelo.runAppCommand("New table");
	await dialog.getByRole("button", { name: "Start new table" }).click();
	await expect(tabelo.cell(1, 1)).toHaveText("");
});

test("an unfinished source draft also requires confirmation", async ({
	tabelo,
}) => {
	await tabelo.source("Markdown").fill("| unfinished |");
	await expect(tabelo.source("Markdown")).toHaveAttribute(
		"aria-invalid",
		"true",
	);

	await tabelo.runAppCommand("New table");
	await expect(
		tabelo.page.getByRole("dialog", { name: "Start a new table?" }),
	).toBeVisible();
});

test("an untouched empty table clears without an unnecessary dialog", async ({
	tabelo,
}) => {
	await tabelo.runAppCommand("New table");
	await expect(
		tabelo.page.getByRole("dialog", { name: "Start a new table?" }),
	).toHaveCount(0);
});

test("an unknown path redirects to the only application route", async ({
	page,
}) => {
	await page.goto("/not-a-tabelo-route");
	await expect(
		page.getByRole("heading", { name: "Start with a table" }),
	).toBeVisible();
	await expect(page).toHaveURL(/\/$/);
});
