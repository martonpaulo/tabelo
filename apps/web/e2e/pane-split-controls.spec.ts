import { copy } from "@/ui/copy";
import { expect, test } from "./fixtures";

// The control that grows the workspace is hover-revealed, and §9 forbids
// anything depending on hover alone. So it is an ordinary tab stop at the
// workspace level of the two-level ring, beside the pane frame rather than
// inside its content.

test("the control is reachable by Tab without entering a pane", async ({
	page,
	tabelo,
}) => {
	const control = tabelo.splitControl("grid", "bottom");
	await tabelo.pane("grid").focus();

	// Frame, the header's two triggers, then the split control: all workspace
	// level, none of them inside the pane body.
	await page.keyboard.press("Tab");
	await page.keyboard.press("Tab");
	await page.keyboard.press("Tab");
	await expect(control).toBeFocused();

	// Reaching it must not count as entering the pane, or every per-row and
	// per-column control in the grid would rejoin this ring.
	await expect(
		tabelo.grid().getByRole("button", {
			name: `${copy.actions.selectRow}: ${copy.a11y.rowNumber(0)}`,
			exact: true,
		}),
	).toHaveAttribute("tabindex", "-1");
});

test("focus alone reveals the control, with no pointer involved", async ({
	page,
	tabelo,
}) => {
	// Dismissing the welcome surface leaves the pointer over a pane, which is
	// the very thing this test has to rule out.
	await page.mouse.move(0, 0);
	const control = tabelo.splitControl("grid", "bottom");
	await expect(control).toHaveCSS("opacity", "0");

	await control.focus();
	await expect(control).toHaveCSS("opacity", "1");
});

// Both keys, because a native button answers both and a div pretending to be
// one usually answers only Enter.
for (const key of ["Enter", "Space"] as const) {
	test(`${key} opens the picker from the focused control`, async ({
		page,
		tabelo,
	}) => {
		await tabelo.splitControl("grid", "bottom").focus();
		await page.keyboard.press(key);
		await expect(page.getByRole("dialog")).toBeVisible();
	});
}

test("revealing the control moves nothing", async ({ page, tabelo }) => {
	await page.mouse.move(0, 0);
	const pane = tabelo.pane("grid");
	const before = await pane.boundingBox();
	const editorBefore = await tabelo.source("markdown").boundingBox();

	await pane.hover();
	await expect(tabelo.splitControl("grid", "bottom")).toHaveCSS("opacity", "1");

	// Absolutely positioned, so appearing costs no layout anywhere.
	expect(await pane.boundingBox()).toEqual(before);
	expect(await tabelo.source("markdown").boundingBox()).toEqual(editorBefore);
	await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("the control names the pane and the direction it would grow", async ({
	tabelo,
}) => {
	// Two columns: two tall panes, each splitting downward.
	await expect(tabelo.addControls()).toHaveCount(2);
	await expect(tabelo.splitControl("grid", "bottom")).toHaveCount(1);
	await expect(tabelo.splitControl("markdown", "bottom")).toHaveCount(1);

	// Two rows: two wide panes, each splitting sideways instead.
	await tabelo.chooseLayout("rows");
	await expect(tabelo.splitControl("grid", "right")).toHaveCount(1);
	await expect(tabelo.splitControl("grid", "bottom")).toHaveCount(0);
});

test("only the pane that can still be split offers a control", async ({
	tabelo,
}) => {
	await tabelo.chooseLayout("left-split");

	// Exactly one pane spans two slots, so exactly one control exists.
	await expect(tabelo.addControls()).toHaveCount(1);
});

test("one pane offers both directions, because it spans both axes", async ({
	tabelo,
}) => {
	await tabelo.chooseLayout("single");

	await expect(tabelo.addControls()).toHaveCount(2);
	await expect(tabelo.splitControl("grid", "right")).toHaveCount(1);
	await expect(tabelo.splitControl("grid", "bottom")).toHaveCount(1);

	// The edge is a promise about where the pane lands, and it holds in the one
	// case where the same pane could have gone either way.
	await tabelo.addViewBySplit("grid", "bottom", "markdown");
	const grid = await tabelo.paneArea("grid");
	const markdown = await tabelo.paneArea("markdown");
	expect(markdown.rowStart).toBe(grid.rowEnd);
	expect(markdown.columnStart).toBe(grid.columnStart);
});
