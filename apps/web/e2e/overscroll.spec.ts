import { copy } from "@/ui/copy";
import { expect, test } from "./fixtures";

test("every scroll boundary prevents scroll chaining on both axes", async ({
	page,
	tabelo,
}) => {
	await expect(page.locator("html")).toHaveCSS("overscroll-behavior", "none");
	await expect(page.locator("body")).toHaveCSS("overscroll-behavior", "none");
	await expect(tabelo.workspace).toHaveCSS("overscroll-behavior", "contain");

	const paneBodies = tabelo.workspace.locator('[data-slot="panel-body"]');
	await expect(paneBodies).toHaveCount(2);
	for (const paneBody of await paneBodies.all()) {
		await expect(paneBody).toHaveCSS("overscroll-behavior", "contain");
	}

	await expect(tabelo.workspace.locator(".cm-scroller")).toHaveCSS(
		"overscroll-behavior",
		"contain",
	);

	const paneMenu = await tabelo.openPaneMenu("markdown");
	await expect(paneMenu).toHaveCSS("overscroll-behavior", "contain");
	await paneMenu
		.getByRole("menuitemradio", { name: copy.views["html-preview"].label })
		.click();
	await expect(
		tabelo.workspace.locator('[data-slot="preview-scroller"]'),
	).toHaveCSS("overscroll-behavior", "contain");

	await page.setViewportSize({ width: 600, height: 700 });
	await expect(tabelo.workspace).toHaveCSS("overflow-y", "auto");
	await expect(tabelo.workspace).toHaveCSS("overscroll-behavior", "contain");
});
