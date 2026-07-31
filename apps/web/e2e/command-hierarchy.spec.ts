import { copy } from "@/copy/copy";
import { expect, test } from "./fixtures";

test("document actions live in one compact floating menu", async ({
	page,
	tabelo,
}) => {
	await expect(tabelo.workspace).toBeVisible();
	await expect(page.getByRole("banner")).toHaveCount(0);
	const trigger = page.getByRole("button", { name: copy.actions.openAppMenu });
	await expect(trigger).toBeVisible();
	const menu = await tabelo.openAppMenu();
	await expect(menu).toContainText(copy.app.name);
	await expect(
		menu.getByRole("menuitem", { name: copy.actions.newTable }),
	).toBeVisible();
	await expect(
		menu.getByRole("menuitem", { name: copy.actions.importFile }),
	).toBeVisible();
	// Formats are chosen in the download chooser, not by making the File menu
	// carry one item per format.
	await expect(
		menu.getByRole("menuitem", { name: copy.actions.downloadTable }),
	).toBeVisible();
	await expect(
		menu.getByRole("menuitem", { name: copy.workspace.layout }),
	).toBeVisible();
	await expect(
		menu.getByRole("menuitem", { name: copy.actions.github }),
	).toBeVisible();
	await expect(
		menu.getByRole("menuitem", { name: copy.appUpdate.label }),
	).toHaveCount(0);
	await expect(
		menu.getByRole("menuitem", { name: copy.views.markdown.label }),
	).toHaveCount(0);
});

// The pane header splits its two jobs: the view name changes the view, the
// trailing chevron carries everything else. Each trigger opens only its own
// menu, so neither leaks the other's commands.
test("each pane names itself and separates changing the view from its actions", async ({
	page,
	tabelo,
}) => {
	const pane = tabelo.pane("markdown");
	await expect(
		pane.getByRole("heading", { name: copy.views.markdown.label }),
	).toBeVisible();

	const viewMenu = await tabelo.openPaneViewMenu("markdown");
	await expect(viewMenu.getByText(copy.workspace.changeView)).toBeVisible();
	await expect(
		viewMenu.getByRole("menuitemradio", { name: copy.views.csv.label }),
	).toBeVisible();
	// Changing the view is all this menu does.
	await expect(
		viewMenu.getByRole("menuitem", { name: copy.actions.copySource }),
	).toHaveCount(0);
	await page.keyboard.press("Escape");
	await expect(viewMenu).toBeHidden();

	const actionsMenu = await tabelo.openPaneMenu("markdown");
	await expect(
		actionsMenu.getByRole("menuitem", { name: copy.actions.copySource }),
	).toBeVisible();
	await expect(
		actionsMenu.getByRole("menuitem", { name: copy.workspace.closeView }),
	).toBeVisible();
	// Adding a view is not here at all: it belongs to the edge it would split.
	// And the view list is not repeated here.
	await expect(actionsMenu.getByRole("menuitemradio")).toHaveCount(0);
});

test("source diagnostics do not reserve editor space", async ({ tabelo }) => {
	await tabelo.chooseLayout("quad");
	const pane = tabelo.pane("markdown");
	const editor = tabelo.source("markdown");
	const healthyBox = await pane.locator(".cm-editor").boundingBox();
	expect(healthyBox).not.toBeNull();

	await editor.fill("| A |\n| not a divider |");
	await expect(editor).toHaveAttribute("aria-invalid", "true");
	const invalidBox = await pane.locator(".cm-editor").boundingBox();
	expect(invalidBox).not.toBeNull();
	expect(invalidBox?.height).toBeCloseTo(healthyBox?.height ?? 0, 0);

	const descriptionId = await editor.getAttribute("aria-describedby");
	expect(descriptionId).toBeTruthy();
	await expect(pane.locator(`#${descriptionId}`)).toContainText(
		copy.source.issue({
			code: "markdown-divider-required",
			line: 2,
		}),
	);
});
