import { copy } from "@/ui/copy";
import { expect, test } from "./fixtures";

// A tinted background and an aria-hidden tick tell a sighted user which option
// is current and tell everyone else nothing. Every mutually exclusive choice in
// the product is a radio group, so the state is in the accessibility tree
// rather than only in the pixels.

test("the layout menu reports the current preset", async ({ tabelo }) => {
	await expect(tabelo.workspace).toBeVisible();
	const menu = await tabelo.openLayoutMenu();

	const options = menu.getByRole("menuitemradio");
	await expect(options).toHaveCount(7);
	await expect(menu.getByRole("menuitemradio", { checked: true })).toHaveCount(
		1,
	);
	await expect(
		menu.getByRole("menuitemradio", { name: copy.layouts.columns.label }),
	).toBeChecked();

	await menu
		.getByRole("menuitemradio", { name: copy.layouts.quad.label })
		.click();

	const reopened = await tabelo.openLayoutMenu();
	await expect(
		reopened.getByRole("menuitemradio", { checked: true }),
	).toHaveCount(1);
	await expect(
		reopened.getByRole("menuitemradio", { name: copy.layouts.quad.label }),
	).toBeChecked();
});

test("the view list reports what the pane is showing", async ({ tabelo }) => {
	const menu = await tabelo.openPaneMenu("markdown");
	await expect(menu.getByRole("menuitemradio")).toHaveCount(8);
	await expect(menu.getByRole("menuitemradio", { checked: true })).toHaveCount(
		1,
	);
	await expect(
		menu.getByRole("menuitemradio", { name: copy.views.markdown.label }),
	).toBeChecked();

	await menu.getByRole("menuitemradio", { name: copy.views.csv.label }).click();

	const reopened = await tabelo.openPaneMenu("csv");
	await expect(
		reopened.getByRole("menuitemradio", { name: copy.views.csv.label }),
	).toBeChecked();
	await expect(
		reopened.getByRole("menuitemradio", { name: copy.views.markdown.label }),
	).not.toBeChecked();
});

test("a view already open elsewhere is disabled and explains why", async ({
	page,
	tabelo,
}) => {
	const menu = await tabelo.openPaneMenu("markdown");
	const blocked = menu.getByRole("menuitemradio", {
		name: copy.views.grid.label,
	});
	await expect(blocked).toBeDisabled();
	await blocked.hover();
	await expect(
		page.getByRole("tooltip", {
			name: copy.disabled.viewAlreadyOpen(copy.views.grid.label),
		}),
	).toBeVisible();
	await expect(
		menu.getByRole("menuitemradio", { name: copy.views.markdown.label }),
	).toBeChecked();
});

// The pane refuses a view change while a draft does not parse. The menu must
// report what the pane is actually showing, not what was clicked.
test("a refused view change leaves the checked option truthful", async ({
	tabelo,
}) => {
	await tabelo.source("markdown").fill("| Name |\n| not a divider |");
	await expect(tabelo.source("markdown")).toHaveAttribute(
		"aria-invalid",
		"true",
	);

	const menu = await tabelo.openPaneMenu("markdown");
	await menu.getByRole("menuitemradio", { name: copy.views.csv.label }).click();

	const reopened = await tabelo.openPaneMenu("markdown");
	await expect(
		reopened.getByRole("menuitemradio", { name: copy.views.markdown.label }),
	).toBeChecked();
	await expect(
		reopened.getByRole("menuitemradio", { name: copy.views.csv.label }),
	).not.toBeChecked();
});

test("column alignment reports the current choice", async ({
	page,
	tabelo,
}) => {
	await tabelo
		.grid()
		.getByRole("button", {
			name: new RegExp(`^${copy.actions.columnActions}:`),
		})
		.first()
		.click();
	const menu = page.getByRole("menu", {
		name: new RegExp(`^${copy.actions.columnActions}:`),
	});

	const alignments = menu.getByRole("menuitemradio");
	await expect(alignments).toHaveCount(4);
	await expect(menu.getByRole("menuitemradio", { checked: true })).toHaveCount(
		1,
	);
	await expect(
		menu.getByRole("menuitemradio", { name: copy.actions.alignDefault }),
	).toBeChecked();

	await menu
		.getByRole("menuitemradio", { name: copy.actions.alignCenter })
		.click();

	await tabelo
		.grid()
		.getByRole("button", {
			name: new RegExp(`^${copy.actions.columnActions}:`),
		})
		.first()
		.click();
	const reopened = page.getByRole("menu", {
		name: new RegExp(`^${copy.actions.columnActions}:`),
	});
	await expect(
		reopened.getByRole("menuitemradio", { name: copy.actions.alignCenter }),
	).toBeChecked();
	await expect(
		reopened.getByRole("menuitemradio", { checked: true }),
	).toHaveCount(1);
});

test("choosing with the keyboard still works and returns focus", async ({
	page,
	tabelo,
}) => {
	// The fixture is what opens the app, so it is requested even where the
	// assertions read from `page`.
	await expect(tabelo.workspace).toBeVisible();
	const trigger = page.getByRole("button", { name: copy.actions.openAppMenu });
	const menu = await tabelo.openLayoutMenu();
	await expect(menu).toBeVisible();

	// Enter chooses the focused radio option and returns focus to the FAB.
	await menu
		.getByRole("menuitemradio", { name: copy.layouts.quad.label })
		.focus();
	await page.keyboard.press("Enter");

	await expect(menu).toHaveCount(0);
	await expect(trigger).toBeFocused();

	const reopened = await tabelo.openLayoutMenu();
	await expect(
		reopened.getByRole("menuitemradio", {
			checked: true,
		}),
	).toHaveCount(1);

	// Escape closes without choosing.
	await page.keyboard.press("Escape");
	await page.keyboard.press("Escape");
	await expect(reopened).toHaveCount(0);
	await expect(trigger).toBeFocused();
});

test("no choice depends on colour or a hidden icon alone", async ({
	tabelo,
}) => {
	await expect(tabelo.workspace).toBeVisible();
	const menu = await tabelo.openLayoutMenu();

	// Every option carries its state as a role and aria-checked, so nothing is
	// left to a tint that a screen reader cannot see.
	const states = await menu
		.locator('[role="menuitemradio"]')
		.evaluateAll((items) =>
			items.map((item) => item.getAttribute("aria-checked")),
		);
	expect(states).toHaveLength(7);
	expect(states.filter((state) => state === "true")).toHaveLength(1);
	expect(states.every((state) => state === "true" || state === "false")).toBe(
		true,
	);
});
