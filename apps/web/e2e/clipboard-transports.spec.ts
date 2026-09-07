import type { Page } from "@playwright/test";
import { copy } from "@/copy/copy";
import { expect, test } from "./fixtures";
import type { TabeloPage } from "./helpers";

// Tabelo copies and pastes from two independent transports: the keyboard's
// clipboard event, and a menu command through the asynchronous clipboard API.
// A user mixes them freely, so the private payload has to survive all four
// combinations, not just the two that pair a transport with itself.
//
// This is the one spec that uses the real clipboard rather than a synthetic
// DataTransfer or a recorded stub. That is the whole point: a stub carries
// whatever the test put in it, so it cannot see a transport that fails to
// carry something. Chromium keeps custom clipboard types written through
// `DataTransfer.setData` in a different store from "web "-prefixed types
// written through `ClipboardItem`, and #266 shipped a payload that crossed
// that boundary and lost every type on two of the four paths. See
// clipboard/payload.ts.
//
// Headless Chromium's clipboard is its own, isolated from the operating
// system's: running this does not touch the pasteboard of whoever runs it.

// Real writes and reads land in one clipboard shared by every test in this
// file, so they run in order rather than racing each other for it.
test.describe.configure({ mode: "serial" });
test.use({ permissions: ["clipboard-read", "clipboard-write"] });

const TYPED_ROWS =
	'[{"qty":1,"ok":true,"note":null,"code":"1"},{"qty":2,"ok":false,"note":"x","code":"2"}]';

async function importTypedRows(tabelo: TabeloPage): Promise<void> {
	await tabelo.importFile("typed.json", TYPED_ROWS, "application/json");
	await expect(tabelo.cell(1, 1)).toHaveAttribute("data-cell-type", "number");
}

async function selectSource(tabelo: TabeloPage): Promise<void> {
	await tabelo.cell(1, 1).click();
	await tabelo.cell(1, 3).click({ modifiers: ["Shift"] });
}

// The browser's own binding, not a synthetic event: what reaches the clipboard
// is what a real Mod+C reaches it with.
async function keyboardCopy(page: Page): Promise<void> {
	await page.keyboard.press("ControlOrMeta+C");
}

async function keyboardPaste(page: Page): Promise<void> {
	await page.keyboard.press("ControlOrMeta+V");
}

// The menu opens on a cell inside the range being acted on, because a right
// click outside one collapses the selection onto the cell it landed on. That is
// the product's behaviour and not something to work around: it just means the
// menu has to be opened where the command is meant to apply.
async function menuCopy(page: Page, tabelo: TabeloPage): Promise<void> {
	await tabelo.cell(1, 1).click({ button: "right" });
	await page.getByRole("menuitem", { name: copy.actions.copy }).click();
	await expect(
		tabelo.notice().filter({ hasText: copy.notices.copied("selection") }),
	).toBeVisible();
}

async function menuPaste(page: Page, tabelo: TabeloPage): Promise<void> {
	await tabelo.cell(2, 1).click({ button: "right" });
	await page.getByRole("menuitem", { name: copy.actions.paste }).click();
}

// The destination row starts out holding a number, a boolean and a string, so
// the types alone would pass without a paste ever happening. The values are
// what prove the paste landed, and the types are what prove the private payload
// crossed the two transports rather than arriving as TSV text.
async function expectTypedValuesArrived(tabelo: TabeloPage): Promise<void> {
	// The cell's own title carries the projected value. Its text node also
	// carries the type annotation a divergent cell draws, which is presentation
	// rather than the value being asserted here.
	await expect(tabelo.cell(2, 1)).toHaveAttribute("title", "1");
	await expect(tabelo.cell(2, 2)).toHaveAttribute("title", "true");
	// A null cell carries no title: there is no text to describe, which is the
	// distinction the private payload exists to preserve. Its type is the
	// assertion, and the destination held the string "x" before the paste.
	await expect(tabelo.cell(2, 1)).toHaveAttribute("data-cell-type", "number");
	await expect(tabelo.cell(2, 2)).toHaveAttribute("data-cell-type", "boolean");
	await expect(tabelo.cell(2, 3)).toHaveAttribute("data-cell-type", "null");
}

const combinations = [
	{ name: "keyboard to keyboard", copyVia: "keyboard", pasteVia: "keyboard" },
	{ name: "keyboard to menu", copyVia: "keyboard", pasteVia: "menu" },
	{ name: "menu to keyboard", copyVia: "menu", pasteVia: "keyboard" },
	{ name: "menu to menu", copyVia: "menu", pasteVia: "menu" },
] as const;

for (const { name, copyVia, pasteVia } of combinations) {
	test(`a value keeps its type from ${name}`, async ({ page, tabelo }) => {
		await importTypedRows(tabelo);
		await selectSource(tabelo);

		if (copyVia === "keyboard") await keyboardCopy(page);
		else await menuCopy(page, tabelo);

		await tabelo.cell(2, 1).click();
		if (pasteVia === "keyboard") await keyboardPaste(page);
		else await menuPaste(page, tabelo);

		await expectTypedValuesArrived(tabelo);
	});
}
