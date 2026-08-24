import type { Locator } from "@playwright/test";
import { copy } from "@/copy/copy";
import { expect, test } from "./fixtures";

async function expectDialogOptionAnatomy(dialog: Locator, expected: number) {
	const list = dialog.getByRole("radiogroup");
	const options = dialog.getByRole("radio");
	await expect(options).toHaveCount(expected);
	await expect(
		dialog.locator('[data-slot="selection-option-icon"]'),
	).toHaveCount(expected);
	await expect(dialog.locator('[data-slot="radio-group-item"]')).toHaveCount(
		expected,
	);
	const radioLayer = dialog.locator('[data-slot="radio-group-item"]').first();
	await expect(radioLayer).toHaveCSS("position", "absolute");
	await expect(radioLayer).toHaveCSS("opacity", "0");
	await expect(list).toHaveCSS("overflow-x", "visible");
	await expect(list).toHaveCSS("overflow-y", "visible");
	expect(
		await list.evaluate(
			(element) =>
				element.scrollWidth <= element.clientWidth &&
				element.scrollHeight <= element.clientHeight,
		),
	).toBe(true);
}

test("the Layout command opens one dialog and applies its selected preset", async ({
	page,
	tabelo,
}) => {
	const trigger = page.getByRole("button", { name: copy.actions.openAppMenu });
	const dialog = await tabelo.openLayoutDialog();

	// Two panes are open, so the dialog offers the two arrangements of two panes
	// and nothing that would add or close one.
	await expectDialogOptionAnatomy(dialog, 2);
	await expect(dialog.getByRole("radio", { checked: true })).toHaveCount(1);
	await expect(
		dialog.getByRole("radio", { name: copy.layouts.columns.label }),
	).toBeChecked();
	await expect(
		dialog.getByRole("radio", { name: copy.layouts.quad.label }),
	).toHaveCount(0);
	const apply = dialog.getByRole("button", {
		name: copy.workspace.applyLayout,
	});
	await expect(apply).toBeDisabled();
	await apply.hover();
	await expect(page.getByRole("tooltip")).toBeVisible();
	await expect(
		page.getByRole("menu", { name: copy.actions.openAppMenu }),
	).toBeHidden();

	await dialog.getByRole("radio", { name: copy.layouts.rows.label }).click();
	await expect(apply).toBeEnabled();
	await apply.click();
	await expect(dialog).toBeHidden();
	await expect(trigger).toBeFocused();
	// The arrangement changed and the pane count did not, which is the whole
	// contract of the command.
	await expect(tabelo.workspace.getByRole("region")).toHaveCount(2);
	await expect(await tabelo.paneArea("grid")).toMatchObject({
		rowStart: 1,
		rowEnd: 2,
		columnStart: 1,
		columnEnd: 3,
	});
});

test("pane identity is static and Change view is a dialog from pane actions", async ({
	tabelo,
}) => {
	const pane = tabelo.pane("markdown");
	const heading = pane.getByRole("heading", {
		name: copy.views.markdown.label,
	});
	await expect(heading).toBeVisible();
	await expect(heading.getByRole("button")).toHaveCount(0);

	const dialog = await tabelo.openChangeViewDialog("markdown");
	await expectDialogOptionAnatomy(dialog, 9);
	await expect(
		dialog.getByRole("radio", { name: copy.views.markdown.label }),
	).toBeChecked();
	const change = dialog.getByRole("button", {
		name: copy.workspace.changeView,
	});
	await expect(change).toBeDisabled();

	await dialog.getByRole("radio", { name: copy.views.csv.label }).click();
	await expect(change).toBeEnabled();
	await change.click();
	await expect(dialog).toBeHidden();
	await expect(tabelo.pane("csv")).toBeVisible();
	await expect(tabelo.paneMenuTrigger("csv")).toBeFocused();
});

test("disabled view choices distinguish in-use and unavailable states", async ({
	page,
	tabelo,
}) => {
	const dialog = await tabelo.openChangeViewDialog("markdown");
	const inUseRow = dialog.locator('label[data-availability="in-use"]');
	const unavailableRow = dialog.locator(
		'label[data-availability="unavailable"]',
	);

	await expect(inUseRow).toHaveCount(1);
	// A new table's blank first column fails records' precondition. JSON keys
	// an unnamed column by its letter, so it is available.
	await expect(unavailableRow).toHaveCount(1);
	await expect(inUseRow.getByRole("radio")).toBeDisabled();
	for (const row of await unavailableRow.all()) {
		await expect(row.getByRole("radio")).toBeDisabled();
		await expect(
			row.locator('[data-slot="selection-option-status"] svg'),
		).toBeVisible();
	}
	await expect(
		inUseRow.locator('[data-slot="selection-option-status"] svg'),
	).toBeVisible();

	await inUseRow.hover();
	await expect(page.getByRole("tooltip")).toBeVisible();
	await unavailableRow.first().hover();
	await expect(page.getByRole("tooltip")).toBeVisible();
});

// A disabled reason that only hover can reach is a reason keyboard users never
// get. See docs/design-system.md §9.
test("a disabled menu item explains itself on keyboard highlight", async ({
	page,
	tabelo,
}) => {
	await tabelo.chooseLayout("single");
	const menu = await tabelo.openPaneMenu("grid");
	await expect(menu).toBeVisible();

	const disabled = menu.getByRole("menuitem", {
		name: copy.workspace.closeView,
	});
	await expect(disabled).toBeDisabled();

	for (let step = 0; step < 12; step += 1) {
		if ((await page.getByRole("tooltip").count()) > 0) break;
		await page.keyboard.press("ArrowDown");
	}
	await expect(page.getByRole("tooltip")).toBeVisible();
});

test("option highlights include descriptions and disabled rows stay inert", async ({
	tabelo,
}) => {
	const dialog = await tabelo.openChangeViewDialog("markdown");
	const availableRow = dialog
		.getByRole("radio", { name: copy.views.csv.label })
		.locator("..");
	const description = availableRow.locator(
		'[data-slot="menu-option-description"]',
	);
	const restingDescription = await description.evaluate(
		(element) => getComputedStyle(element).color,
	);
	await availableRow.hover();
	const highlightedLabel = await availableRow
		.locator('[data-slot="menu-option-label"]')
		.evaluate((element) => getComputedStyle(element).color);
	await expect(description).toHaveCSS("color", highlightedLabel);
	const highlightedDescription = await description.evaluate(
		(element) => getComputedStyle(element).color,
	);
	expect(highlightedDescription).toBe(highlightedLabel);
	expect(highlightedDescription).not.toBe(restingDescription);

	const disabledChoice = dialog.locator('label[data-availability="in-use"]');
	const choiceBackground = await disabledChoice.evaluate(
		(element) => getComputedStyle(element).backgroundColor,
	);
	await disabledChoice.hover();
	await expect(disabledChoice).toHaveCSS("background-color", choiceBackground);
	await expect(disabledChoice).toHaveCSS("cursor", "not-allowed");
	await expect(disabledChoice.getByRole("radio")).toHaveCSS(
		"cursor",
		"not-allowed",
	);
	await dialog.getByRole("button", { name: copy.actions.cancel }).click();

	const menu = await tabelo.openPaneMenu("markdown");
	const disabledCommand = menu.getByRole("menuitem", {
		name: copy.workspace.resetZoom,
	});
	const commandBackground = await disabledCommand.evaluate(
		(element) => getComputedStyle(element).backgroundColor,
	);
	const restingCommandColors = await disabledCommand.evaluate((element) =>
		[...element.querySelectorAll("svg, kbd")].map(
			(child) => getComputedStyle(child).color,
		),
	);
	await disabledCommand.hover();
	await expect(disabledCommand).toHaveCSS(
		"background-color",
		commandBackground,
	);
	await expect(disabledCommand).toHaveCSS("cursor", "not-allowed");
	expect(
		await disabledCommand.evaluate((element) =>
			[...element.querySelectorAll("svg, kbd")].map(
				(child) => getComputedStyle(child).color,
			),
		),
	).toEqual(restingCommandColors);

	await tabelo.page.keyboard.press("Escape");
	const appMenu = await tabelo.openAppMenu();
	const redoItem = appMenu.getByRole("menuitem", { name: copy.actions.redo });
	const redoShortcut = redoItem.locator("kbd");
	// The visible legend follows the keyboard the user actually has: glyphs on
	// Apple platforms, the printed words everywhere else. The expectation comes
	// from the OS running the browser rather than from the app's own detection,
	// so the two have to agree independently.
	const apple = process.platform === "darwin";
	await expect(
		redoShortcut.filter({ hasText: apple ? "⇧" : "Shift" }),
	).toHaveCount(1);
	await expect(
		redoShortcut.filter({ hasText: apple ? "Shift" : "⇧" }),
	).toHaveCount(0);
	// Either way the accessible name keeps the full key name, so the compact
	// legend never reaches a screen reader as a lone symbol.
	await expect(redoItem).toHaveAccessibleName(/Shift/);
});

test("column choices use the shared one-line radio anatomy", async ({
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
	const expectedType = menu.getByRole("group", {
		name: copy.actions.expectedType,
	});

	await expect(expectedType.getByRole("menuitemradio")).toHaveCount(3);
	await expect(menu.locator('[data-slot="selection-option-icon"]')).toHaveCount(
		3,
	);
	await expect(
		menu.locator('[data-slot="dropdown-menu-radio-item-indicator"]'),
	).toHaveCount(0);
	await expect(
		expectedType.getByRole("menuitemradio", { checked: true }),
	).toHaveCount(1);

	// Alignment kept every one of those semantics when it moved behind a
	// submenu trigger: the same radio anatomy, one checked value read from the
	// column, and a choice that survives closing and reopening the menu.
	await page.keyboard.press("Escape");
	const alignment = await tabelo.openAlignmentSubmenu(1);
	await expect(alignment.getByRole("menuitemradio")).toHaveCount(4);
	await expect(
		alignment.locator('[data-slot="selection-option-icon"]'),
	).toHaveCount(4);
	await expect(
		alignment.locator('[data-slot="dropdown-menu-radio-item-indicator"]'),
	).toHaveCount(0);
	await expect(
		alignment.getByRole("menuitemradio", { checked: true }),
	).toHaveCount(1);

	await alignment
		.getByRole("menuitemradio", { name: copy.actions.alignCenter })
		.click();
	await expect(
		(await tabelo.openAlignmentSubmenu(1)).getByRole("menuitemradio", {
			name: copy.actions.alignCenter,
		}),
	).toBeChecked();
});

test("the alignment submenu opens, closes, and returns focus from the keyboard", async ({
	page,
	tabelo,
}) => {
	const trigger = tabelo.columnIndex(1).getByRole("button", {
		name: new RegExp(`^${copy.actions.columnActions}:`),
	});
	await trigger.click();
	const root = page.getByRole("menu", {
		name: new RegExp(`^${copy.actions.columnActions}:`),
	});
	const submenu = page.getByRole("menu", { name: copy.actions.alignment });
	const submenuTrigger = root.getByRole("menuitem", {
		name: copy.actions.alignment,
	});

	// ArrowRight opens the child menu and moves into it; ArrowLeft returns to
	// the trigger without closing the menu the user started from.
	await submenuTrigger.focus();
	await page.keyboard.press("ArrowRight");
	await expect(submenu).toBeVisible();
	await expect(
		submenu.getByRole("menuitemradio", { name: copy.actions.alignDefault }),
	).toBeFocused();
	await page.keyboard.press("ArrowLeft");
	await expect(submenu).toBeHidden();
	await expect(root).toBeVisible();
	await expect(submenuTrigger).toBeFocused();

	// Escape from inside the child menu unwinds one level at a time, and the
	// grid trigger gets focus back at the end rather than the document body.
	await page.keyboard.press("ArrowRight");
	await expect(submenu).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(submenu).toBeHidden();
	await expect(root).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(root).toBeHidden();
	await expect(trigger).toBeFocused();
});

test("the alignment submenu stays inside a narrow viewport", async ({
	page,
	tabelo,
}) => {
	await page.setViewportSize({ width: 320, height: 568 });
	const submenu = await tabelo.openAlignmentSubmenu(1);
	const box = await submenu.boundingBox();
	expect(box).not.toBeNull();
	expect(box?.x ?? -1).toBeGreaterThanOrEqual(0);
	expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(320);
	expect(box?.y ?? -1).toBeGreaterThanOrEqual(0);
	expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(568);
});

test("table menus preserve named and unnamed semantic groups", async ({
	page,
	tabelo,
}) => {
	const trigger = tabelo
		.grid()
		.getByRole("button", {
			name: new RegExp(`^${copy.actions.columnActions}:`),
		})
		.first();
	await trigger.click();
	let menu = page.getByRole("menu", {
		name: new RegExp(`^${copy.actions.columnActions}:`),
	});

	const dropdownGroups = menu.locator(
		'[data-slot="dropdown-menu-group"], [data-slot="dropdown-menu-radio-group"]',
	);
	await expect(dropdownGroups).toHaveCount(7);
	await expect(
		menu.getByRole("group", { name: copy.actions.expectedType }),
	).toHaveCount(1);
	// Alignment is one row of the root menu now, and its group travelled with
	// it into the child menu rather than staying behind as an empty label.
	await expect(
		menu.getByRole("group", { name: copy.actions.alignment }),
	).toHaveCount(0);
	await expect(
		menu.getByRole("menuitem", { name: copy.actions.alignment }),
	).toHaveCount(1);
	await expect(
		menu.getByRole("group", { name: copy.actions.edit }),
	).toHaveCount(1);
	await expect(
		menu.getByRole("group", { name: copy.actions.move }),
	).toHaveCount(1);
	await expect(menu.locator('[data-slot="dropdown-menu-label"]')).toHaveCount(
		3,
	);
	await expect(dropdownGroups.locator(":scope[aria-labelledby]")).toHaveCount(
		3,
	);
	await expect(
		dropdownGroups.locator(":scope:not([aria-labelledby])"),
	).toHaveCount(4);

	await page.keyboard.press("Escape");
	await expect(trigger).toBeFocused();
	await tabelo.cell(1, 1).click({ button: "right" });
	menu = page.locator('[data-slot="context-menu-content"]');
	await expect(menu).toBeVisible();
	const contextGroups = menu.locator(
		'[data-slot="context-menu-group"], [data-slot="context-menu-radio-group"]',
	);
	await expect(contextGroups).toHaveCount(7);
	await expect(
		menu.getByRole("group", { name: copy.actions.cellType }),
	).toHaveCount(1);
	await expect(
		menu.getByRole("group", { name: copy.actions.edit }),
	).toHaveCount(1);
	await expect(
		menu.getByRole("group", { name: copy.actions.fill }),
	).toHaveCount(1);
	await expect(
		menu.getByRole("group", { name: copy.actions.move }),
	).toHaveCount(1);
	await expect(contextGroups.locator(":scope[aria-labelledby]")).toHaveCount(4);
	await expect(
		contextGroups.locator(":scope:not([aria-labelledby])"),
	).toHaveCount(3);
});

test("column menu labels stay out of traversal and the menu scrolls when narrow", async ({
	page,
	tabelo,
}) => {
	await page.setViewportSize({ width: 320, height: 568 });
	const trigger = tabelo
		.grid()
		.getByRole("button", {
			name: new RegExp(`^${copy.actions.columnActions}:`),
		})
		.first();
	await trigger.click();
	const menu = page.getByRole("menu", {
		name: new RegExp(`^${copy.actions.columnActions}:`),
	});
	await expect(menu).toHaveCSS("overflow-y", "auto");
	expect(
		await menu.evaluate(
			(element) => element.scrollHeight > element.clientHeight,
		),
	).toBe(true);

	for (let step = 0; step < 12; step += 1) {
		await page.keyboard.press("ArrowDown");
		expect(
			await page.evaluate(() =>
				document.activeElement?.matches(
					'[data-slot="dropdown-menu-label"], [data-slot="context-menu-label"]',
				),
			),
		).toBe(false);
	}
	const box = await menu.boundingBox();
	expect(box).not.toBeNull();
	expect(box?.y ?? -1).toBeGreaterThanOrEqual(0);
	expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(568);

	await page.keyboard.press("Escape");
	await expect(trigger).toBeFocused();
});

test("destructive menu actions keep one color across label and icon", async ({
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
	const action = page.getByRole("menuitem", {
		name: copy.actions.deleteColumns(1),
	});
	await action.hover();

	const colors = await action.evaluate((element) => ({
		icon: getComputedStyle(element.querySelector("svg") as SVGElement).color,
		label: getComputedStyle(element).color,
	}));
	expect(colors.icon).toBe(colors.label);
});

test("New table is destructive while Close view stays neutral", async ({
	page,
	tabelo,
}) => {
	const appMenu = await tabelo.openAppMenu();
	await expect(
		appMenu.getByRole("menuitem", { name: copy.actions.newTable }),
	).toHaveAttribute("data-variant", "destructive");
	await page.keyboard.press("Escape");

	const paneMenu = await tabelo.openPaneMenu("markdown");
	await expect(
		paneMenu.getByRole("menuitem", { name: copy.workspace.closeView }),
	).toHaveAttribute("data-variant", "default");
});

test("Add view and Download reuse the dialog option anatomy", async ({
	page,
	tabelo,
}) => {
	await tabelo.splitControl("grid", "bottom").click();
	const addDialog = page.getByRole("dialog", { name: copy.addView.title });
	await expectDialogOptionAnatomy(addDialog, 9);
	await addDialog.getByRole("button", { name: copy.actions.cancel }).click();

	await tabelo.runAppCommand("downloadTable");
	const downloadDialog = page.getByRole("dialog", {
		name: copy.download.title,
	});
	await expectDialogOptionAnatomy(downloadDialog, 7);
	await expect(
		downloadDialog.locator('[data-slot="selection-option-metadata"]'),
	).toHaveCount(7);
});

test("dialog radio choices support the keyboard and Cancel restores focus", async ({
	page,
	tabelo,
}) => {
	const trigger = page.getByRole("button", { name: copy.actions.openAppMenu });
	const dialog = await tabelo.openLayoutDialog();
	const option = dialog.getByRole("radio", { name: copy.layouts.rows.label });
	await option.focus();
	await page.keyboard.press("Space");
	await expect(option).toBeChecked();

	await dialog.getByRole("button", { name: copy.actions.cancel }).click();
	await expect(dialog).toBeHidden();
	await expect(trigger).toBeFocused();
});

// The only submenu class docs/design-system.md §3 allows: a flat list of
// immediate commands. It is also the first place in this product where focus
// could be trapped, so the whole open-and-leave path is walked by keyboard.
test("the Copy as submenu opens, navigates, and closes without trapping focus", async ({
	page,
	tabelo,
}) => {
	const menu = await tabelo.openAppMenu();
	const parentItem = menu.getByRole("menuitem", { name: copy.actions.copyAs });

	// The trigger says it opens something and says whether it is open, so a
	// screen reader announces the submenu before it is entered.
	await expect(parentItem).toHaveAttribute("aria-haspopup", "menu");
	await expect(parentItem).toHaveAttribute("aria-expanded", "false");

	await parentItem.focus();
	await page.keyboard.press("ArrowRight");
	const submenu = page.getByRole("menu", { name: copy.actions.copyAs });
	await expect(submenu).toBeVisible();
	await expect(parentItem).toHaveAttribute("aria-expanded", "true");

	// Arrow navigation reaches the rows rather than stopping at the first.
	const rows = submenu.getByRole("menuitem");
	await expect(rows.first()).toBeFocused();
	await page.keyboard.press("ArrowDown");
	await expect(rows.nth(1)).toBeFocused();

	// Escape leaves the submenu and nothing else, with focus back on the row
	// that opened it.
	await page.keyboard.press("Escape");
	await expect(submenu).toBeHidden();
	await expect(menu).toBeVisible();
	await expect(parentItem).toBeFocused();

	// A second Escape closes the menu itself and returns focus to its trigger.
	await page.keyboard.press("Escape");
	await expect(menu).toBeHidden();
	await expect(
		page.getByRole("button", { name: copy.actions.openAppMenu }),
	).toBeFocused();
});
