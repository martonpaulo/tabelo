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

test("tapping a disabled control shows why it is disabled (#553)", async ({
	tabelo: _tabelo,
	page,
}) => {
	await page.getByRole("button", { name: copy.actions.openAppMenu }).tap();
	const menu = page.getByRole("menu", { name: copy.actions.openAppMenu });
	// Two stacked panes already fill a phone, so a third view is refused.
	const addView = menu.getByRole("menuitem", {
		name: copy.workspace.addViewCommand,
		exact: true,
	});
	await expect(addView).toHaveAttribute("aria-disabled", "true");
	await expect(addView).toHaveAccessibleDescription(/\S/);
	await expect(page.getByRole("tooltip")).toHaveCount(0);

	// Forced, because Playwright will not tap what reports itself disabled,
	// and a person's finger lands on it all the same.
	await addView.tap({ force: true });
	const tooltip = page.locator('[role="tooltip"][data-open]');
	await expect(tooltip).toBeVisible();
	const reason = (await tooltip.innerText()).trim();
	expect(reason).not.toBe("");
	await expect(addView).toHaveAccessibleDescription(reason);

	// Still disabled: the tap explained the control and did not run it.
	await expect(addView).toHaveAttribute("aria-disabled", "true");
	await expect(page.getByRole("dialog")).toHaveCount(0);

	// A tap anywhere else puts the reason away again.
	await menu.getByText(copy.menuSections.tables, { exact: true }).tap();
	await expect(tooltip).toHaveCount(0);
});
