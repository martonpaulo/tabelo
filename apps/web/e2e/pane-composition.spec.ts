import { expect, test } from "./fixtures";

// Composing the workspace from the pane you are working in, rather than by
// naming a tiling first. The presets still own every shape — these flows prove
// the direct commands cannot reach anything the layout gallery cannot.

const invalidMarkdown = "| Name |\n| not a divider |\n| Ana |";

test("a view is added from the pane and its picker takes the focus", async ({
	tabelo,
}) => {
	const panes = tabelo.workspace.getByRole("region");
	await expect(panes).toHaveCount(2);

	await tabelo.runPaneCommand("Markdown", "Add view");

	await expect(panes).toHaveCount(3);
	// The new pane shows something the workspace was not already showing, and
	// changing that choice is the next keystroke rather than a hunt.
	await expect(tabelo.pane("CSV")).toBeVisible();
	await expect(tabelo.paneMenuTrigger("CSV")).toBeFocused();
});

test("the added pane's view is chosen without touching the layout menu", async ({
	page,
	tabelo,
}) => {
	await tabelo.runPaneCommand("Markdown", "Add view");
	await expect(tabelo.paneMenuTrigger("CSV")).toBeFocused();

	// Enter opens the focused picker; the view list is the first thing in it.
	await page.keyboard.press("Enter");
	await page
		.getByRole("menu", { name: "Pane actions: CSV" })
		.getByRole("menuitem", { name: /Jira/ })
		.click();

	await expect(tabelo.pane("Jira")).toBeVisible();
	await expect(tabelo.pane("CSV")).toHaveCount(0);
	await expect(tabelo.workspace.getByRole("region")).toHaveCount(3);
});

test("closing a view keeps the other panes and their views", async ({
	tabelo,
}) => {
	await tabelo.runPaneCommand("Markdown", "Add view");
	await expect(tabelo.workspace.getByRole("region")).toHaveCount(3);

	await tabelo.runPaneCommand("CSV", "Close view");

	await expect(tabelo.workspace.getByRole("region")).toHaveCount(2);
	await expect(tabelo.pane("Visual table")).toBeVisible();
	await expect(tabelo.pane("Markdown")).toBeVisible();
	await expect(tabelo.pane("CSV")).toHaveCount(0);
});

test("every pane count from one to four is reachable and reversible", async ({
	tabelo,
}) => {
	const panes = tabelo.workspace.getByRole("region");

	await tabelo.runPaneCommand("Markdown", "Add view");
	await expect(panes).toHaveCount(3);
	await tabelo.runPaneCommand("Markdown", "Add view");
	await expect(panes).toHaveCount(4);

	await tabelo.runPaneCommand("Markdown", "Close view");
	await expect(panes).toHaveCount(3);
	await tabelo.runPaneCommand("Visual table", "Close view");
	await expect(panes).toHaveCount(2);
	await tabelo.runPaneCommand("CSV", "Close view");
	await expect(panes).toHaveCount(1);
});

test("the range ends disable the command instead of hiding it", async ({
	tabelo,
}) => {
	await tabelo.chooseLayout("Single");
	let menu = await tabelo.openPaneMenu("Visual table");
	await expect(menu.getByRole("menuitem", { name: "Add view" })).toBeEnabled();
	await expect(
		menu.getByRole("menuitem", { name: "Close view" }),
	).toBeDisabled();
	await tabelo.page.keyboard.press("Escape");

	await tabelo.chooseLayout("Four panes");
	menu = await tabelo.openPaneMenu("Visual table");
	await expect(menu.getByRole("menuitem", { name: "Add view" })).toBeDisabled();
	await expect(
		menu.getByRole("menuitem", { name: "Close view" }),
	).toBeEnabled();
});

test("closing a pane that owns an invalid draft asks before discarding it", async ({
	tabelo,
}) => {
	await tabelo.source("Markdown").fill(invalidMarkdown);
	await expect(tabelo.source("Markdown")).toHaveAttribute(
		"aria-invalid",
		"true",
	);

	await tabelo.runPaneCommand("Markdown", "Close view");

	// Nothing is lost yet: the pane, and the text in it, are still there.
	await expect(tabelo.pane("Markdown")).toBeVisible();
	await expect(
		tabelo.status.filter({ hasText: "before closing this view" }),
	).toBeVisible();

	await tabelo.page
		.getByRole("button", { name: "Discard and close view" })
		.click();
	await expect(tabelo.pane("Markdown")).toHaveCount(0);
	await expect(tabelo.workspace.getByRole("region")).toHaveCount(1);
});
