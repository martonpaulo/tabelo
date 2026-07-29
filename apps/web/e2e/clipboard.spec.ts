import type { Page } from "@playwright/test";
import { copy } from "@/ui/copy";
import { expect, test } from "./fixtures";

// A refused clipboard is the case that used to look like a broken button.
// Permission cannot be denied through Playwright, so the boundary itself is
// replaced before the app loads — which is exactly what the browser does when
// the user declines, when the context is restricted, or when the half of the
// API being called does not exist.

const readRecovery =
	"Clipboard access was blocked. Use ⌘V/Ctrl+V or allow clipboard access, then try again.";
const writeRecovery =
	"The selection could not be copied. Select it and use ⌘C/Ctrl+C.";

type ClipboardFault = "blocked" | "absent" | "empty";

async function faultyClipboard(
	page: Page,
	fault: ClipboardFault,
): Promise<void> {
	await page.addInitScript((mode: ClipboardFault) => {
		const refuse = () => {
			const error = new Error("denied");
			error.name = "NotAllowedError";
			return Promise.reject(error);
		};
		const value =
			mode === "absent"
				? undefined
				: mode === "empty"
					? {
							read: () => Promise.resolve([]),
							readText: () => Promise.resolve(""),
							write: () => Promise.resolve(),
							writeText: () => Promise.resolve(),
						}
					: {
							read: refuse,
							readText: refuse,
							write: refuse,
							writeText: refuse,
						};
		Object.defineProperty(navigator, "clipboard", {
			value,
			configurable: true,
		});
	}, fault);
}

async function openTableActions(page: Page): Promise<void> {
	await page.getByRole("button", { name: copy.actions.tableActions }).click();
}

test("a refused copy explains itself instead of doing nothing", async ({
	page,
	tabelo,
}) => {
	await faultyClipboard(page, "blocked");
	await page.reload();
	await tabelo.dismissWelcome();
	await expect(tabelo.workspace).toBeVisible();
	await tabelo.editCell(1, 1, "Inez");

	await openTableActions(page);
	await page.getByRole("menuitem", { name: copy.actions.copy }).click();

	await expect(tabelo.status.filter({ hasText: writeRecovery })).toBeVisible();
});

test("a refused cut keeps the data it could not copy", async ({
	page,
	tabelo,
}) => {
	await faultyClipboard(page, "blocked");
	await page.reload();
	await tabelo.dismissWelcome();
	await expect(tabelo.workspace).toBeVisible();
	await tabelo.editCell(1, 1, "Inez");

	await openTableActions(page);
	await page.getByRole("menuitem", { name: copy.actions.cut }).click();

	await expect(tabelo.status.filter({ hasText: writeRecovery })).toBeVisible();
	// The only copy of the value was in the table, and it is still there.
	await expect(tabelo.cell(1, 1)).toHaveText("Inez");
});

test("a refused paste explains itself and leaves the table alone", async ({
	page,
	tabelo,
}) => {
	await faultyClipboard(page, "blocked");
	await page.reload();
	await tabelo.dismissWelcome();
	await expect(tabelo.workspace).toBeVisible();
	await tabelo.editCell(1, 1, "Inez");

	await openTableActions(page);
	await page.getByRole("menuitem", { name: copy.actions.paste }).click();

	await expect(tabelo.status.filter({ hasText: readRecovery })).toBeVisible();
	await expect(tabelo.cell(1, 1)).toHaveText("Inez");
});

test("a browser without the clipboard API still explains the failure", async ({
	page,
	tabelo,
}) => {
	await faultyClipboard(page, "absent");
	await page.reload();
	await expect(page.locator("main")).toBeVisible();

	await page.getByRole("button", { name: copy.empty.pasteHint }).click();

	await expect(tabelo.status.filter({ hasText: readRecovery })).toBeVisible();
});

test("an empty clipboard says so rather than claiming it was blocked", async ({
	page,
	tabelo,
}) => {
	await faultyClipboard(page, "empty");
	await page.reload();
	await expect(page.locator("main")).toBeVisible();

	await page.getByRole("button", { name: copy.empty.pasteHint }).click();

	await expect(
		tabelo.status.filter({ hasText: "There is nothing on the clipboard" }),
	).toBeVisible();
	await expect(tabelo.status.filter({ hasText: readRecovery })).toHaveCount(0);
});

// The button path needs a permission the keyboard does not, so a blocked
// clipboard must not take the trusted paste event down with it.
test("keyboard paste still works while the clipboard API is refusing", async ({
	page,
	tabelo,
}) => {
	await faultyClipboard(page, "blocked");
	await page.reload();
	await tabelo.dismissWelcome();
	await expect(tabelo.workspace).toBeVisible();

	await tabelo.paste("Name\tRole\nInez\tDesigner");

	await expect(tabelo.cell(1, 1)).toHaveText("Inez");
	await expect(tabelo.cell(1, 2)).toHaveText("Designer");
});

// Granting the real permission is Chromium-only in Playwright, so success is
// verified against a clipboard that accepts everything and records it. That
// also pins the flavours: a paste into a spreadsheet needs the HTML one.
test("a granted copy confirms what it did and keeps the rich flavour", async ({
	page,
	tabelo,
}) => {
	await page.addInitScript(() => {
		const written: string[] = [];
		Object.defineProperty(window, "__written", {
			value: written,
			configurable: true,
		});
		Object.defineProperty(navigator, "clipboard", {
			value: {
				write: async (items: ClipboardItem[]) => {
					for (const item of items) written.push(...item.types);
				},
				writeText: async () => {
					written.push("text/plain");
				},
			},
			configurable: true,
		});
	});
	await page.reload();
	await tabelo.dismissWelcome();
	await expect(tabelo.workspace).toBeVisible();
	await tabelo.editCell(1, 1, "Inez");

	await openTableActions(page);
	await page.getByRole("menuitem", { name: copy.actions.copy }).click();

	await expect(
		tabelo.status.filter({ hasText: "Copied to the clipboard." }),
	).toBeVisible();
	expect(
		await page.evaluate(
			() => (window as unknown as { __written: string[] }).__written,
		),
	).toEqual(["text/plain", "text/html"]);
});
