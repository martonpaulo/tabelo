import { copy } from "@/ui/copy";
import { expect, test } from "./fixtures";

// Composing the workspace by splitting the pane edge the new view should appear
// along, rather than by naming a tiling first. The presets still own every
// shape, so splitting can never reach one the gallery cannot.

const invalidMarkdown = "| Name |\n| not a divider |\n| Inez |";

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
	await menu.getByRole("menuitem", { name: copy.workspace.closeView }).hover();
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

test("pane zoom scales that pane's content and nothing else", async ({
	tabelo,
}) => {
	const header = tabelo.pane("markdown").getByRole("heading").first();
	const trigger = tabelo.paneMenuTrigger("markdown");
	const chromeBefore = await trigger.boundingBox();
	const headerSizeBefore = await header.evaluate((element) =>
		Number.parseFloat(getComputedStyle(element).fontSize),
	);
	const paneHeaderHeightBefore = await tabelo
		.pane("markdown")
		.locator("header")
		.evaluate((element) => element.getBoundingClientRect().height);
	const gridSizeBefore = await tabelo
		.grid()
		.evaluate((element) =>
			Number.parseFloat(getComputedStyle(element).fontSize),
		);

	const contentSize = () =>
		tabelo
			.pane("markdown")
			.locator(".cm-content")
			.evaluate((element) =>
				Number.parseFloat(getComputedStyle(element).fontSize),
			);

	const contentSizeBefore = await contentSize();

	await tabelo.runPaneCommand("markdown", "zoomIn");
	await expect.poll(contentSize).toBeGreaterThan(contentSizeBefore);

	// Chrome is not content: the header text, the pane title, and the hit target
	// of the menu button all stay exactly where they were.
	expect(
		await header.evaluate((element) =>
			Number.parseFloat(getComputedStyle(element).fontSize),
		),
	).toBe(headerSizeBefore);
	expect((await trigger.boundingBox())?.height).toBe(chromeBefore?.height);
	expect(
		await tabelo
			.pane("markdown")
			.locator("header")
			.evaluate((element) => element.getBoundingClientRect().height),
	).toBe(paneHeaderHeightBefore);

	// The pane beside it is untouched.
	expect(
		await tabelo
			.grid()
			.evaluate((element) =>
				Number.parseFloat(getComputedStyle(element).fontSize),
			),
	).toBe(gridSizeBefore);
});

test("keyboard zoom changes only the active pane and resets with the standard shortcut", async ({
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
	const gridSizeBefore = await tabelo
		.grid()
		.evaluate((element) =>
			Number.parseFloat(getComputedStyle(element).fontSize),
		);

	await tabelo.source("markdown").click();
	await page.keyboard.press("ControlOrMeta+=");
	await expect.poll(markdownSize).toBeGreaterThan(markdownSizeBefore);
	expect(
		await tabelo
			.grid()
			.evaluate((element) =>
				Number.parseFloat(getComputedStyle(element).fontSize),
			),
	).toBe(gridSizeBefore);

	await page.keyboard.press("ControlOrMeta+0");
	await expect.poll(markdownSize).toBeCloseTo(markdownSizeBefore, 1);
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
	await expect.poll(contentSize).toBeCloseTo(contentSizeBefore, 1);
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

// The pane header carries two triggers, one per job. Both name the view they
// belong to, because with four panes open the name is the only thing that says
// which pane a trigger acts on.
test("the pane header splits identity from actions", async ({ tabelo }) => {
	const viewTrigger = tabelo.paneViewTrigger("markdown");
	const actionsTrigger = tabelo.paneMenuTrigger("markdown");

	await expect(viewTrigger).toBeVisible();
	await expect(actionsTrigger).toBeVisible();

	// The view name still contributes the pane's heading to the outline, and the
	// trigger sits inside it rather than replacing it.
	const heading = tabelo.pane("markdown").getByRole("heading");
	await expect(heading).toHaveCount(1);
	await expect(heading.getByRole("button")).toHaveCount(1);

	// The actions trigger is the trailing control, and the view name leads.
	const viewBox = await viewTrigger.boundingBox();
	const actionsBox = await actionsTrigger.boundingBox();
	expect(viewBox?.x ?? 0).toBeLessThan(actionsBox?.x ?? 0);
});

test("each pane header trigger opens only its own menu", async ({
	page,
	tabelo,
}) => {
	const viewMenu = await tabelo.openPaneViewMenu("markdown");
	await expect(viewMenu.getByRole("menuitemradio")).toHaveCount(8);
	await expect(
		viewMenu.getByRole("menuitem", { name: copy.workspace.zoomIn }),
	).toHaveCount(0);
	await page.keyboard.press("Escape");
	await expect(viewMenu).toBeHidden();

	const actionsMenu = await tabelo.openPaneMenu("markdown");
	await expect(actionsMenu.getByRole("menuitemradio")).toHaveCount(0);
	await expect(
		actionsMenu.getByRole("menuitem", { name: copy.workspace.zoomIn }),
	).toBeVisible();
});

test("changing the view from the view name keeps the pane working", async ({
	tabelo,
}) => {
	await tabelo.choosePaneView("markdown", "jira");

	await expect(tabelo.pane("jira")).toBeVisible();
	await expect(tabelo.pane("markdown")).toHaveCount(0);
	await expect(tabelo.paneViewTrigger("jira")).toHaveAccessibleName(
		`${copy.workspace.changeView}: ${copy.views.jira.label}`,
	);
});

// §5 requires a pane header to be one row that never wraps, shortening labels
// instead. Two triggers plus the Read only badge is the tightest case today.
test("the pane header stays one row at the narrowest four-pane width", async ({
	page,
	tabelo,
}) => {
	const headerHeight = () =>
		tabelo
			.pane("markdown")
			.locator("header")
			.evaluate((element) => element.getBoundingClientRect().height);

	const roomy = await headerHeight();

	await tabelo.chooseLayout("quad");
	// Just above the breakpoint where the workspace stacks instead of tiling.
	await page.setViewportSize({ width: 900, height: 700 });

	for (const pane of await tabelo.workspace.getByRole("region").all()) {
		const header = pane.locator("header");
		expect(await header.evaluate((e) => e.getBoundingClientRect().height)).toBe(
			roomy,
		);
		// Both triggers survive the squeeze; the label shortens instead.
		await expect(
			pane.getByRole("button", {
				name: new RegExp(`^${copy.workspace.changeView}:`),
			}),
		).toBeVisible();
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
