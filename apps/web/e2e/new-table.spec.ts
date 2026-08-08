import { copy } from "@/copy/copy";
import { expect, test } from "./fixtures";

test("a new table confirms before clearing document content", async ({
	tabelo,
}) => {
	await tabelo.editCell(1, 1, "Keep me");
	await tabelo.runAppCommand("newTable");

	const dialog = tabelo.page.getByRole("dialog", {
		name: copy.newTable.title,
	});
	await expect(dialog).toBeVisible();
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

	await tabelo.cell(1, 1).click();
	await tabelo.page.keyboard.press("Backspace");
	await expect(tabelo.cell(1, 1)).toHaveText("");
	await tabelo.runAppCommand("newTable");
	await expect(dialog).toBeVisible();
	await dialog.getByRole("button", { name: copy.actions.cancel }).click();

	await tabelo.runAppCommand("newTable");
	await dialog.getByRole("button", { name: copy.newTable.confirm }).click();
	const welcome = tabelo.page.getByRole("region", { name: copy.empty.title });
	await expect(welcome).toBeVisible();
	await expect(welcome).toBeFocused();
	await welcome.getByRole("button", { name: copy.empty.emptyAction }).click();
	await expect(tabelo.cell(1, 1)).toHaveText("");
});

test("restored content remains protected after it is emptied", async ({
	tabelo,
}) => {
	await tabelo.editCell(1, 1, "Saved");
	await tabelo.page.reload();
	await expect(tabelo.cell(1, 1)).toHaveText("Saved");

	await tabelo.cell(1, 1).click();
	await tabelo.page.keyboard.press("Backspace");
	await expect(tabelo.cell(1, 1)).toHaveText("");
	await tabelo.runAppCommand("newTable");

	await expect(
		tabelo.page.getByRole("dialog", { name: copy.newTable.title }),
	).toBeVisible();
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
	await tabelo.page
		.getByRole("dialog", { name: copy.newTable.title })
		.getByRole("button", { name: copy.newTable.confirm })
		.click();
	await expect(
		tabelo.page.getByRole("region", { name: copy.empty.title }),
	).toBeFocused();
});

test("an untouched empty table returns to onboarding without a dialog", async ({
	tabelo,
}) => {
	await tabelo.runAppCommand("newTable");
	await expect(
		tabelo.page.getByRole("dialog", { name: copy.newTable.title }),
	).toHaveCount(0);
	const welcome = tabelo.page.getByRole("region", { name: copy.empty.title });
	await expect(welcome).toBeFocused();
	await welcome.getByRole("button", { name: copy.empty.emptyAction }).click();
	await expect(welcome).toHaveCount(0);
	await expect(tabelo.cell(1, 1)).toBeVisible();
});

test("the New table welcome can start by trusted paste and file import", async ({
	page,
	tabelo,
}) => {
	await tabelo.runAppCommand("newTable");
	const welcome = page.getByRole("region", { name: copy.empty.title });
	await expect(welcome).toBeFocused();

	await page.evaluate(() => {
		const clipboardData = new DataTransfer();
		clipboardData.setData("text/plain", "Name\tRole\nIngrid\tDesigner");
		const event = new Event("paste", { bubbles: true, cancelable: true });
		Object.defineProperty(event, "clipboardData", { value: clipboardData });
		window.dispatchEvent(event);
	});
	await page
		.getByRole("dialog", { name: copy.headerImport.title })
		.getByRole("button", { name: copy.headerImport.asHeaders })
		.click();
	await expect(welcome).toHaveCount(0);
	await expect(tabelo.cell(1, 1)).toHaveText("Ingrid");

	await tabelo.runAppCommand("newTable");
	await page
		.getByRole("dialog", { name: copy.newTable.title })
		.getByRole("button", { name: copy.newTable.confirm })
		.click();
	await expect(welcome).toBeFocused();

	const chooserPromise = page.waitForEvent("filechooser");
	await welcome.getByRole("button", { name: copy.actions.importFile }).click();
	const chooser = await chooserPromise;
	await chooser.setFiles({
		name: "people.csv",
		mimeType: "text/csv",
		buffer: Buffer.from("Name,City\nPaulo,Madrid"),
	});
	await page
		.getByRole("dialog", { name: copy.headerImport.title })
		.getByRole("button", { name: copy.headerImport.asHeaders })
		.click();
	await expect(welcome).toHaveCount(0);
	await expect(tabelo.cell(1, 1)).toHaveText("Paulo");
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
