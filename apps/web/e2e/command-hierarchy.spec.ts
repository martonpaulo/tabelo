import { expect, test } from "./fixtures";

test("document actions use a compact, explicit command hierarchy", async ({
	page,
	tabelo,
}) => {
	await expect(tabelo.workspace).toBeVisible();
	const header = page.getByRole("banner");

	expect(await header.getByRole("button").count()).toBeLessThan(7);
	await expect(header.getByRole("button", { name: "File" })).toBeVisible();
	await expect(header.getByRole("button", { name: /^Layout:/ })).toContainText(
		"Layout",
	);
	await expect(header.getByRole("button", { name: "Import file" })).toHaveCount(
		0,
	);
	await expect(header.getByRole("button", { name: "New table" })).toHaveCount(
		0,
	);

	await header.getByRole("button", { name: "File" }).click();
	const menu = page.getByRole("menu", { name: "File" });
	await expect(menu.getByRole("menuitem", { name: "New table" })).toBeVisible();
	await expect(
		menu.getByRole("menuitem", { name: "Import file" }),
	).toBeVisible();
	await expect(menu.getByText("Download as")).toBeVisible();
	await expect(menu.getByRole("menuitem", { name: /Markdown/ })).toBeVisible();
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
	await expect(menu.getByRole("menuitem", { name: /CSV/ })).toBeVisible();
	await expect(
		menu.getByRole("menuitem", { name: "Copy source" }),
	).toBeVisible();
});

test("source feedback overlays the editor without reserving healthy space", async ({
	tabelo,
}) => {
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
	await expect(pane.locator(`#${descriptionId}`)).toBeVisible();
});
