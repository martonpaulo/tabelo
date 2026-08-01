import type { Page } from "@playwright/test";
import { copy } from "@/copy/copy";
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
	tabelo,
}) => {
	await tabelo.paste("Name\tRole\nInez\tDesigner");

	await expect(tabelo.announcements).not.toHaveText("");
	// The header guess is a suggestion, not an emergency: it must not interrupt.
	await expect(tabelo.alerts).toHaveText("");
});

test("a refused copy is not swallowed by the notice already on screen", async ({
	page,
	tabelo,
}) => {
	await faultyClipboard(page, "blocked");
	await page.reload();
	await tabelo.dismissWelcome();
	await tabelo.paste("Name\tRole\nInez\tDesigner");
	await expect(tabelo.notice()).toHaveCount(1);

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
	await tabelo.paste("Name\tRole\nInez\tDesigner");
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
	await tabelo.editCell(1, 1, "Inez");

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
