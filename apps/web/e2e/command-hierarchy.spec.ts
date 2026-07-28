import { expect, test } from "./fixtures";

test("document actions live in one compact floating menu", async ({
	page,
	tabelo,
}) => {
	await expect(tabelo.workspace).toBeVisible();
	await expect(page.getByRole("banner")).toHaveCount(0);
	const trigger = page.getByRole("button", { name: "Open Tabelo menu" });
	await expect(trigger).toBeVisible();
	const menu = await tabelo.openAppMenu();
	await expect(menu).toContainText("Tabelo");
	await expect(menu.getByRole("menuitem", { name: "New table" })).toBeVisible();
	await expect(
		menu.getByRole("menuitem", { name: "Import file" }),
	).toBeVisible();
	// Formats are chosen in the download chooser, not by making the File menu
	// carry one item per format.
	await expect(
		menu.getByRole("menuitem", { name: "Download table" }),
	).toBeVisible();
	await expect(menu.getByRole("menuitem", { name: "Layout" })).toBeVisible();
	await expect(
		menu.getByRole("menuitem", { name: "View on GitHub" }),
	).toBeVisible();
	await expect(menu.getByRole("menuitem", { name: /Markdown/ })).toHaveCount(0);
});

test("each pane keeps identity while low-frequency actions share one menu", async ({
	page,
	tabelo,
}) => {
	const pane = tabelo.pane("Markdown");
	await expect(pane.getByRole("heading", { name: "Markdown" })).toBeVisible();
	await expect(pane).not.toContainText("In sync");

	await pane.getByRole("button", { name: "Pane actions: Markdown" }).click();
	const menu = page.getByRole("menu", { name: "Pane actions: Markdown" });
	await expect(menu.getByText("Change view")).toBeVisible();
	await expect(menu.getByRole("menuitemradio", { name: /CSV/ })).toBeVisible();
	await expect(
		menu.getByRole("menuitem", { name: "Copy source" }),
	).toBeVisible();
});

test("source diagnostics do not reserve editor space", async ({ tabelo }) => {
	await tabelo.chooseLayout("Four panes");
	const pane = tabelo.pane("Markdown");
	const editor = tabelo.source("Markdown");
	const healthyBox = await pane.locator(".cm-editor").boundingBox();
	expect(healthyBox).not.toBeNull();

	await editor.fill("| A |\n| not a divider |");
	await expect(editor).toHaveAttribute("aria-invalid", "true");
	const invalidBox = await pane.locator(".cm-editor").boundingBox();
	expect(invalidBox).not.toBeNull();
	expect(invalidBox?.height).toBeCloseTo(healthyBox?.height ?? 0, 0);

	const descriptionId = await editor.getAttribute("aria-describedby");
	expect(descriptionId).toBeTruthy();
	await expect(pane.locator(`#${descriptionId}`)).toContainText("Line 2:");
	await expect(pane.getByText("Details", { exact: true })).toHaveCount(0);
});
