import type { Page } from "@playwright/test";
import { copy } from "@/copy/copy";
import { tableDocumentTitle } from "@/copy/product";
import { expect, test } from "./fixtures";
import {
	activeTableMenuItem,
	downloadConfirm,
	openDownloadChooser,
} from "./helpers";

// Rename sits on the row of the table it acts on and is named after it (owner,
// 2026-09-20), so reaching the active table's row is the first step of every
// test here.
function appMenu(page: Page) {
	return page.getByRole("menu", { name: copy.actions.openAppMenu });
}

async function openRenameItem(page: Page) {
	await page.getByRole("button", { name: copy.actions.openAppMenu }).click();
	const menu = appMenu(page);
	await menu.waitFor({ state: "visible" });
	return activeTableMenuItem(page, menu, () => copy.actions.renameTable);
}

async function openRenameDialog(page: Page) {
	const item = await openRenameItem(page);
	await item.click();
	await appMenu(page).waitFor({ state: "hidden" });
	return page.getByRole("dialog", { name: copy.actions.renameTable });
}

async function renameTable(page: Page, name: string): Promise<void> {
	const dialog = await openRenameDialog(page);
	await dialog.getByRole("textbox", { name: copy.tableName.label }).fill(name);
	await dialog.getByRole("button", { name: copy.tableName.confirm }).click();
	await dialog.waitFor({ state: "hidden" });
}

async function savedFilename(page: Page, formatName: string): Promise<string> {
	const waiting = page.waitForEvent("download");
	await openDownloadChooser(page);
	const dialog = page.getByRole("dialog", { name: copy.actions.downloadTable });
	await dialog.getByRole("radio", { name: formatName }).click();
	await downloadConfirm(page).click();
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

	await input.fill("😀".repeat(121));
	await dialog.getByRole("button", { name: copy.tableName.confirm }).click();
	await expect(dialog.getByRole("alert")).toBeVisible();

	await page.keyboard.press("Escape");
	await expect(dialog).toBeHidden();
	await expect(trigger).toBeFocused();
	await expect(page).toHaveTitle(tableDocumentTitle("Untitled table"));
});

// A form dialog opened from a menu owns focus on arrival: keystrokes, not a
// programmatic fill, must land in its field, from the pointer and the keyboard.
test("typing lands in the rename field as soon as the dialog opens", async ({
	page,
	tabelo,
}) => {
	await expect(tabelo.workspace).toBeVisible();

	let dialog = await openRenameDialog(page);
	let input = dialog.getByRole("textbox", { name: copy.tableName.label });
	await expect(input).toBeFocused();
	await page.keyboard.type("Pointer");
	await expect(input).toHaveValue("Pointer");
	await page.keyboard.press("Escape");
	await expect(dialog).toBeHidden();

	const trigger = page.getByRole("button", { name: copy.actions.openAppMenu });
	await trigger.focus();
	await page.keyboard.press("Enter");
	const menu = appMenu(page);
	await menu.waitFor({ state: "visible" });
	const item = await activeTableMenuItem(
		page,
		menu,
		() => copy.actions.renameTable,
	);
	await item.focus();
	await page.keyboard.press("Enter");
	dialog = page.getByRole("dialog", { name: copy.actions.renameTable });
	input = dialog.getByRole("textbox", { name: copy.tableName.label });
	await expect(input).toBeFocused();
	await page.keyboard.type("Typed");
	await expect(input).toHaveValue("Typed");
});
