import { expect, test } from "./fixtures";

// A tinted background and an aria-hidden tick tell a sighted user which option
// is current and tell everyone else nothing. Every mutually exclusive choice in
// the product is a radio group, so the state is in the accessibility tree
// rather than only in the pixels.

test("the layout menu reports the current preset", async ({ page, tabelo }) => {
	await expect(tabelo.workspace).toBeVisible();
	await page.getByRole("button", { name: /^Layout:/ }).click();
	const menu = page.getByRole("menu", { name: /^Layout:/ });

	const options = menu.getByRole("menuitemradio");
	await expect(options).toHaveCount(8);
	await expect(menu.getByRole("menuitemradio", { checked: true })).toHaveCount(
		1,
	);
	await expect(
		menu.getByRole("menuitemradio", { name: /Two columns/ }),
	).toBeChecked();

	await menu.getByRole("menuitemradio", { name: /Four panes/ }).click();

	await page.getByRole("button", { name: /^Layout:/ }).click();
	const reopened = page.getByRole("menu", { name: /^Layout:/ });
	await expect(
		reopened.getByRole("menuitemradio", { checked: true }),
	).toHaveCount(1);
	await expect(
		reopened.getByRole("menuitemradio", { name: /Four panes/ }),
	).toBeChecked();
});

test("the view list reports what the pane is showing", async ({
	page,
	tabelo,
}) => {
	const menu = await tabelo.openPaneMenu("Markdown");
	await expect(menu.getByRole("menuitemradio")).toHaveCount(7);
	await expect(menu.getByRole("menuitemradio", { checked: true })).toHaveCount(
		1,
	);
	await expect(
		menu.getByRole("menuitemradio", { name: /Markdown/ }),
	).toBeChecked();

	await menu.getByRole("menuitemradio", { name: /^CSV/ }).click();

	const reopened = await tabelo.openPaneMenu("CSV");
	await expect(
		reopened.getByRole("menuitemradio", { name: /^CSV/ }),
	).toBeChecked();
	await expect(
		reopened.getByRole("menuitemradio", { name: /Markdown/ }),
	).not.toBeChecked();
});

// The pane refuses a view change while a draft does not parse. The menu must
// report what the pane is actually showing, not what was clicked.
test("a refused view change leaves the checked option truthful", async ({
	tabelo,
}) => {
	await tabelo.source("Markdown").fill("| Name |\n| not a divider |");
	await expect(tabelo.source("Markdown")).toHaveAttribute(
		"aria-invalid",
		"true",
	);

	const menu = await tabelo.openPaneMenu("Markdown");
	await menu.getByRole("menuitemradio", { name: /^CSV/ }).click();

	const reopened = await tabelo.openPaneMenu("Markdown");
	await expect(
		reopened.getByRole("menuitemradio", { name: /Markdown/ }),
	).toBeChecked();
	await expect(
		reopened.getByRole("menuitemradio", { name: /^CSV/ }),
	).not.toBeChecked();
});

test("column alignment reports the current choice", async ({
	page,
	tabelo,
}) => {
	await tabelo
		.grid()
		.getByRole("button", { name: /^Column actions: / })
		.first()
		.click();
	const menu = page.getByRole("menu", { name: /^Column actions: / });

	const alignments = menu.getByRole("menuitemradio");
	await expect(alignments).toHaveCount(4);
	await expect(menu.getByRole("menuitemradio", { checked: true })).toHaveCount(
		1,
	);
	await expect(
		menu.getByRole("menuitemradio", { name: "No alignment" }),
	).toBeChecked();

	await menu.getByRole("menuitemradio", { name: "Align center" }).click();

	await tabelo
		.grid()
		.getByRole("button", { name: /^Column actions: / })
		.first()
		.click();
	const reopened = page.getByRole("menu", { name: /^Column actions: / });
	await expect(
		reopened.getByRole("menuitemradio", { name: "Align center" }),
	).toBeChecked();
	await expect(
		reopened.getByRole("menuitemradio", { checked: true }),
	).toHaveCount(1);
});

test("choosing with the keyboard still works and returns focus", async ({
	page,
	tabelo,
}) => {
	const trigger = page.getByRole("button", { name: /^Layout:/ });
	await trigger.click();
	const menu = page.getByRole("menu", { name: /^Layout:/ });
	await expect(menu).toBeVisible();

	// Arrows move through the options, Enter chooses, focus comes back.
	await page.keyboard.press("ArrowDown");
	await page.keyboard.press("ArrowDown");
	await page.keyboard.press("Enter");

	await expect(menu).toHaveCount(0);
	await expect(trigger).toBeFocused();

	await trigger.click();
	await expect(
		page.getByRole("menu", { name: /^Layout:/ }).getByRole("menuitemradio", {
			checked: true,
		}),
	).toHaveCount(1);

	// Escape closes without choosing.
	await page.keyboard.press("Escape");
	await expect(page.getByRole("menu", { name: /^Layout:/ })).toHaveCount(0);
	await expect(trigger).toBeFocused();
});

test("no choice depends on colour or a hidden icon alone", async ({
	page,
	tabelo,
}) => {
	await expect(tabelo.workspace).toBeVisible();
	await page.getByRole("button", { name: /^Layout:/ }).click();

	// Every option carries its state as a role and aria-checked, so nothing is
	// left to a tint that a screen reader cannot see.
	const states = await page
		.getByRole("menu", { name: /^Layout:/ })
		.locator('[role="menuitemradio"]')
		.evaluateAll((items) =>
			items.map((item) => item.getAttribute("aria-checked")),
		);
	expect(states).toHaveLength(8);
	expect(states.filter((state) => state === "true")).toHaveLength(1);
	expect(states.every((state) => state === "true" || state === "false")).toBe(
		true,
	);
});
