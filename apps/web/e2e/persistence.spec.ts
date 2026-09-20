import { readFileSync } from "node:fs";
import { copy } from "@/copy/copy";
import { CURRENT_VERSION } from "@/persistence/schema";
import {
	DEFAULT_PREFERENCES,
	PREFERENCES_RECOVERY_KEY,
	PREFERENCES_STORAGE_KEY,
	PREFERENCES_VERSION,
} from "@/preferences/contract";
import { expect, test } from "./fixtures";

const validMarkdown = "| Name |\n| --- |\n| Ingrid |";
const invalidMarkdown = "| Name |\n| not a divider |\n| Ingrid |";

test("reload within debounce restores an invalid draft and its last valid table", async ({
	tabelo,
}) => {
	const source = tabelo.source("markdown");
	await source.fill(validMarkdown);
	await expect(tabelo.cell(1, 1)).toHaveText("Ingrid");
	await source.fill(invalidMarkdown);

	await tabelo.page.reload();

	await expect(tabelo.workspace).toBeVisible();
	await expect(tabelo.cell(1, 1)).toHaveText("Ingrid");
	await expect(
		tabelo.pane("markdown").locator(".cm-diagnosticError"),
	).toHaveCount(1);
	await expect
		.poll(() =>
			tabelo
				.source("markdown")
				.evaluate((element) =>
					Array.from(
						element.querySelectorAll(".cm-line"),
						(line) => line.textContent ?? "",
					).join("\n"),
				),
		)
		.toBe(invalidMarkdown);
});

test("unreadable storage stays byte-exact until explicit replacement", async ({
	tabelo,
}) => {
	const raw = "{invalid json\nwith exact bytes\t\u0000";
	await tabelo.page.addInitScript((value) => {
		window.localStorage.setItem("tabelo.document", value);
	}, raw);

	await tabelo.page.reload();

	await expect(tabelo.notice()).toBeVisible();
	expect(
		await tabelo.page.evaluate(() =>
			window.localStorage.getItem("tabelo.document"),
		),
	).toBe(raw);

	await tabelo.page
		.getByRole("button", { name: copy.notices.replaceSavedData })
		.click();

	await expect(tabelo.notice()).toBeVisible();
	expect(
		await tabelo.page.evaluate(() =>
			window.localStorage.getItem("tabelo.document.recovery"),
		),
	).toBe(raw);
	expect(
		await tabelo.page.evaluate(() =>
			JSON.parse(window.localStorage.getItem("tabelo.document") ?? "null"),
		),
	).toMatchObject({ version: CURRENT_VERSION, draft: null });
});

// #32: a table saved by a newer Tabelo is not damaged, and the notice has to
// say which of the two it is. The recovery file is the saved bytes as found.
test("a table from a newer version is named as such and downloads as found", async ({
	tabelo,
}) => {
	const raw = JSON.stringify({ version: CURRENT_VERSION + 1, future: "shape" });
	await tabelo.page.addInitScript((value) => {
		window.localStorage.setItem("tabelo.document", value);
	}, raw);
	await tabelo.page.reload();
	await expect(tabelo.notice()).toBeVisible();
	const newer = await tabelo.notice().textContent();

	const waiting = tabelo.page.waitForEvent("download");
	await tabelo.page
		.getByRole("button", { name: copy.notices.downloadOriginal })
		.click();
	const download = await waiting;
	expect(download.suggestedFilename()).toMatch(/\.json$/);
	const path = await download.path();
	expect(readFileSync(path, "utf8")).toBe(raw);

	// The same notice for damaged bytes reads differently.
	await tabelo.page.addInitScript(() => {
		window.localStorage.setItem("tabelo.document", "{damaged");
	});
	await tabelo.page.reload();
	await expect(tabelo.notice()).toBeVisible();
	expect(await tabelo.notice().textContent()).not.toBe(newer);
});

test("quota notice clears after a later successful write", async ({
	tabelo,
}) => {
	await tabelo.page.evaluate(() => {
		const original = Storage.prototype.setItem;
		const target = window as typeof window & {
			restoreTabeloStorage?: () => void;
		};
		target.restoreTabeloStorage = () => {
			Storage.prototype.setItem = original;
		};
		Storage.prototype.setItem = function (key, value) {
			if (key === "tabelo.document") {
				throw new DOMException("full", "QuotaExceededError");
			}
			return original.call(this, key, value);
		};
	});

	await tabelo.editCell(1, 1, "First");
	await expect(tabelo.notice()).toBeVisible();

	await tabelo.page.evaluate(() => {
		const target = window as typeof window & {
			restoreTabeloStorage?: () => void;
		};
		target.restoreTabeloStorage?.();
	});
	await tabelo.editCell(1, 2, "Second");

	await expect(tabelo.notice()).toHaveCount(0);
});

// The Settings payload follows the table's contract: a newer or damaged
// payload is kept byte-exact and reported, never replaced by the defaults the
// app runs on meanwhile, and only the explicit replacement overwrites it, after
// copying it to its recovery key.
test("unreadable settings stay byte-exact until explicit replacement", async ({
	tabelo,
}) => {
	const raw = JSON.stringify({
		...DEFAULT_PREFERENCES,
		version: PREFERENCES_VERSION + 1,
	});
	await tabelo.page.addInitScript(
		({ key, value }) => {
			window.localStorage.setItem(key, value);
		},
		{ key: PREFERENCES_STORAGE_KEY, value: raw },
	);
	await tabelo.page.reload();
	const stored = (key: string) =>
		tabelo.page.evaluate((name) => window.localStorage.getItem(name), key);

	await expect(tabelo.notice("warning")).toBeVisible();
	expect(await stored(PREFERENCES_STORAGE_KEY)).toBe(raw);

	await tabelo.page
		.getByRole("button", { name: copy.notices.replaceSavedSettings })
		.click();

	await expect(tabelo.notice("warning")).toHaveCount(0);
	expect(await stored(PREFERENCES_RECOVERY_KEY)).toBe(raw);
	expect(JSON.parse((await stored(PREFERENCES_STORAGE_KEY)) ?? "null")).toEqual(
		DEFAULT_PREFERENCES,
	);
});
