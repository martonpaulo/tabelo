import type { Page } from "@playwright/test";
import { copy } from "@/copy/copy";
import { tableDocumentTitle } from "@/copy/product";
import { expect, test } from "./fixtures";

async function openRenameDialog(page: Page) {
	await page.getByRole("button", { name: copy.actions.openAppMenu }).click();
	const menu = page.getByRole("menu", { name: copy.actions.openAppMenu });
	await menu.getByRole("menuitem", { name: copy.actions.renameTable }).click();
	await menu.waitFor({ state: "hidden" });
	return page.getByRole("dialog", { name: copy.tableName.dialogTitle });
}

async function renameTable(page: Page, name: string): Promise<void> {
	const dialog = await openRenameDialog(page);
	await dialog.getByRole("textbox", { name: copy.tableName.label }).fill(name);
	await dialog.getByRole("button", { name: copy.tableName.confirm }).click();
	await dialog.waitFor({ state: "hidden" });
}

async function savedFilename(page: Page, formatName: string): Promise<string> {
	const waiting = page.waitForEvent("download");
	await page.getByRole("button", { name: copy.actions.openAppMenu }).click();
	await page
		.getByRole("menuitem", { name: copy.actions.downloadTable })
		.click();
	const dialog = page.getByRole("dialog", { name: copy.download.title });
	await dialog.getByRole("radio", { name: formatName }).click();
	await dialog
		.getByRole("button", { name: copy.actions.download, exact: true })
		.click();
	const download = await waiting;
	const filename = download.suggestedFilename();
	await download.path();
	return filename;
}

test("rename persists, updates the tab, and stays outside document history", async ({
	page,
	tabelo,
}) => {
	await tabelo.editCell(1, 1, "Kept");
	await renameTable(page, "  Résumé & roadmap  ");
	await expect(page).toHaveTitle(tableDocumentTitle("Résumé & roadmap"));

	const menu = await tabelo.openAppMenu();
	await expect(
		menu.getByText("Résumé & roadmap", { exact: true }),
	).toBeVisible();
	await page.keyboard.press("Escape");
	await tabelo.runAppCommand("undo");
	await expect(tabelo.cell(1, 1)).toHaveText("");
	const afterUndo = await tabelo.openAppMenu();
	await expect(
		afterUndo.getByText("Résumé & roadmap", { exact: true }),
	).toBeVisible();
	await page.keyboard.press("Escape");
	await tabelo.runAppCommand("redo");
	await expect(tabelo.cell(1, 1)).toHaveText("Kept");

	expect(await savedFilename(page, copy.views.csv.label)).toBe(
		"resume-roadmap.csv",
	);
	expect(await savedFilename(page, copy.views.markdown.label)).toBe(
		"resume-roadmap.md",
	);

	await page.reload();
	await tabelo.workspace.waitFor({ state: "visible" });
	await expect(page).toHaveTitle(tableDocumentTitle("Résumé & roadmap"));
	const restoredMenu = await tabelo.openAppMenu();
	await expect(
		restoredMenu.getByText("Résumé & roadmap", { exact: true }),
	).toBeVisible();
});

test("rename validates input and Escape restores trigger focus", async ({
	page,
	tabelo,
}) => {
	await expect(tabelo.workspace).toBeVisible();
	const trigger = page.getByRole("button", { name: copy.actions.openAppMenu });
	const dialog = await openRenameDialog(page);
	const input = dialog.getByRole("textbox", { name: copy.tableName.label });

	await input.fill("   ");
	await dialog.getByRole("button", { name: copy.tableName.confirm }).click();
	await expect(dialog).toBeVisible();
	await expect(input).toHaveAttribute("aria-invalid", "true");

	await input.fill("😀".repeat(121));
	await dialog.getByRole("button", { name: copy.tableName.confirm }).click();
	await expect(dialog.getByRole("alert")).toBeVisible();

	await page.keyboard.press("Escape");
	await expect(dialog).toBeHidden();
	await expect(trigger).toBeFocused();
	await expect(page).toHaveTitle(tableDocumentTitle("Untitled table"));
});
