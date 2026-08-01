import { copy } from "@/copy/copy";
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

	const paneMenu = await tabelo.openPaneViewMenu("markdown");
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

test("wheel input at a pane boundary does not move its parent or the page", async ({
	browserName,
	page,
	tabelo,
}) => {
	// Firefox WebDriver wheel actions can collapse into one APZ transaction:
	// https://bugzilla.mozilla.org/show_bug.cgi?id=1918806
	test.skip(
		browserName === "firefox",
		"Firefox WebDriver wheel transactions cannot reliably exercise this boundary.",
	);

	const columns = Array.from(
		{ length: 20 },
		(_, index) => `Column ${index + 1}`,
	);
	const row = columns.map((_, index) => `Value ${index + 1}`);
	const source = [
		columns.join("\t"),
		...Array.from({ length: 200 }, () => row.join("\t")),
	].join("\n");

	await tabelo.paste(source);
	await expect(tabelo.grid()).toHaveAttribute("aria-rowcount", "201");
	await page.setViewportSize({ width: 600, height: 700 });

	const paneScroller = tabelo.pane("grid").locator('[data-slot="panel-body"]');
	await expect
		.poll(() =>
			paneScroller.evaluate(
				(element) =>
					element.scrollHeight > element.clientHeight &&
					element.scrollWidth > element.clientWidth,
			),
		)
		.toBe(true);

	await paneScroller.evaluate((element) => {
		element.scrollTop = element.scrollHeight;
		element.scrollLeft = element.scrollWidth;
	});
	await expect
		.poll(() =>
			paneScroller.evaluate(
				(element) =>
					element.scrollTop === element.scrollHeight - element.clientHeight &&
					element.scrollLeft === element.scrollWidth - element.clientWidth,
			),
		)
		.toBe(true);
	await paneScroller.hover();
	const workspaceBeforeWheel = await tabelo.workspace.evaluate((workspace) => ({
		left: workspace.scrollLeft,
		top: workspace.scrollTop,
	}));
	await page.mouse.wheel(0, 1_000);

	await expect
		.poll(() =>
			tabelo.workspace.evaluate((workspace) => ({
				left: workspace.scrollLeft,
				top: workspace.scrollTop,
			})),
		)
		.toEqual(workspaceBeforeWheel);
	await expect
		.poll(() => page.evaluate(() => ({ left: scrollX, top: scrollY })))
		.toEqual({ left: 0, top: 0 });
});
