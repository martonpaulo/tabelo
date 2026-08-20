import type { Page } from "@playwright/test";
import { copy } from "@/copy/copy";
import {
	DEFAULT_PREFERENCES,
	PREFERENCES_STORAGE_KEY,
	type Preferences,
	type ThemePreference,
} from "@/preferences/contract";
import { expect, test } from "./fixtures";

const storedPreferences = (
	theme: ThemePreference,
	changes: Partial<Preferences> = {},
): Preferences => ({ ...DEFAULT_PREFERENCES, theme, ...changes });

async function seedPreferences(
	page: Page,
	theme: ThemePreference,
	changes: Partial<Preferences> = {},
) {
	await page.addInitScript(
		({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
		{
			key: PREFERENCES_STORAGE_KEY,
			value: storedPreferences(theme, changes),
		},
	);
}

async function dismissWelcome(page: Page) {
	const welcome = page.getByRole("region", { name: copy.empty.title });
	await welcome.waitFor({ state: "visible" });
	await welcome.getByRole("button", { name: copy.empty.emptyAction }).click();
}

async function openSettings(page: Page) {
	const trigger = page.getByRole("button", { name: copy.actions.openAppMenu });
	await trigger.click();
	const menu = page.getByRole("menu", { name: copy.actions.openAppMenu });
	await menu.getByRole("menuitem", { name: copy.settings.title }).click();
	await menu.waitFor({ state: "hidden" });
	const dialog = page.getByRole("dialog", { name: copy.settings.title });
	await dialog.waitFor({ state: "visible" });
	return { dialog, trigger };
}

async function renderedTheme(page: Page) {
	return page.locator("body").evaluate((body) => ({
		background: getComputedStyle(body).backgroundColor,
		attribute: document.documentElement.getAttribute("data-theme"),
		themeColor: document
			.querySelector("meta[data-tabelo-theme-color]")
			?.getAttribute("content"),
	}));
}

test("the pre-paint contract follows System and honors both explicit overrides", async ({
	browser,
}) => {
	const render = async (
		colorScheme: "light" | "dark",
		theme?: ThemePreference,
	) => {
		const context = await browser.newContext({
			colorScheme,
			serviceWorkers: "block",
		});
		const page = await context.newPage();
		if (theme) await seedPreferences(page, theme);
		await page.route(/\.js(?:\?|$)/, (route) => route.abort());
		await page.goto("/", { waitUntil: "domcontentloaded" });
		const result = await renderedTheme(page);
		await context.close();
		return result;
	};

	const systemLight = await render("light");
	const systemDark = await render("dark");
	const lightOnDark = await render("dark", "light");
	const darkOnLight = await render("light", "dark");

	expect(systemLight.attribute).toBeNull();
	expect(systemDark.attribute).toBeNull();
	expect(systemLight.background).not.toBe(systemDark.background);
	expect(systemLight.themeColor).not.toBe(systemDark.themeColor);
	expect(lightOnDark).toEqual({ ...systemLight, attribute: "light" });
	expect(darkOnLight).toEqual({ ...systemDark, attribute: "dark" });
});

test("System follows live media changes without creating an override", async ({
	page,
}) => {
	await page.emulateMedia({ colorScheme: "light" });
	await page.goto("/");
	await page.getByRole("heading", { name: copy.empty.title }).waitFor();
	const light = await renderedTheme(page);

	await page.emulateMedia({ colorScheme: "dark" });
	await expect
		.poll(async () => (await renderedTheme(page)).themeColor)
		.not.toBe(light.themeColor);
	const dark = await renderedTheme(page);

	expect(dark.background).not.toBe(light.background);
	expect(dark.attribute).toBeNull();
	expect(
		await page.evaluate(
			(key) => localStorage.getItem(key),
			PREFERENCES_STORAGE_KEY,
		),
	).toBeNull();
});

test("Settings previews a draft and Cancel or Escape restores the committed theme", async ({
	page,
}) => {
	await page.emulateMedia({ colorScheme: "light" });
	await page.goto("/");
	await dismissWelcome(page);
	const committed = await renderedTheme(page);
	const first = await openSettings(page);
	const themeGroup = first.dialog.getByRole("radiogroup", {
		name: copy.settings.theme.label,
	});

	const systemOption = themeGroup.getByRole("radio", {
		name: copy.settings.theme.options.system.label,
	});
	await expect(systemOption).toBeChecked();
	await systemOption.focus();
	await page.keyboard.press("ArrowRight");
	await page.keyboard.press("ArrowRight");
	await expect(
		themeGroup.getByRole("radio", {
			name: copy.settings.theme.options.dark.label,
		}),
	).toBeChecked();
	expect((await renderedTheme(page)).attribute).toBe("dark");
	expect(
		await page.evaluate(
			(key) => localStorage.getItem(key),
			PREFERENCES_STORAGE_KEY,
		),
	).toBeNull();

	await first.dialog.getByRole("button", { name: copy.actions.cancel }).click();
	await expect(first.dialog).toBeHidden();
	expect(await renderedTheme(page)).toEqual(committed);
	await expect(first.trigger).toBeFocused();

	const second = await openSettings(page);
	await second.dialog
		.getByRole("radio", { name: copy.settings.theme.options.dark.label })
		.click();
	await page.keyboard.press("Escape");
	await expect(second.dialog).toBeHidden();
	expect(await renderedTheme(page)).toEqual(committed);
	await expect(second.trigger).toBeFocused();
});

test("Apply writes the whole draft once and restores it before React on reload", async ({
	page,
}) => {
	await page.emulateMedia({ colorScheme: "dark" });
	await page.goto("/");
	await dismissWelcome(page);
	const { dialog, trigger } = await openSettings(page);

	await dialog
		.getByRole("radio", { name: copy.settings.theme.options.light.label })
		.click();
	await dialog
		.getByRole("checkbox", { name: copy.settings.tabIndicators.label })
		.uncheck();
	await dialog.getByRole("button", { name: copy.settings.apply }).click();
	await expect(dialog).toBeHidden();
	await expect(trigger).toBeFocused();

	expect(
		await page.evaluate(
			(key) => localStorage.getItem(key),
			PREFERENCES_STORAGE_KEY,
		),
	).toBe(JSON.stringify(storedPreferences("light", { tabIndicators: false })));
	expect((await renderedTheme(page)).attribute).toBe("light");

	await page.reload();
	await dismissWelcome(page);
	await page.getByRole("main", { name: copy.a11y.workspace }).waitFor();
	expect((await renderedTheme(page)).attribute).toBe("light");
	const reopened = await openSettings(page);
	await expect(
		reopened.dialog.getByRole("checkbox", {
			name: copy.settings.tabIndicators.label,
		}),
	).not.toBeChecked();
});

test("a refused preference write keeps the committed state and reports the failure", async ({
	page,
}) => {
	await page.emulateMedia({ colorScheme: "light" });
	await page.goto("/");
	await dismissWelcome(page);
	await page.evaluate(() => {
		Storage.prototype.setItem = () => {
			throw new DOMException("Storage is unavailable.", "SecurityError");
		};
	});
	const committed = await renderedTheme(page);
	const { dialog } = await openSettings(page);

	await dialog
		.getByRole("radio", { name: copy.settings.theme.options.dark.label })
		.click();
	await dialog.getByRole("button", { name: copy.settings.apply }).click();

	await expect(dialog).toBeVisible();
	await expect(dialog.getByRole("alert")).toBeVisible();
	expect(await renderedTheme(page)).toEqual(committed);
	await expect(
		dialog.getByRole("radio", {
			name: copy.settings.theme.options.system.label,
		}),
	).toBeChecked();
});

test("invalid preference storage falls back without invalidating the saved table", async ({
	page,
	tabelo,
}) => {
	await tabelo.editCell(1, 1, "Kept value");
	await expect
		.poll(() => page.evaluate(() => localStorage.getItem("tabelo.document")))
		.not.toBeNull();
	await page.evaluate(
		({ key }) => localStorage.setItem(key, "unsupported preferences"),
		{ key: PREFERENCES_STORAGE_KEY },
	);

	await page.reload();
	await tabelo.workspace.waitFor({ state: "visible" });
	await expect(tabelo.cell(1, 1)).toHaveText("Kept value");
	expect((await renderedTheme(page)).attribute).toBeNull();
});
