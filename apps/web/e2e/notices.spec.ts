import type { Page } from "@playwright/test";
import { copy } from "@/copy/copy";
import { samplePeopleCsv } from "@/core/sample-data";
import { expect, test } from "./fixtures";
import { faultyClipboard, setClipboard, type TabeloPage } from "./helpers";

// The notice channel used to rank its five sources and render only the winner,
// in a fixed order that put every failure last. These tests hold that shut:
// nothing is suppressed, a failure looks like one, a recovery instruction does
// not expire, and the regions that announce all of it exist before they have
// anything to announce.

async function copyCell(page: Page): Promise<void> {
	await page.getByRole("gridcell").first().click({ button: "right" });
	await page.getByRole("menuitem", { name: copy.actions.copy }).click();
}

function refusedCopy(tabelo: TabeloPage) {
	return tabelo
		.notice("error")
		.filter({ hasText: copy.notices.clipboardWriteFailed("selection") });
}

test("both announcement regions exist before there is anything to announce", async ({
	tabelo,
}) => {
	await expect(tabelo.announcements).toHaveCount(1);
	await expect(tabelo.alerts).toHaveCount(1);
	await expect(tabelo.announcements).toHaveText("");
	await expect(tabelo.alerts).toHaveText("");
	await expect(tabelo.notices).toHaveCount(0);
});

test("a notice is written into the region that was already there", async ({
	page,
	tabelo,
}) => {
	await tabelo.editCell(1, 1, "Ingrid");
	await setClipboard(page, "granted");
	await copyCell(page);

	await expect(tabelo.announcements).not.toHaveText("");
	await expect(tabelo.alerts).toHaveText("");
});

test("a refused copy is not swallowed by the notice already on screen", async ({
	page,
	tabelo,
}) => {
	await faultyClipboard(page, "blocked");
	await page.reload();
	await tabelo.dismissWelcome();
	await tabelo.editCell(1, 1, "Ingrid");
	await setClipboard(page, "granted");
	await copyCell(page);
	await expect(tabelo.notice()).toHaveCount(1);

	await setClipboard(page, "blocked");
	await copyCell(page);

	// Both are on screen. The lower-ranked one used to be discarded outright.
	await expect(tabelo.notice()).toHaveCount(2);
	await expect(refusedCopy(tabelo)).toBeVisible();

	// A failure never wears the informational tone.
	await expect(tabelo.notice("info")).toHaveCount(1);
});

test("dismissing one notice leaves the others alone", async ({
	page,
	tabelo,
}) => {
	await faultyClipboard(page, "blocked");
	await page.reload();
	await tabelo.dismissWelcome();
	await tabelo.editCell(1, 1, "Ingrid");
	await setClipboard(page, "granted");
	await copyCell(page);
	await setClipboard(page, "blocked");
	await copyCell(page);
	await expect(tabelo.notice()).toHaveCount(2);

	await refusedCopy(tabelo)
		.getByRole("button", { name: copy.actions.dismiss })
		.click();

	await expect(tabelo.notice()).toHaveCount(1);
});

// The clock is the confirmation's own dismissal rather than a fixed wait: it
// starts first, so once it has gone the failure has outlived the window that
// used to take it away.
test("a confirmation clears itself and a failure does not", async ({
	page,
	tabelo,
}) => {
	await faultyClipboard(page, "blocked");
	await page.reload();
	await tabelo.dismissWelcome();
	await tabelo.editCell(1, 1, "Ingrid");

	await copyCell(page);
	await expect(refusedCopy(tabelo)).toBeVisible();

	await setClipboard(page, "granted");
	await copyCell(page);
	const confirmation = tabelo
		.notice("info")
		.filter({ hasText: copy.notices.copied("selection") });
	await expect(confirmation).toBeVisible();

	await expect(confirmation).toHaveCount(0, { timeout: 15_000 });
	await expect(refusedCopy(tabelo)).toBeVisible();
});

// A condition keeps its identifier while what it says changes (#449). The
// alert region used to keep reading the first refusal while the notice on
// screen showed the second. Compared region to notice, never to copy.
test("a refusal that replaces another is announced as the one on screen", async ({
	tabelo,
}) => {
	const refusal = tabelo.notice("error");
	const visibleText = async () =>
		(await refusal.innerText()).replace(/\s+/g, " ").trim();

	await tabelo.importFile("broken.csv", 'Name\n"unterminated', "text/csv");
	await expect(refusal).toHaveCount(1);
	const first = await visibleText();
	await expect(tabelo.alerts).toHaveText(first);

	await tabelo.importFile(
		"nested.json",
		'[{"person":{"name":"Ingrid"}}]',
		"application/json",
	);
	await expect(refusal).not.toHaveText(first);
	const second = await visibleText();
	await expect(refusal).toHaveCount(1);
	await expect(tabelo.alerts).toHaveText(second);
});

// An expiring notice counts down only while nobody is attending to it (#450).
// The browser clock is installed before the app loads and then jumped past
// each lifetime, so nothing here waits on wall time. Jumps are larger than
// the longest lifetime, 8s for a notice offering Undo.
const PAST_ANY_LIFETIME = 9_000;

async function withControlledClock(page: Page, tabelo: TabeloPage) {
	await page.clock.install();
	await page.reload();
	await tabelo.dismissWelcome();
}

// A whole-table command reports in the one notice that offers Undo.
async function transposeWithUndo(tabelo: TabeloPage) {
	await tabelo.paste(samplePeopleCsv(2).replaceAll(",", "\t"));
	await tabelo.dismissNotices();
	const menu = await tabelo.openTableOptions();
	await menu
		.getByRole("menuitem", { name: copy.actions.transposeTable })
		.click();
	await menu.waitFor({ state: "hidden" });
	const notice = tabelo.notice("info");
	const undo = notice.getByRole("button", { name: copy.actions.undo });
	await expect(undo).toBeVisible();
	return { notice, undo };
}

async function moveAway(page: Page) {
	await page.mouse.move(1, (page.viewportSize()?.height ?? 600) - 1);
}

test("keyboard focus on Undo holds the notice, which expires once focus leaves", async ({
	page,
	tabelo,
}) => {
	await withControlledClock(page, tabelo);
	const { notice, undo } = await transposeWithUndo(tabelo);
	await moveAway(page);

	await undo.focus();
	await page.clock.fastForward(PAST_ANY_LIFETIME);
	await expect(undo).toBeFocused();
	await expect(notice).toHaveCount(1);

	await tabelo.cell(1, 1).focus();
	// It resumes with the time it had left rather than vanishing at once.
	await expect(notice).toHaveCount(1);
	await page.clock.fastForward(PAST_ANY_LIFETIME);
	await expect(notice).toHaveCount(0);
});

test("choosing Undo from the keyboard leaves focus on the table, not the page", async ({
	page,
	tabelo,
}) => {
	await withControlledClock(page, tabelo);
	const { notice, undo } = await transposeWithUndo(tabelo);
	await tabelo.cell(1, 1).click();

	await undo.focus();
	await page.keyboard.press("Enter");

	await expect(notice).toHaveCount(0);
	await expect(tabelo.header(2)).toHaveText("city");
	await expect(tabelo.cell(1, 1)).toBeFocused();
});

test("dismissing a notice from the keyboard returns focus to where it came from", async ({
	page,
	tabelo,
}) => {
	await tabelo.editCell(1, 1, "Ingrid");
	await setClipboard(page, "granted");
	await copyCell(page);
	await tabelo.cell(1, 1).focus();

	const dismiss = tabelo
		.notice("info")
		.getByRole("button", { name: copy.actions.dismiss });
	await dismiss.focus();
	await page.keyboard.press("Enter");

	await expect(tabelo.notices).toHaveCount(0);
	await expect(tabelo.cell(1, 1)).toBeFocused();
});

test("a hovered confirmation stays, and expires after the pointer leaves", async ({
	page,
	tabelo,
}) => {
	await withControlledClock(page, tabelo);
	await tabelo.editCell(1, 1, "Ingrid");
	await setClipboard(page, "granted");
	await copyCell(page);
	const confirmation = tabelo.notice("info");
	await expect(confirmation).toHaveCount(1);

	await confirmation.hover();
	await page.clock.fastForward(PAST_ANY_LIFETIME);
	await expect(confirmation).toHaveCount(1);

	await moveAway(page);
	await expect(confirmation).toHaveCount(1);
	await page.clock.fastForward(PAST_ANY_LIFETIME);
	await expect(confirmation).toHaveCount(0);
});

test("a repeated confirmation that appears under the pointer stays", async ({
	page,
	tabelo,
}) => {
	await withControlledClock(page, tabelo);
	await tabelo.editCell(1, 1, "Ingrid");
	await setClipboard(page, "granted");
	await copyCell(page);
	const confirmation = tabelo.notice("info");
	await expect(confirmation).toHaveCount(1);
	const identity = confirmation.locator("[data-notice-id]");
	const first = await identity.getAttribute("data-notice-id");

	// The same copy again, from the keyboard, so the pointer never moves off
	// the notice it rests on.
	await confirmation.hover();
	await tabelo.cell(1, 1).focus();
	await page.keyboard.press("Shift+F10");
	await page.getByRole("menuitem", { name: copy.actions.copy }).focus();
	await page.keyboard.press("Enter");
	// The repeat replaced the notice rather than adding a second one.
	await expect(identity).not.toHaveAttribute("data-notice-id", first ?? "");
	await expect(confirmation).toHaveCount(1);

	await page.clock.fastForward(PAST_ANY_LIFETIME);
	await expect(confirmation).toHaveCount(1);
});

test("a document change withdraws Undo even while the notice is held", async ({
	page,
	tabelo,
}) => {
	await withControlledClock(page, tabelo);
	const { notice, undo } = await transposeWithUndo(tabelo);
	await tabelo.cell(1, 1).click();

	await notice.hover();
	await page.keyboard.type("Felix");
	await page.keyboard.press("Enter");

	await expect(undo).toHaveCount(0);
	await page.clock.fastForward(PAST_ANY_LIFETIME);
	await expect(notice).toHaveCount(1);

	// What remains is a plain confirmation and expires like one.
	await moveAway(page);
	await page.clock.fastForward(PAST_ANY_LIFETIME);
	await expect(notice).toHaveCount(0);
});

test("a confirmation waits while the page is out of sight", async ({
	page,
	tabelo,
}) => {
	await withControlledClock(page, tabelo);
	await tabelo.editCell(1, 1, "Ingrid");
	await setClipboard(page, "granted");
	await copyCell(page);
	const confirmation = tabelo.notice("info");
	await expect(confirmation).toHaveCount(1);
	await moveAway(page);

	// Headless Chromium always reports a visible, focused page, so the hidden
	// state is stated to the page the way the browser would announce it.
	const setVisibility = (state: "hidden" | "visible") =>
		page.evaluate((next) => {
			Object.defineProperty(document, "visibilityState", {
				configurable: true,
				get: () => next,
			});
			document.dispatchEvent(new Event("visibilitychange"));
		}, state);

	await setVisibility("hidden");
	await page.clock.fastForward(PAST_ANY_LIFETIME);
	await expect(confirmation).toHaveCount(1);

	await setVisibility("visible");
	await page.clock.fastForward(PAST_ANY_LIFETIME);
	await expect(confirmation).toHaveCount(0);
});

test("a confirmation waits while the window is not the one in use", async ({
	page,
	tabelo,
}) => {
	await withControlledClock(page, tabelo);
	await tabelo.editCell(1, 1, "Ingrid");
	await setClipboard(page, "granted");
	await copyCell(page);
	const confirmation = tabelo.notice("info");
	await expect(confirmation).toHaveCount(1);
	await moveAway(page);

	// Headless Chromium keeps every page focused, so leaving the window is
	// stated to the page the way the browser would report it.
	const setWindowFocus = (focused: boolean) =>
		page.evaluate((next) => {
			document.hasFocus = () => next;
			window.dispatchEvent(new Event(next ? "focus" : "blur"));
		}, focused);

	await setWindowFocus(false);
	await page.clock.fastForward(PAST_ANY_LIFETIME);
	await expect(confirmation).toHaveCount(1);

	await setWindowFocus(true);
	await page.clock.fastForward(PAST_ANY_LIFETIME);
	await expect(confirmation).toHaveCount(0);
});
