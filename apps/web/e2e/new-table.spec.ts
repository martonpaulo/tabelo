import { copy } from "@/ui/copy";
import { expect, test } from "./fixtures";

test("a new table confirms before clearing document content", async ({
	tabelo,
}) => {
	await tabelo.editCell(1, 1, "Keep me");
	await tabelo.runAppCommand("newTable");

	const dialog = tabelo.page.getByRole("dialog", {
		name: copy.newTable.title,
	});
	await expect(dialog).toContainText(copy.newTable.description);
	await expect(
		dialog.getByRole("button", { name: copy.actions.cancel }),
	).toHaveAttribute("data-variant", "ghost");
	await expect(
		dialog.getByRole("button", { name: copy.newTable.confirm }),
	).toHaveAttribute("data-variant", "destructive");
	await dialog.getByRole("button", { name: copy.actions.cancel }).click();
	await expect(tabelo.cell(1, 1)).toHaveText("Keep me");
	await expect(
		tabelo.page.getByRole("button", { name: copy.actions.openAppMenu }),
	).toBeFocused();

	await tabelo.runAppCommand("newTable");
	await dialog.getByRole("button", { name: copy.newTable.confirm }).click();
	await expect(tabelo.cell(1, 1)).toHaveText("");
	await expect(
		tabelo.page.getByRole("heading", { name: copy.empty.title }),
	).toHaveCount(0);
});

test("an unfinished source draft also requires confirmation", async ({
	tabelo,
}) => {
	await tabelo.source("markdown").fill("| unfinished |");
	await expect(tabelo.source("markdown")).toHaveAttribute(
		"aria-invalid",
		"true",
	);

	await tabelo.runAppCommand("newTable");
	await expect(
		tabelo.page.getByRole("dialog", { name: copy.newTable.title }),
	).toBeVisible();
});

test("an untouched empty table clears without an unnecessary dialog", async ({
	tabelo,
}) => {
	await tabelo.runAppCommand("newTable");
	await expect(
		tabelo.page.getByRole("dialog", { name: copy.newTable.title }),
	).toHaveCount(0);
});

test("an unknown path redirects to the only application route", async ({
	page,
}) => {
	await page.goto("/not-a-tabelo-route");
	await expect(
		page.getByRole("heading", { name: copy.empty.title }),
	).toBeVisible();
	await expect(page).toHaveURL(/\/$/);
});
