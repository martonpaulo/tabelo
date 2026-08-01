import type { Locator, Page } from "@playwright/test";
import { copy } from "@/copy/copy";
import { expect, test } from "./fixtures";

// The workspace is a two-level ring: Tab walks between panes, Enter goes into
// one, and Escape comes back out. See docs/design-system.md §9.
//
// The point of the model is that a pane costs a fixed number of tab stops no
// matter what it holds. Before it, reaching the second pane from inside a
// 121-row grid took 249 Tab presses, because every row contributed a select
// button and a menu trigger to the same ring, and every column did the same.

// The documented target scale, and wider than the table starts, so a ring that
// grew with either dimension would show up.
const bigTable = Array.from({ length: 200 }, (_, row) =>
	Array.from({ length: 6 }, (_, column) => `r${row}c${column}`).join("\t"),
).join("\n");

// How many presses it takes to walk from the current focus to `target`, or -1
// if it is not reached. The number itself is not the contract; that it does not
// change with the size of the table is.
async function tabsToReach(page: Page, target: Locator): Promise<number> {
	for (let presses = 1; presses <= 60; presses += 1) {
		await page.keyboard.press("Tab");
		const arrived = await target.evaluate(
			(node) => window.document.activeElement === node,
		);
		if (arrived) return presses;
	}
	return -1;
}

test("the workspace ring does not grow with the table", async ({
	page,
	tabelo,
}) => {
	const gridPane = tabelo.pane("grid");
	const markdownPane = tabelo.pane("markdown");
	// One of the controls the grid grows per row. Standing on the pane frame
	// rather than in its content has to put it back out of the ring, and waiting
	// for that is what makes the walk below deterministic without a sleep.
	const rowSelect = tabelo.grid().getByRole("button", {
		name: `${copy.actions.selectRow}: ${copy.a11y.rowNumber(0)}`,
		// "Row 2" is a prefix of "Row 20" once the table is large.
		exact: true,
	});

	await gridPane.focus();
	await expect(rowSelect).toHaveAttribute("tabindex", "-1");
	const before = await tabsToReach(page, markdownPane);
	expect(before).toBeGreaterThan(0);

	await tabelo.paste(bigTable);
	// Pasting runs header detection, so the exact row count is the heuristic's
	// business. That the grid is now far larger than it was is this test's.
	await expect
		.poll(() => tabelo.grid().getByRole("row").count())
		.toBeGreaterThan(100);

	// Same walk, 200 rows and twice the columns later. Every select handle and
	// axis menu the grid grew belongs to the pane's content, not to this ring.
	await gridPane.focus();
	await expect(rowSelect).toHaveAttribute("tabindex", "-1");
	expect(await tabsToReach(page, markdownPane)).toBe(before);

	// Backwards lands on the last workspace-level control the grid pane owns,
	// which is the split control on its edge: the ring holds the pane's chrome,
	// never its content.
	await page.keyboard.press("Shift+Tab");
	await expect(tabelo.splitControl("grid", "bottom")).toBeFocused();
});

test("Enter moves into the grid's focused cell, not the pane header", async ({
	page,
	tabelo,
}) => {
	const gridPane = tabelo.pane("grid");
	await gridPane.focus();

	await page.keyboard.press("Enter");

	// The pane header's own trigger is inside the pane but is not its
	// content, so entering must step over them.
	await expect(tabelo.cell(1, 1)).toBeFocused();
	await expect(tabelo.paneMenuTrigger("grid")).not.toBeFocused();

	await page.keyboard.press("Escape");
	await expect(gridPane).toBeFocused();
});

test("Enter reaches a source editor and Escape leaves it", async ({
	page,
	tabelo,
}) => {
	const markdownPane = tabelo.pane("markdown");
	await markdownPane.focus();

	await page.keyboard.press("Enter");
	await expect(tabelo.source("markdown")).toBeFocused();

	await page.keyboard.press("Escape");
	await expect(markdownPane).toBeFocused();
});

test("Escape closes the innermost thing first, and exits the pane last", async ({
	page,
	tabelo,
}) => {
	const gridPane = tabelo.pane("grid");
	await gridPane.focus();
	await page.keyboard.press("Enter");
	await expect(tabelo.cell(1, 1)).toBeFocused();

	// Opening a cell editor puts a third level under the pane.
	await page.keyboard.press("Enter");
	const editor = tabelo
		.grid()
		.getByRole("textbox", { name: copy.a11y.cellEditor(0, 0) });
	await expect(editor).toBeFocused();

	// The first Escape cancels the edit and stops there.
	await page.keyboard.press("Escape");
	await expect(tabelo.cell(1, 1)).toBeFocused();

	// Only the second leaves the pane.
	await page.keyboard.press("Escape");
	await expect(gridPane).toBeFocused();
});

test("Enter reaches the preview's scroller, which holds no controls", async ({
	page,
	tabelo,
}) => {
	await tabelo.choosePaneView("markdown", "html-preview");
	const previewPane = tabelo.pane("html-preview");
	// The preview is lazily loaded, and there is nothing to enter until it is
	// on screen.
	const scroller = previewPane.locator('[data-slot="preview-scroller"]');
	await expect(scroller).toBeVisible();

	await previewPane.focus();
	await page.keyboard.press("Enter");

	// Nothing in a preview is focusable, so the scroller itself is the entry
	// target: a focused scrollable element answers the arrow keys.
	await expect(scroller).toBeFocused();

	await page.keyboard.press("Escape");
	await expect(previewPane).toBeFocused();
});
