import { copy } from "@/copy/copy";
import { expect, test } from "./fixtures";

// Composing the workspace by splitting the pane edge the new view should appear
// along, rather than by naming a tiling first. The presets still own every
// shape, so splitting can never reach one the gallery cannot.

const invalidMarkdown = "| Name |\n| not a divider |\n| Ingrid |";

test("splitting a pane adds the view that was chosen for it", async ({
	tabelo,
}) => {
	const panes = tabelo.workspace.getByRole("region");
	await expect(panes).toHaveCount(2);

	await tabelo.addViewBySplit("markdown", "bottom", "jira");

	await expect(panes).toHaveCount(3);
	// The view was picked before anything moved, so the pane never appears
	// showing something the user did not ask for.
	await expect(tabelo.pane("jira")).toBeVisible();
	await expect(tabelo.pane("csv")).toHaveCount(0);
});

// The confirmed mapping: which pane is split decides which preset results, and
// the edge decides which side the new pane lands on.
test("which pane is split decides the resulting arrangement", async ({
	tabelo,
}) => {
	// Splitting the left pane of two columns puts the new pane under it.
	await tabelo.addViewBySplit("grid", "bottom", "csv");

	const grid = await tabelo.paneArea("grid");
	const added = await tabelo.paneArea("csv");
	const markdown = await tabelo.paneArea("markdown");

	expect(added.rowStart).toBe(grid.rowEnd);
	expect(added.columnStart).toBe(grid.columnStart);
	// The pane that was not split keeps both rows.
	expect(markdown.rowEnd - markdown.rowStart).toBe(2);
});

test("splitting the other pane produces the mirrored arrangement", async ({
	tabelo,
}) => {
	await tabelo.addViewBySplit("markdown", "bottom", "csv");

	const markdown = await tabelo.paneArea("markdown");
	const added = await tabelo.paneArea("csv");
	const grid = await tabelo.paneArea("grid");

	expect(added.rowStart).toBe(markdown.rowEnd);
	expect(added.columnStart).toBe(markdown.columnStart);
	expect(grid.rowEnd - grid.rowStart).toBe(2);
});

test("the picker refuses a view another pane already shows", async ({
	tabelo,
}) => {
	await tabelo.splitControl("grid", "bottom").click();
	const dialog = tabelo.page.getByRole("dialog");

	const markdown = dialog.getByRole("radio", {
		name: copy.views.markdown.label,
	});
	await expect(markdown).toBeVisible();
	await expect(markdown).toBeDisabled();
	await markdown.hover();
	await expect(tabelo.page.getByRole("tooltip")).toBeVisible();

	// A view nobody is showing stays available.
	await expect(
		dialog.getByRole("radio", { name: copy.views.jira.label }),
	).toBeEnabled();
});

test("cancelling changes nothing and returns the focus", async ({
	page,
	tabelo,
}) => {
	const panes = tabelo.workspace.getByRole("region");
	const control = tabelo.splitControl("grid", "bottom");
	await control.click();

	await page
		.getByRole("dialog")
		.getByRole("button", { name: copy.actions.cancel })
		.click();

	await expect(page.getByRole("dialog")).toBeHidden();
	await expect(panes).toHaveCount(2);
	await expect(control).toBeFocused();
});

test("the new pane takes the focus so it is not left on a control that moved", async ({
	tabelo,
}) => {
	await tabelo.addViewBySplit("grid", "bottom", "csv");
	await expect(tabelo.pane("csv")).toBeFocused();
});

test("closing a view keeps the other panes and their views", async ({
	tabelo,
}) => {
	await tabelo.addViewBySplit("markdown", "bottom", "csv");
	await expect(tabelo.workspace.getByRole("region")).toHaveCount(3);

	await tabelo.runPaneCommand("csv", "closeView");

	await expect(tabelo.workspace.getByRole("region")).toHaveCount(2);
	await expect(tabelo.pane("grid")).toBeVisible();
	await expect(tabelo.pane("markdown")).toBeVisible();
	await expect(tabelo.pane("csv")).toHaveCount(0);
});

test("every pane count from one to four is reachable and reversible", async ({
	tabelo,
}) => {
	const panes = tabelo.workspace.getByRole("region");

	await tabelo.addViewBySplit("markdown", "bottom", "csv");
	await expect(panes).toHaveCount(3);
	await tabelo.addViewBySplit("grid", "bottom", "jira");
	await expect(panes).toHaveCount(4);

	await tabelo.runPaneCommand("markdown", "closeView");
	await expect(panes).toHaveCount(3);
	await tabelo.runPaneCommand("grid", "closeView");
	await expect(panes).toHaveCount(2);
	await tabelo.runPaneCommand("csv", "closeView");
	await expect(panes).toHaveCount(1);

	// One pane is reachable but not a dead end: it splits either way, so the
	// count climbs back out of the floor the same way it arrived.
	await tabelo.addViewBySplit("jira", "right", "markdown");
	await expect(panes).toHaveCount(2);
});

// The two ends of the range say so differently, and deliberately. Close view is
// a menu item, so it is disabled with a written reason. A split control has no
// resting place to be disabled in, so at four panes there is simply no edge
// left that yields a valid preset and no control is drawn.
test("the range ends stop the commands that would leave it", async ({
	tabelo,
}) => {
	await tabelo.chooseLayout("single");
	const menu = await tabelo.openPaneMenu("grid");
	await expect(
		menu.getByRole("menuitem", { name: copy.workspace.closeView }),
	).toBeDisabled();
	await expect(
		menu.getByRole("menuitem", { name: copy.workspace.movePane }),
	).toBeDisabled();
	await menu.getByRole("menuitem", { name: copy.workspace.movePane }).hover();
	await expect(tabelo.page.getByRole("tooltip")).toBeVisible();
	await tabelo.page.keyboard.press("Escape");

	// One pane spans both axes, so it is the only pane offering both edges.
	await expect(tabelo.addControls()).toHaveCount(2);

	await tabelo.chooseLayout("quad");
	await expect(tabelo.addControls()).toHaveCount(0);
	await expect(
		(await tabelo.openPaneMenu("grid")).getByRole("menuitem", {
			name: copy.workspace.closeView,
		}),
	).toBeEnabled();
});

test("closing a pane that owns an invalid draft asks before discarding it", async ({
	tabelo,
}) => {
	// A third pane, so that closing the one holding the draft is not also the
	// step that changes how many columns the workspace has.
	await tabelo.addViewBySplit("grid", "bottom", "csv");
	await tabelo.source("markdown").fill(invalidMarkdown);
	await expect(tabelo.source("markdown")).toHaveAttribute(
		"aria-invalid",
		"true",
	);

	await tabelo.runPaneCommand("markdown", "closeView");

	// Nothing is lost yet: the pane, and the text in it, are still there.
	await expect(tabelo.pane("markdown")).toBeVisible();
	await expect(tabelo.notice()).toBeVisible();

	await tabelo.page
		.getByRole("button", { name: copy.notices.discardPaneAction("close") })
		.click();
	await expect(tabelo.pane("markdown")).toHaveCount(0);
	await expect(tabelo.workspace.getByRole("region")).toHaveCount(2);
});

test("keyboard zoom changes the active pane and resets with the standard shortcut", async ({
	page,
	tabelo,
}) => {
	const markdownSize = () =>
		tabelo
			.pane("markdown")
			.locator(".cm-content")
			.evaluate((element) =>
				Number.parseFloat(getComputedStyle(element).fontSize),
			);
	const markdownSizeBefore = await markdownSize();
	await tabelo.source("markdown").click();
	await page.keyboard.press("ControlOrMeta+=");
	await expect.poll(markdownSize).toBeGreaterThan(markdownSizeBefore);

	await page.keyboard.press("ControlOrMeta+0");
	const menu = await tabelo.openPaneMenu("markdown");
	await expect(
		menu.getByRole("menuitem", { name: copy.workspace.resetZoom }),
	).toBeDisabled();
});

test("zoom resets in one action and survives a reload", async ({ tabelo }) => {
	const contentSize = () =>
		tabelo
			.pane("markdown")
			.locator(".cm-content")
			.evaluate((element) =>
				Number.parseFloat(getComputedStyle(element).fontSize),
			);
	const contentSizeBefore = await contentSize();

	await tabelo.runPaneCommand("markdown", "zoomOut");
	await expect.poll(contentSize).toBeLessThan(contentSizeBefore);

	await tabelo.page.reload();
	await tabelo.dismissWelcome();
	await expect(tabelo.workspace).toBeVisible();
	await expect.poll(contentSize).toBeLessThan(contentSizeBefore);

	await tabelo.runPaneCommand("markdown", "resetZoom");
	const menu = await tabelo.openPaneMenu("markdown");
	await expect(
		menu.getByRole("menuitem", { name: copy.workspace.resetZoom }),
	).toBeDisabled();
});

test("the zoom level is reported to assistive technology", async ({
	tabelo,
}) => {
	const menu = await tabelo.openPaneMenu("markdown");

	await expect(
		menu.getByRole("menuitem", { name: copy.workspace.resetZoom }),
	).toBeDisabled();

	// The menu stays open so the level can be stepped and read repeatedly.
	await menu
		.getByRole("menuitem", { name: copy.workspace.zoomIn, exact: true })
		.click();

	await expect(
		menu.getByRole("menuitem", { name: copy.workspace.resetZoom }),
	).toBeEnabled();
});

// The pane title is identity, while the one trailing trigger owns pane commands.
test("the pane header keeps identity static beside its actions", async ({
	tabelo,
}) => {
	const actionsTrigger = tabelo.paneMenuTrigger("markdown");

	await expect(actionsTrigger).toBeVisible();

	const pane = tabelo.pane("markdown");
	const heading = pane.getByRole("heading");
	await expect(heading).toHaveCount(1);
	await expect(heading.getByRole("button")).toHaveCount(0);
});

test("Change view leaves the flat pane menu for one dialog", async ({
	page,
	tabelo,
}) => {
	const actionsMenu = await tabelo.openPaneMenu("markdown");
	await expect(
		actionsMenu.getByRole("menuitem", { name: copy.workspace.changeView }),
	).toBeVisible();
	await expect(actionsMenu.getByRole("menuitemradio")).toHaveCount(0);
	await expect(
		actionsMenu.getByRole("menuitem", { name: copy.workspace.zoomIn }),
	).toBeVisible();
	await page.keyboard.press("Escape");

	const dialog = await tabelo.openChangeViewDialog("markdown");
	await expect(dialog.getByRole("radio")).toHaveCount(9);
	await expect(
		dialog.getByRole("menuitem", { name: copy.workspace.zoomIn }),
	).toHaveCount(0);
});

test("changing the view from pane actions keeps the pane working", async ({
	tabelo,
}) => {
	await tabelo.choosePaneView("markdown", "jira");

	await expect(tabelo.pane("jira")).toBeVisible();
	await expect(tabelo.pane("markdown")).toHaveCount(0);
});

// Adding, closing, and arranging are three commands with one boundary between
// them: Layout may change how the open panes are arranged and nothing else.
test("Layout offers only the arrangements of the current pane count", async ({
	tabelo,
}) => {
	const panes = tabelo.workspace.getByRole("region");
	const twoPane = await tabelo.openLayoutDialog();
	await expect(twoPane.getByRole("radio")).toHaveCount(2);
	for (const id of ["columns", "rows"] as const) {
		await expect(
			twoPane.getByRole("radio", { name: copy.layouts[id].label }),
		).toBeVisible();
	}
	await twoPane.getByRole("button", { name: copy.actions.cancel }).click();
	await expect(twoPane).toBeHidden();

	await tabelo.goToPaneCount(3);
	const threePane = await tabelo.openLayoutDialog();
	await expect(threePane.getByRole("radio")).toHaveCount(4);
	for (const id of [
		"left-split",
		"right-split",
		"top-split",
		"bottom-split",
	] as const) {
		await expect(
			threePane.getByRole("radio", { name: copy.layouts[id].label }),
		).toBeVisible();
	}

	// Applying one of them rearranges the three panes rather than making a
	// fourth, and the arrangement growing alone cannot reach is among them.
	await threePane
		.getByRole("radio", { name: copy.layouts["top-split"].label })
		.click();
	await threePane
		.getByRole("button", { name: copy.workspace.applyLayout })
		.click();
	await expect(threePane).toBeHidden();
	await expect(panes).toHaveCount(3);
	expect(await tabelo.paneArea("grid")).toMatchObject({
		rowStart: 1,
		rowEnd: 2,
		columnStart: 1,
		columnEnd: 2,
	});
});

test("Layout is disabled and explained where the pane count has one arrangement", async ({
	page,
	tabelo,
}) => {
	for (const count of [1, 4]) {
		await tabelo.goToPaneCount(count);
		const menu = await tabelo.openAppMenu();
		const command = menu.getByRole("menuitem", { name: copy.workspace.layout });
		// Fixed rather than hidden: the command keeps its place in the menu and
		// says why it cannot act.
		await expect(command).toBeVisible();
		await expect(command).toBeDisabled();
		await command.hover();
		await expect(page.getByRole("tooltip")).toBeVisible();
		// The tooltip takes the first Escape, the menu the next one.
		await page.keyboard.press("Escape");
		await page.keyboard.press("Escape");
		await expect(menu).toBeHidden();
	}
});

test("a same-count arrangement survives a reload", async ({ page, tabelo }) => {
	// Content of its own, so the reload restores a saved workspace rather than
	// returning to onboarding.
	await tabelo.editCell(1, 1, "Ingrid");
	await tabelo.goToPaneCount(3);
	await tabelo.chooseLayout("bottom-split");
	const before = await tabelo.paneArea("grid");
	expect(before).toMatchObject({ rowStart: 1, rowEnd: 2 });

	await page.reload();
	await tabelo.workspace.waitFor({ state: "visible" });

	await expect(tabelo.workspace.getByRole("region")).toHaveCount(3);
	expect(await tabelo.paneArea("grid")).toEqual(before);
});

// §5 requires a pane header to be one row that never wraps, shortening labels
// instead. The action trigger and Read only badge are the tightest case today.
test("the pane header keeps its controls at the narrowest four-pane width", async ({
	page,
	tabelo,
}) => {
	await tabelo.chooseLayout("quad");
	// Just above the breakpoint where the workspace stacks instead of tiling.
	await page.setViewportSize({ width: 900, height: 700 });

	for (const pane of await tabelo.workspace.getByRole("region").all()) {
		const header = pane.locator("header");
		await expect(header).toHaveCSS("flex-wrap", "nowrap");
		// The one command trigger survives the squeeze; the label shortens instead.
		await expect(
			pane.getByRole("button", {
				name: new RegExp(`^${copy.workspace.paneActions}:`),
			}),
		).toBeVisible();
	}

	// And the workspace never grows a horizontal scrollbar to fit them.
	expect(
		await page.evaluate(
			() => document.documentElement.scrollWidth <= window.innerWidth,
		),
	).toBe(true);
});
