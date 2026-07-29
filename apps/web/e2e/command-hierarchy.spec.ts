import { copy } from "@/ui/copy";
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

test("each pane keeps identity while low-frequency actions share one menu", async ({
	page,
	tabelo,
}) => {
	const pane = tabelo.pane("markdown");
	await expect(
		pane.getByRole("heading", { name: copy.views.markdown.label }),
	).toBeVisible();
	await tabelo.paneMenuTrigger("markdown").click();
	const menu = page.getByRole("menu", {
		name: `${copy.workspace.paneActions}: ${copy.views.markdown.label}`,
	});
	await expect(menu.getByText(copy.workspace.changeView)).toBeVisible();
	await expect(
		menu.getByRole("menuitemradio", { name: copy.views.csv.label }),
	).toBeVisible();
	await expect(
		menu.getByRole("menuitem", { name: copy.actions.copySource }),
	).toBeVisible();
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
