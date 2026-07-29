import { copy } from "@/ui/copy";
import { expect, test } from "./fixtures";

// Composing the workspace from the pane you are working in, rather than by
// naming a tiling first. The presets still own every shape — these flows prove
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
	await expect(tabelo.paneMenuTrigger("csv")).toBeFocused();
});

test("the added pane's view is chosen without touching the layout menu", async ({
	page,
	tabelo,
}) => {
	await tabelo.runPaneCommand("markdown", "addView");
	await expect(tabelo.paneMenuTrigger("csv")).toBeFocused();

	// Enter opens the focused picker; the view list is the first thing in it.
	await page.keyboard.press("Enter");
	await page
		.getByRole("menu", {
			name: `${copy.workspace.paneActions}: ${copy.views.csv.label}`,
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

test("every pane count from one to four is reachable and reversible", async ({
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
	await tabelo.runPaneCommand("csv", "closeView");
	await expect(panes).toHaveCount(1);
});

test("the range ends disable the command instead of hiding it", async ({
	tabelo,
}) => {
	await tabelo.chooseLayout("single");
	let menu = await tabelo.openPaneMenu("grid");
	await expect(
		menu.getByRole("menuitem", { name: copy.workspace.addView }),
	).toBeEnabled();
	await expect(
		menu.getByRole("menuitem", { name: copy.workspace.closeView }),
	).toBeDisabled();
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
	await tabelo.source("markdown").fill(invalidMarkdown);
	await expect(tabelo.source("markdown")).toHaveAttribute(
		"aria-invalid",
		"true",
	);

	await tabelo.runPaneCommand("markdown", "closeView");

	// Nothing is lost yet: the pane, and the text in it, are still there.
	await expect(tabelo.pane("markdown")).toBeVisible();
	await expect(
		tabelo.status.filter({ hasText: "before closing this view" }),
	).toBeVisible();

	await tabelo.page
		.getByRole("button", { name: copy.notices.discardPaneAction("close") })
		.click();
	await expect(tabelo.pane("markdown")).toHaveCount(0);
	await expect(tabelo.workspace.getByRole("region")).toHaveCount(1);
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
