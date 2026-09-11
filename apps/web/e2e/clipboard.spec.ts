import type { Locator, Page } from "@playwright/test";
import { copy } from "@/copy/copy";
import { expect, test } from "./fixtures";
import { faultyClipboard, type TabeloPage } from "./helpers";

// A refused clipboard is the case that used to look like a broken button.
// Permission cannot be denied through Playwright, so the boundary itself is
// replaced before the app loads. This is exactly what the browser does when
// the user declines, when the context is restricted, or when the half of the
// API being called does not exist.

const readRecovery = copy.notices.clipboardReadFailed;
const writeRecovery = copy.notices.clipboardWriteFailed("selection");

async function openTableActions(page: Page): Promise<void> {
	await page.getByRole("gridcell").first().click({ button: "right" });
}

test("a refused copy explains itself instead of doing nothing", async ({
	page,
	tabelo,
}) => {
	await faultyClipboard(page, "blocked");
	await page.reload();
	await tabelo.dismissWelcome();
	await expect(tabelo.workspace).toBeVisible();
	await tabelo.editCell(1, 1, "Ingrid");

	await openTableActions(page);
	await page.getByRole("menuitem", { name: copy.actions.copy }).click();

	await expect(
		tabelo.notice().filter({ hasText: writeRecovery }),
	).toBeVisible();
});

test("a refused cut keeps the data it could not copy", async ({
	page,
	tabelo,
}) => {
	await faultyClipboard(page, "blocked");
	await page.reload();
	await tabelo.dismissWelcome();
	await expect(tabelo.workspace).toBeVisible();
	await tabelo.editCell(1, 1, "Ingrid");

	await openTableActions(page);
	await page.getByRole("menuitem", { name: copy.actions.cut }).click();

	await expect(
		tabelo.notice().filter({ hasText: writeRecovery }),
	).toBeVisible();
	// The only copy of the value was in the table, and it is still there.
	await expect(tabelo.cell(1, 1)).toHaveText("Ingrid");
});

test("a refused paste explains itself and leaves the table alone", async ({
	page,
	tabelo,
}) => {
	await faultyClipboard(page, "blocked");
	await page.reload();
	await tabelo.dismissWelcome();
	await expect(tabelo.workspace).toBeVisible();
	await tabelo.editCell(1, 1, "Ingrid");

	await openTableActions(page);
	await page.getByRole("menuitem", { name: copy.actions.paste }).click();

	await expect(tabelo.notice().filter({ hasText: readRecovery })).toBeVisible();
	await expect(tabelo.cell(1, 1)).toHaveText("Ingrid");
});

test("a browser without the clipboard API still explains the failure", async ({
	page,
	tabelo,
}) => {
	await faultyClipboard(page, "absent");
	await page.reload();
	await expect(page.locator("main")).toBeVisible();

	await page.getByRole("button", { name: copy.empty.pasteHint }).click();

	await expect(tabelo.notice().filter({ hasText: readRecovery })).toBeVisible();
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
		tabelo.notice().filter({ hasText: copy.notices.clipboardEmpty }),
	).toBeVisible();
	await expect(tabelo.notice().filter({ hasText: readRecovery })).toHaveCount(
		0,
	);
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

	await tabelo.paste("Name\tRole\nIngrid\tDesigner");

	await expect(tabelo.cell(1, 1)).toHaveText("Ingrid");
	await expect(tabelo.cell(1, 2)).toHaveText("Designer");
});

test("pasting into a whole column keeps every input row", async ({
	tabelo,
}) => {
	await tabelo.editCell(1, 1, "keep");
	await tabelo
		.columnIndex(1)
		.getByRole("button", {
			name: new RegExp(`^${copy.actions.selectColumn}:`),
		})
		.click();

	await tabelo.paste("Mabel\nFelix\nAmora");

	await expect(tabelo.cell(1, 1)).toHaveText("Mabel");
	await expect(tabelo.cell(2, 1)).toHaveText("Felix");
	await expect(tabelo.cell(3, 1)).toHaveText("Amora");
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
	await tabelo.editCell(1, 1, "Ingrid");

	await openTableActions(page);
	await page.getByRole("menuitem", { name: copy.actions.copy }).click();

	await expect(
		tabelo.notice().filter({ hasText: copy.notices.copied("selection") }),
	).toBeVisible();
	expect(
		await page.evaluate(
			() => (window as unknown as { __written: string[] }).__written,
		),
	).toEqual(["text/plain", "text/html"]);
});

// The mark showing where the clipboard was filled from. It is drawn by the
// cells, so each one declares which edges of the range it owns; "inside" means
// the cell is in the range but touches none of its sides.
function mark(tabelo: TabeloPage, row: number, column: number): Locator {
	return tabelo.cell(row, column).locator("[data-clipboard-source]");
}

async function copyRange(tabelo: TabeloPage): Promise<void> {
	await tabelo.cell(2, 1).click();
	await tabelo.cell(3, 2).click({ modifiers: ["Shift"] });
	await tabelo.copy();
	await expect(mark(tabelo, 2, 1)).toBeVisible();
}

test("the copied range stays marked while the selection moves to the destination", async ({
	page,
	tabelo,
}) => {
	await copyRange(tabelo);

	// Navigating away is the whole reason the mark exists: the selection has to
	// go and find the paste destination.
	await page.keyboard.press("ArrowDown");
	await page.keyboard.press("ArrowRight");

	// Only the sides that lie on the boundary are drawn, so the range reads as
	// one outline rather than a grid of dashes.
	await expect(mark(tabelo, 2, 1)).toHaveAttribute(
		"data-clipboard-source",
		"top left",
	);
	await expect(mark(tabelo, 2, 2)).toHaveAttribute(
		"data-clipboard-source",
		"top right",
	);
	await expect(mark(tabelo, 3, 1)).toHaveAttribute(
		"data-clipboard-source",
		"bottom left",
	);
	await expect(mark(tabelo, 3, 2)).toHaveAttribute(
		"data-clipboard-source",
		"right bottom",
	);
	// A cell outside the range carries no mark at all.
	await expect(mark(tabelo, 1, 1)).toHaveCount(0);
	await expect(mark(tabelo, 2, 3)).toHaveCount(0);
});

// #349: a cell that is both focused and copied draws both states, because
// focus is a mark of its own beside the copied one rather than the cell's
// outline, which a browser would paint over the dashes (#365 moved every
// focused cell to that mark). Focus moves between cells; the copy stays.
test("a focused copied cell carries focus and copy in one mark", async ({
	page,
	tabelo,
}) => {
	await copyRange(tabelo);
	const focusMark = (row: number, column: number) =>
		tabelo.cell(row, column).locator("[data-focus-mark]");

	// The copy leaves focus on the range's last cell.
	await expect(focusMark(3, 2)).toHaveCount(1);
	await expect(mark(tabelo, 3, 2)).toHaveCount(1);

	await page.keyboard.press("ArrowRight");
	await expect(focusMark(3, 2)).toHaveCount(0);
	await expect(mark(tabelo, 3, 2)).toHaveCount(1);
	// Outside the range, the focus mark follows on its own.
	await expect(tabelo.cell(3, 3)).toBeFocused();
	await expect(focusMark(3, 3)).toHaveCount(1);
	await expect(mark(tabelo, 3, 3)).toHaveCount(0);
});

// #365: marks are drawn on the grid lines around a cell, so a copied cell's
// dashes and the focused neighbour's line meet on the line they share instead
// of leaving it bare between them. Directions only: each mark covers the line
// it sits on, and the two overlap there.
test("a copied mark and the focus beside it meet on their shared line", async ({
	page,
	tabelo,
}) => {
	await copyRange(tabelo);
	await page.keyboard.press("ArrowRight");
	await expect(tabelo.cell(3, 3)).toBeFocused();

	const box = async (locator: Locator) => {
		const found = await locator.boundingBox();
		if (!found) throw new Error("not rendered");
		return found;
	};
	const copiedCell = await box(tabelo.cell(3, 2));
	const copied = await box(mark(tabelo, 3, 2));
	const focusedCell = await box(tabelo.cell(3, 3));
	const focus = await box(tabelo.cell(3, 3).locator("[data-focus-mark]"));

	// The copied cell's mark covers its own right-hand line.
	expect(copied.x + copied.width).toBeGreaterThanOrEqual(
		copiedCell.x + copiedCell.width,
	);
	// The focused cell's mark reaches back over that same line.
	expect(focus.x).toBeLessThan(focusedCell.x);
	// So the two overlap rather than leave a gap.
	expect(copied.x + copied.width).toBeGreaterThan(focus.x);
});

test("Escape clears the mark before it collapses the selection", async ({
	page,
	tabelo,
}) => {
	await copyRange(tabelo);

	await page.keyboard.press("Escape");

	await expect(mark(tabelo, 2, 1)).toHaveCount(0);
	// The selection is still the two-by-two range: the innermost thing went
	// first, and this press did not reach it.
	await expect(tabelo.cell(3, 2)).toHaveAttribute("aria-selected", "true");
});

test("pasting clears the mark", async ({ page, tabelo }) => {
	await copyRange(tabelo);
	await page.keyboard.press("ArrowDown");

	await tabelo.paste("Mabel");

	await expect(mark(tabelo, 2, 1)).toHaveCount(0);
});

test("editing the table clears the mark, because the coordinates stop describing it", async ({
	tabelo,
}) => {
	await copyRange(tabelo);

	await tabelo.editCell(1, 3, "Felix");

	await expect(mark(tabelo, 2, 1)).toHaveCount(0);
});

// Tabelo's cut empties the cells immediately rather than on paste, so there is
// no pending move for a mark to describe.
test("a cut leaves no mark, and drops the one an earlier copy left", async ({
	tabelo,
}) => {
	await copyRange(tabelo);

	await tabelo.cut();

	await expect(mark(tabelo, 2, 1)).toHaveCount(0);
	await expect(mark(tabelo, 3, 2)).toHaveCount(0);
});

// A column selection reaches the header row, so copying one marks it too.
test("copying a whole column marks its header cell", async ({ tabelo }) => {
	await tabelo.columnIndex(2).click();
	await tabelo.copy();

	await expect(
		tabelo.header(2).locator("[data-clipboard-source]"),
	).toHaveAttribute("data-clipboard-source", "top right left");
});
