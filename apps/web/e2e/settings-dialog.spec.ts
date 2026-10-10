import type { Locator, Page } from "@playwright/test";
import { copy } from "@/copy/copy";
import { samplePerson } from "@/core/sample-data";
import { LIBRARY_KEY } from "@/persistence/schema";
import { expect, test } from "./fixtures";
import type { TabeloPage } from "./helpers";

// Settings as one modal flow: erasing everything is asked in a step that
// replaces Settings rather than stacking over it (#423).

const person = samplePerson(0);

async function openSettings(tabelo: TabeloPage): Promise<Locator> {
	const menu = await tabelo.openAppMenu();
	await menu.getByRole("menuitem", { name: copy.settings.title }).click();
	await menu.waitFor({ state: "hidden" });
	const dialog = tabelo.page.getByRole("dialog", { name: copy.settings.title });
	await dialog.waitFor({ state: "visible" });
	return dialog;
}

function eraseButton(settings: Locator): Locator {
	return settings.getByRole("button", { name: copy.eraseEverything.confirm });
}

function confirmation(page: Page): Locator {
	return page.getByRole("dialog", { name: copy.eraseEverything.title });
}

// Records the most dialogs that were ever in the document at once from here
// on, so a step that overlaps the next one for even a frame is caught, not
// only the state after the transitions settle.
async function watchDialogCount(page: Page): Promise<() => Promise<number>> {
	await page.evaluate(() => {
		const count = () => document.querySelectorAll('[role="dialog"]').length;
		const record = window as unknown as { __mostDialogs: number };
		record.__mostDialogs = count();
		new MutationObserver(() => {
			record.__mostDialogs = Math.max(record.__mostDialogs, count());
		}).observe(document.body, { childList: true, subtree: true });
	});
	return () =>
		page.evaluate(
			() => (window as unknown as { __mostDialogs: number }).__mostDialogs,
		);
}

async function storedLibrary(page: Page): Promise<string | null> {
	return page.evaluate((key) => localStorage.getItem(key), LIBRARY_KEY);
}

async function withSavedTable(tabelo: TabeloPage): Promise<void> {
	await tabelo.editCell(1, 1, person.name);
	await expect.poll(() => storedLibrary(tabelo.page)).not.toBeNull();
}

for (const viewport of [
	{ width: 320, height: 800 },
	{ width: 1280, height: 800 },
]) {
	test(`erasing replaces Settings with one confirmation step at ${viewport.width}px`, async ({
		page,
		tabelo,
	}) => {
		await page.setViewportSize(viewport);
		await withSavedTable(tabelo);
		const settings = await openSettings(tabelo);
		const mostDialogs = await watchDialogCount(page);

		await eraseButton(settings).click();
		await expect(confirmation(page)).toBeVisible();
		await expect(settings).toHaveCount(0);
		await expect(page.getByRole("dialog")).toHaveCount(1);
		expect(await mostDialogs()).toBe(1);

		// Focus moves into the active step and stays there. Polled, because
		// the primitive's focus guard holds focus for a moment at each end
		// before handing it back inside.
		const holdsFocus = () =>
			confirmation(page).evaluate((node) =>
				node.contains(document.activeElement),
			);
		for (let press = 0; press < 4; press += 1) {
			await expect.poll(holdsFocus).toBe(true);
			await page.keyboard.press("Tab");
		}
		await expect.poll(holdsFocus).toBe(true);
	});
}

test("Escape and Cancel return to Settings, onto the erase control, with nothing erased", async ({
	page,
	tabelo,
}) => {
	await withSavedTable(tabelo);
	const stored = await storedLibrary(page);
	let settings = await openSettings(tabelo);
	const mostDialogs = await watchDialogCount(page);

	for (const leave of ["Escape", "Cancel"] as const) {
		await eraseButton(settings).click();
		await expect(confirmation(page)).toBeVisible();
		if (leave === "Escape") await page.keyboard.press("Escape");
		else
			await confirmation(page)
				.getByRole("button", { name: copy.actions.cancel })
				.click();
		await expect(confirmation(page)).toHaveCount(0);
		settings = page.getByRole("dialog", { name: copy.settings.title });
		await expect(settings).toBeVisible();
		await expect(eraseButton(settings)).toBeFocused();
	}
	expect(await mostDialogs()).toBe(1);
	expect(await storedLibrary(page)).toBe(stored);
	await expect(tabelo.cell(1, 1)).toHaveText(person.name);

	// Leaving Settings still ends the flow where it began, and it opens again
	// as usual.
	await settings.getByRole("button", { name: copy.settings.done }).click();
	await expect(page.getByRole("dialog")).toHaveCount(0);
	await expect(
		page.getByRole("button", { name: copy.actions.openAppMenu }),
	).toBeFocused();
	settings = await openSettings(tabelo);
	await expect(eraseButton(settings)).not.toBeFocused();
});

test("confirming erases what Tabelo stored and starts as on a first visit", async ({
	page,
	tabelo,
}) => {
	await withSavedTable(tabelo);
	const settings = await openSettings(tabelo);
	await eraseButton(settings).click();
	await confirmation(page)
		.getByRole("button", { name: copy.eraseEverything.confirm })
		.click();

	await expect(tabelo.welcome).toBeVisible();
	expect((await storedLibrary(page)) ?? "").not.toContain(person.name);
});
