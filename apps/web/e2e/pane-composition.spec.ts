import { copy } from "@/ui/copy";
import { expect, test } from "./fixtures";

// Composing the workspace from the pane you are working in, rather than by
// naming a tiling first. The presets still own every shape. These flows prove
// the direct commands cannot reach anything the layout gallery cannot.

const invalidMarkdown = "| Name |\n| not a divider |\n| Inez |";

test("a view is added from the pane and its picker takes the focus", async ({
	tabelo,
}) => {
	const panes = tabelo.workspace.getByRole("region");
	await expect(panes).toHaveCount(2);

	await tabelo.runPaneCommand("markdown", "addView");

	await expect(panes).toHaveCount(3);
	// The new pane shows something the workspace was not already showing, and
	// changing that choice is the next keystroke rather than a hunt.
	await expect(tabelo.pane("csv")).toBeVisible();
	await expect(tabelo.paneViewTrigger("csv")).toBeFocused();
});

test("the added pane's view is chosen without touching the layout menu", async ({
	page,
	tabelo,
}) => {
	await tabelo.runPaneCommand("markdown", "addView");
	await expect(tabelo.paneViewTrigger("csv")).toBeFocused();

	// Enter opens the focused picker, which is the view list itself.
	await page.keyboard.press("Enter");
	await page
		.getByRole("menu", {
			name: `${copy.workspace.changeView}: ${copy.views.csv.label}`,
		})
		.getByRole("menuitemradio", { name: copy.views.jira.label })
		.click();

	await expect(tabelo.pane("jira")).toBeVisible();
	await expect(tabelo.pane("csv")).toHaveCount(0);
	await expect(tabelo.workspace.getByRole("region")).toHaveCount(3);
});

test("closing a view keeps the other panes and their views", async ({
	tabelo,
}) => {
	await tabelo.runPaneCommand("markdown", "addView");
	await expect(tabelo.workspace.getByRole("region")).toHaveCount(3);

	await tabelo.runPaneCommand("csv", "closeView");

	await expect(tabelo.workspace.getByRole("region")).toHaveCount(2);
	await expect(tabelo.pane("grid")).toBeVisible();
	await expect(tabelo.pane("markdown")).toBeVisible();
	await expect(tabelo.pane("csv")).toHaveCount(0);
});

test("every pane count from two to four is reachable and reversible", async ({
	tabelo,
}) => {
	const panes = tabelo.workspace.getByRole("region");

	await tabelo.runPaneCommand("markdown", "addView");
	await expect(panes).toHaveCount(3);
	await tabelo.runPaneCommand("markdown", "addView");
	await expect(panes).toHaveCount(4);

	await tabelo.runPaneCommand("markdown", "closeView");
	await expect(panes).toHaveCount(3);
	await tabelo.runPaneCommand("grid", "closeView");
	await expect(panes).toHaveCount(2);
});

test("the range ends disable the command instead of hiding it", async ({
	tabelo,
}) => {
	let menu = await tabelo.openPaneMenu("grid");
	await expect(
		menu.getByRole("menuitem", { name: copy.workspace.addView }),
	).toBeEnabled();
	await expect(
		menu.getByRole("menuitem", { name: copy.workspace.closeView }),
	).toBeDisabled();
	await menu.getByRole("menuitem", { name: copy.workspace.closeView }).hover();
	await expect(
		tabelo.page.getByRole("tooltip", { name: copy.disabled.closeOnlyView }),
	).toBeVisible();
	await tabelo.page.keyboard.press("Escape");

	await tabelo.chooseLayout("quad");
	menu = await tabelo.openPaneMenu("grid");
	await expect(
		menu.getByRole("menuitem", { name: copy.workspace.addView }),
	).toBeDisabled();
	await expect(
		menu.getByRole("menuitem", { name: copy.workspace.closeView }),
	).toBeEnabled();
});

test("closing a pane that owns an invalid draft asks before discarding it", async ({
	tabelo,
}) => {
	await tabelo.runPaneCommand("grid", "addView");
	await tabelo.source("markdown").fill(invalidMarkdown);
	await expect(tabelo.source("markdown")).toHaveAttribute(
		"aria-invalid",
		"true",
	);

	await tabelo.runPaneCommand("markdown", "closeView");

	// Nothing is lost yet: the pane, and the text in it, are still there.
	await expect(tabelo.pane("markdown")).toBeVisible();
	await expect(
		tabelo.notice().filter({ hasText: "before closing this view" }),
	).toBeVisible();

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
	await expect(menu).toContainText(copy.workspace.zoom(100));
	await expect(
		menu.getByRole("menuitem", { name: copy.workspace.resetZoom }),
	).toBeDisabled();

	// The menu stays open so the level can be stepped and read repeatedly.
	await menu
		.getByRole("menuitem", { name: copy.workspace.zoomIn, exact: true })
		.click();
	await expect(menu).toContainText(copy.workspace.zoom(110));
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

	// Neither name regresses to a bare "Pane" or a bare view label.
	await expect(actionsTrigger).toHaveAccessibleName(
		`${copy.workspace.paneActions}: ${copy.views.markdown.label}`,
	);
	await expect(viewTrigger).toHaveAccessibleName(
		`${copy.workspace.changeView}: ${copy.views.markdown.label}`,
	);

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
