import { readFile } from "node:fs/promises";
import type { Locator } from "@playwright/test";
import { copy } from "@/copy/copy";
import { DEFAULT_TABLE_NAME } from "@/copy/product";
import { samplePerson } from "@/core/sample-data";
import { expect, test } from "./fixtures";
import type { TabeloPage } from "./helpers";

// A backup of the whole library, restored beside it (#430): restoring adds
// tables and never replaces one, so the original stays and the copy is
// numbered apart.

const person = samplePerson(0);

async function openSettings(tabelo: TabeloPage): Promise<Locator> {
	const menu = await tabelo.openAppMenu();
	await menu.getByRole("menuitem", { name: copy.settings.command }).click();
	await menu.waitFor({ state: "hidden" });
	const dialog = tabelo.page.getByRole("dialog", { name: copy.settings.title });
	await dialog.waitFor({ state: "visible" });
	return dialog;
}

test("a downloaded backup restores its tables beside the library", async ({
	page,
	tabelo,
}) => {
	await tabelo.editCell(1, 1, person.name);
	const settings = await openSettings(tabelo);

	const waiting = page.waitForEvent("download");
	await settings.getByRole("button", { name: copy.backup.download }).click();
	const download = await waiting;
	expect(download.suggestedFilename()).toMatch(/\.json$/);
	const text = await readFile(await download.path(), "utf8");

	const chooserPromise = page.waitForEvent("filechooser");
	await settings.getByRole("button", { name: copy.backup.restore }).click();
	const chooser = await chooserPromise;
	await chooser.setFiles({
		name: download.suggestedFilename(),
		mimeType: "application/json",
		buffer: Buffer.from(text),
	});
	// The restore lands when the second table's key is stored.
	await expect
		.poll(() =>
			page.evaluate(
				() =>
					Object.keys(localStorage).filter((key) =>
						key.startsWith("tabelo.table."),
					).length,
			),
		)
		.toBe(2);
	await page.keyboard.press("Escape");
	await settings.waitFor({ state: "hidden" });

	await page.reload();
	const menu = await tabelo.openAppMenu();
	await expect(
		menu.getByText(DEFAULT_TABLE_NAME, { exact: true }),
	).toBeVisible();
	await expect(
		menu.getByText(`${DEFAULT_TABLE_NAME} 2`, { exact: true }),
	).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(tabelo.cell(1, 1)).toHaveText(person.name);
});

test("a file that is not a backup restores nothing and says so", async ({
	page,
	tabelo,
}) => {
	const settings = await openSettings(tabelo);
	const chooserPromise = page.waitForEvent("filechooser");
	await settings.getByRole("button", { name: copy.backup.restore }).click();
	const chooser = await chooserPromise;
	await chooser.setFiles({
		name: "people.json",
		mimeType: "application/json",
		buffer: Buffer.from(JSON.stringify([{ name: person.name }])),
	});
	await expect(settings.getByRole("alert")).toBeVisible();
	await page.keyboard.press("Escape");

	const menu = await tabelo.openAppMenu();
	await expect(
		menu.getByText(`${DEFAULT_TABLE_NAME} 2`, { exact: true }),
	).toHaveCount(0);
});
