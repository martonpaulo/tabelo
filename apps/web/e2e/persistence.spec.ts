import { copy } from "@/copy/copy";
import { expect, test } from "./fixtures";

const validMarkdown = "| Name |\n| --- |\n| Inez |";
const invalidMarkdown = "| Name |\n| not a divider |\n| Inez |";

test("reload within debounce restores an invalid draft and its last valid table", async ({
	tabelo,
}) => {
	const source = tabelo.source("markdown");
	await source.fill(validMarkdown);
	await expect(tabelo.cell(1, 1)).toHaveText("Inez");
	await source.fill(invalidMarkdown);

	await tabelo.page.reload();

	await expect(tabelo.workspace).toBeVisible();
	await expect(tabelo.cell(1, 1)).toHaveText("Inez");
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
	).toMatchObject({ version: 4, draft: null });
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
