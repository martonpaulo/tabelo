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
	await expect(menu).toBeVisible();
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
		menu.getByRole("menuitem", { name: copy.workspace.addView }),
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

test("global Add view reuses the chooser and picks placement automatically", async ({
	page,
	tabelo,
}) => {
	const menu = await tabelo.openAppMenu();
	await menu.getByRole("menuitem", { name: copy.workspace.addView }).click();

	const dialog = page.getByRole("dialog", { name: copy.addView.title });
	await expect(dialog).toBeVisible();
	await dialog.getByRole("button", { name: copy.addView.confirm }).click();
	await expect(dialog).toBeHidden();
	await expect(tabelo.workspace.getByRole("region")).toHaveCount(3);
	const grid = await tabelo.paneArea("grid");
	const added = await tabelo.paneArea("csv");
	expect(added.rowStart).toBe(grid.rowEnd);
	expect(added.columnStart).toBe(grid.columnStart);
});

test("global Add view stays explained at the workspace maximum", async ({
	page,
	tabelo,
}) => {
	await tabelo.chooseLayout("quad");
	const menu = await tabelo.openAppMenu();
	const command = menu.getByRole("menuitem", {
		name: copy.workspace.addView,
	});
	await expect(command).toBeDisabled();
	await command.hover();
	await expect(page.getByRole("tooltip")).toBeVisible();
});

// The pane heading identifies the view. Its one trailing menu owns commands,
// and Change view promotes the longer choice into a dialog rather than nesting.
test("each pane names itself and opens Change view from its actions", async ({
	tabelo,
}) => {
	const pane = tabelo.pane("markdown");
	const heading = pane.getByRole("heading", {
		name: copy.views.markdown.label,
	});
	await expect(heading).toBeVisible();
	await expect(heading.getByRole("button")).toHaveCount(0);

	const actionsMenu = await tabelo.openPaneMenu("markdown");
	await expect(
		actionsMenu.getByRole("menuitem", { name: copy.workspace.changeView }),
	).toBeVisible();
	await expect(
		actionsMenu.getByRole("menuitem", { name: copy.actions.copySource }),
	).toBeVisible();
	await expect(
		actionsMenu.getByRole("menuitem", { name: copy.workspace.closeView }),
	).toBeVisible();
	// Adding a view belongs to the split edge, and the view list is not nested.
	await expect(actionsMenu.getByRole("menuitemradio")).toHaveCount(0);
});

test("a global shortcut never stacks a second dialog", async ({
	page,
	tabelo,
}) => {
	const layout = await tabelo.openLayoutDialog();
	await page.keyboard.press("ControlOrMeta+s");

	await expect(page.getByRole("dialog")).toHaveCount(1);
	await expect(layout).toBeVisible();
	await expect(
		page.getByRole("dialog", { name: copy.download.title }),
	).toHaveCount(0);
});

test("a dialog command fully replaces the app menu", async ({
	page,
	tabelo,
}) => {
	const menu = await tabelo.openAppMenu();
	await menu
		.getByRole("menuitem", { name: copy.actions.downloadTable })
		.click();

	await expect(
		page.getByRole("dialog", { name: copy.download.title }),
	).toBeVisible();
	await expect(menu).toBeHidden();
});
