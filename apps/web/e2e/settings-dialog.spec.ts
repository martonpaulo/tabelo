import type { Locator, Page } from "@playwright/test";
import { copy } from "@/copy/copy";
import { samplePerson } from "@/core/sample-data";
import { LIBRARY_KEY } from "@/persistence/schema";
import { expect, test } from "./fixtures";
import type { TabeloPage } from "./helpers";

// Settings as one modal flow: erasing everything is asked in a step that
// replaces Settings rather than stacking over it (#423), and the preview at
// its top waits for its editor without moving the controls under it (#422).
//
// The service worker is blocked so that the preview's chunk request reaches
// the routes below rather than the worker's cache.
test.use({ serviceWorkers: "block" });

const person = samplePerson(0);

async function openSettings(tabelo: TabeloPage): Promise<Locator> {
	const menu = await tabelo.openAppMenu();
	await menu.getByRole("menuitem", { name: copy.settings.command }).click();
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

// #555: on a phone the settings come first. The irreversible control scrolls
// with them instead of staying pinned in view while they are cut off.
test("on a phone, erasing is reached by scrolling past the settings", async ({
	page,
	tabelo,
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	const settings = await openSettings(tabelo);
	const erase = eraseButton(settings);
	await expect(erase).not.toBeInViewport();

	const body = settings.locator('[data-slot="settings-body"]');
	await body.evaluate((node) => {
		node.scrollTop = node.scrollHeight;
	});
	await expect(erase).toBeInViewport();
});

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

const PREVIEW_CHUNK = /\/assets\/indicator-preview-[^/]+\.js$/;

// Holds the preview's chunk at the network until `release` is called.
async function holdPreviewChunk(page: Page): Promise<() => void> {
	let release = () => {};
	const released = new Promise<void>((resolve) => {
		release = resolve;
	});
	await page.route(PREVIEW_CHUNK, async (route) => {
		await released;
		await route.continue();
	});
	return release;
}

function previewEditor(settings: Locator): Locator {
	return settings.locator('[data-slot="indicator-preview"] .cm-line').first();
}

// Starts recording layout shifts of the dialog's content around the preview,
// as the browser's Layout Instability API reports them, and returns a reader.
// A shift is the browser's own measure of content moving under the reader;
// the assertion is that none happened, not that a box has a given size. The
// preview's own editor is left out: its line numbers settle inside the box
// on its first measurement, which moves nothing around it.
async function watchDialogShifts(page: Page): Promise<() => Promise<number>> {
	await page.evaluate(() => {
		const record = window as unknown as { __dialogShifts: number };
		record.__dialogShifts = 0;
		new PerformanceObserver((list) => {
			for (const entry of list.getEntries() as unknown as {
				sources?: { node?: Node | null }[];
			}[]) {
				const moved = (entry.sources ?? []).some((source) => {
					const element =
						source.node instanceof Element
							? source.node
							: (source.node?.parentElement ?? null);
					return (
						element?.closest('[role="dialog"]') &&
						!element.closest('[data-slot="indicator-preview"]')
					);
				});
				if (moved) record.__dialogShifts += 1;
			}
		}).observe({ type: "layout-shift" });
	});
	return async () => {
		// Two frames, so a shift caused by the last render has been reported.
		await page.evaluate(
			() =>
				new Promise((resolve) =>
					requestAnimationFrame(() => requestAnimationFrame(resolve)),
				),
		);
		return page.evaluate(
			() => (window as unknown as { __dialogShifts: number }).__dialogShifts,
		);
	};
}

for (const { name, viewport, reducedMotion } of [
	{ name: "a narrow window", viewport: { width: 375, height: 800 } },
	{ name: "a wide window", viewport: { width: 1280, height: 800 } },
	{
		name: "a narrow window with reduced motion",
		viewport: { width: 375, height: 800 },
		reducedMotion: true,
	},
]) {
	test(`the preview loads in its own place without moving the settings, in ${name}`, async ({
		page,
		tabelo,
	}) => {
		await page.setViewportSize(viewport);
		if (reducedMotion) await page.emulateMedia({ reducedMotion: "reduce" });
		const release = await holdPreviewChunk(page);
		const settings = await openSettings(tabelo);

		// Waiting says so in words, and the settings already work.
		await expect(settings.getByRole("status")).toBeVisible();
		const wrap = settings.getByRole("switch", {
			name: copy.settings.wrap.label,
		});
		await wrap.check();
		await expect(wrap).toBeChecked();
		await wrap.uncheck();

		const shifts = await watchDialogShifts(page);
		release();
		await expect(previewEditor(settings)).toBeVisible();
		await expect(settings.getByRole("status")).toHaveCount(0);
		expect(await shifts()).toBe(0);

		// A warm reopen has nothing to wait for.
		await settings.getByRole("button", { name: copy.settings.done }).click();
		await expect(settings).toHaveCount(0);
		const reopened = await openSettings(tabelo);
		await expect(previewEditor(reopened)).toBeVisible();
		await expect(reopened.getByRole("status")).toHaveCount(0);
	});
}

test("with lines wrapped, the preview still loads without moving the settings", async ({
	page,
	tabelo,
}) => {
	await page.setViewportSize({ width: 320, height: 800 });
	await withSavedTable(tabelo);
	let settings = await openSettings(tabelo);
	await settings
		.getByRole("switch", { name: copy.settings.wrap.label })
		.check();
	await settings.getByRole("button", { name: copy.settings.done }).click();
	await expect(settings).toHaveCount(0);

	// A fresh page, so the preview's code has to arrive again.
	await page.reload();
	await expect(tabelo.cell(1, 1)).toHaveText(person.name);
	const release = await holdPreviewChunk(page);
	settings = await openSettings(tabelo);
	await expect(settings.getByRole("status")).toBeVisible();
	const shifts = await watchDialogShifts(page);
	release();
	await expect(previewEditor(settings)).toBeVisible();
	expect(await shifts()).toBe(0);
});

// The preview keeps its box and scrolls inside it when wrapped lines need
// more rows (#559), from the wheel and from the keyboard.
test("with lines wrapped on a narrow window, the preview scrolls inside its box", async ({
	page,
	tabelo,
}) => {
	await page.setViewportSize({ width: 320, height: 800 });
	const settings = await openSettings(tabelo);
	await settings
		.getByRole("switch", { name: copy.settings.wrap.label })
		.check();
	await expect(previewEditor(settings)).toBeVisible();

	const scroller = settings.locator(
		'[data-slot="indicator-preview"] .cm-scroller',
	);
	const scrollTop = () => scroller.evaluate((node) => node.scrollTop);
	expect(
		await scroller.evaluate((node) => node.scrollHeight > node.clientHeight),
	).toBe(true);
	await scroller.hover();
	await page.mouse.wheel(0, 200);
	await expect.poll(scrollTop).toBeGreaterThan(0);

	await scroller.evaluate((node) => {
		node.scrollTop = 0;
	});
	await settings.getByRole("textbox", { name: copy.settings.preview }).focus();
	await page.keyboard.press("PageDown");
	await expect.poll(scrollTop).toBeGreaterThan(0);
});

test("a preview that cannot load leaves the dialog working", async ({
	page,
	tabelo,
}) => {
	await page.route(PREVIEW_CHUNK, (route) =>
		route.abort("internetdisconnected"),
	);
	const settings = await openSettings(tabelo);

	await expect(settings.getByRole("status")).toBeVisible();
	await expect(previewEditor(settings)).toHaveCount(0);
	const wrap = settings.getByRole("switch", { name: copy.settings.wrap.label });
	await wrap.check();
	await expect(wrap).toBeChecked();
	await settings.getByRole("button", { name: copy.settings.done }).click();
	await expect(page.getByRole("dialog")).toHaveCount(0);
});

// Settings' defaults and a pane's Display overrides read one ordered list
// (#426): the settings a pane offers appear in the order Settings shows them.
async function settingOrder(controls: Locator): Promise<string[]> {
	return controls.evaluateAll((elements) =>
		elements.map((element) => {
			const ids = element.getAttribute("aria-labelledby");
			if (ids) {
				return ids
					.split(" ")
					.map((id) => document.getElementById(id)?.textContent ?? "")
					.join(" ")
					.trim();
			}
			return (
				element.getAttribute("aria-label") ??
				element.closest("label")?.textContent ??
				""
			).trim();
		}),
	);
}

test("a Markdown pane's Display lists its settings in Settings' order", async ({
	tabelo,
}) => {
	await tabelo.editCell(1, 1, person.name);
	const paneMenu = await tabelo.openPaneMenu("markdown");
	await paneMenu
		.getByRole("menuitem", { name: copy.paneDisplay.command })
		.click();
	const display = tabelo.page.getByRole("dialog", {
		name: copy.paneDisplay.title,
	});
	await display.waitFor({ state: "visible" });
	const paneOrder = await settingOrder(display.getByRole("radiogroup"));
	await tabelo.page.keyboard.press("Escape");
	await expect(display).toBeHidden();

	const settings = await openSettings(tabelo);
	const section = settings.getByRole("region", {
		name: copy.settings.display.label,
	});
	// Where each of the pane's settings sits among Settings' display controls.
	const positions: number[] = [];
	for (const name of paneOrder) {
		const control = section
			.getByRole("switch", { name, exact: false })
			.or(section.getByRole("radiogroup", { name, exact: true }))
			.first();
		positions.push(
			await control.evaluate((element) =>
				[
					...(element
						.closest("section")
						?.querySelectorAll('[role="switch"], [role="radiogroup"]') ?? []),
				].indexOf(element),
			),
		);
	}

	expect(paneOrder.length).toBeGreaterThan(1);
	expect(positions.every((position) => position >= 0)).toBe(true);
	expect(positions).toEqual([...positions].sort((a, b) => a - b));
});
