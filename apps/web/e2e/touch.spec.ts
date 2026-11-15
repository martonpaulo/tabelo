import { copy } from "@/copy/copy";
import { expect, test } from "./fixtures";
import { activeTableName } from "./helpers";

// A phone: a touch screen that cannot hover, at a phone's width. What a
// pointer reveals on hover has to be reachable here by a tap alone.
test.use({
	hasTouch: true,
	isMobile: true,
	viewport: { width: 390, height: 844 },
});

test("a table row's options control is drawn and opens its menu on a tap (#552)", async ({
	tabelo: _tabelo,
	page,
}) => {
	expect(await page.evaluate(() => matchMedia("(hover: none)").matches)).toBe(
		true,
	);
	await page.getByRole("button", { name: copy.actions.openAppMenu }).tap();
	const menu = page.getByRole("menu", { name: copy.actions.openAppMenu });
	await expect(menu).toBeVisible();

	const name = copy.actions.tableOptionsNamed(await activeTableName(page));
	const options = menu.getByRole("menuitem", { name, exact: true });
	// Playwright counts an element at zero opacity as visible, so the opacity
	// the control computes is what says whether it can be seen.
	await expect(options).toHaveCSS("opacity", "1");

	await options.tap();
	await expect(page.getByRole("menu", { name, exact: true })).toBeVisible();
});
