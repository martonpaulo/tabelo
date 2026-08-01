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

	await expectDialogOptionAnatomy(dialog, 8);
	await expect(dialog.getByRole("radio", { checked: true })).toHaveCount(1);
	await expect(
		dialog.getByRole("radio", { name: copy.layouts.columns.label }),
	).toBeChecked();
	const apply = dialog.getByRole("button", {
		name: copy.workspace.applyLayout,
	});
	await expect(apply).toBeDisabled();
	await apply.hover();
	await expect(page.getByRole("tooltip")).toBeVisible();
	await expect(
		page.getByRole("menu", { name: copy.actions.openAppMenu }),
	).toBeHidden();

	await dialog.getByRole("radio", { name: copy.layouts.quad.label }).click();
	await expect(apply).toBeEnabled();
	await apply.click();
	await expect(dialog).toBeHidden();
	await expect(trigger).toBeFocused();
	await expect(tabelo.workspace.getByRole("region")).toHaveCount(4);
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
	await expectDialogOptionAnatomy(dialog, 8);
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
	await expect(unavailableRow).toHaveCount(1);
	await expect(inUseRow.getByRole("radio")).toBeDisabled();
	await expect(unavailableRow.getByRole("radio")).toBeDisabled();
	await expect(
		inUseRow.locator('[data-slot="selection-option-status"] svg'),
	).toBeVisible();
	await expect(
		unavailableRow.locator('[data-slot="selection-option-status"] svg'),
	).toBeVisible();

	await inUseRow.hover();
	await expect(page.getByRole("tooltip")).toBeVisible();
	await unavailableRow.hover();
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
	const redoShortcut = appMenu
		.getByRole("menuitem", { name: copy.actions.redo })
		.locator("kbd");
	await expect(redoShortcut.filter({ hasText: "⇧" })).toHaveCount(1);
	await expect(redoShortcut.filter({ hasText: "Shift" })).toHaveCount(0);
});

test("column alignment uses the shared one-line radio anatomy", async ({
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
	const options = menu.getByRole("menuitemradio");

	await expect(options).toHaveCount(4);
	await expect(menu.locator('[data-slot="selection-option-icon"]')).toHaveCount(
		4,
	);
	await expect(
		menu.locator('[data-slot="dropdown-menu-radio-item-indicator"]'),
	).toHaveCount(0);
	await expect(menu.getByRole("menuitemradio", { checked: true })).toHaveCount(
		1,
	);

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
	await expect(
		page
			.getByRole("menu", {
				name: new RegExp(`^${copy.actions.columnActions}:`),
			})
			.getByRole("menuitemradio", { name: copy.actions.alignCenter }),
	).toBeChecked();
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

test("Add view and Download reuse the dialog option anatomy", async ({
	page,
	tabelo,
}) => {
	await tabelo.splitControl("grid", "bottom").click();
	const addDialog = page.getByRole("dialog", { name: copy.addView.title });
	await expectDialogOptionAnatomy(addDialog, 8);
	await addDialog.getByRole("button", { name: copy.actions.cancel }).click();

	await tabelo.runAppCommand("downloadTable");
	const downloadDialog = page.getByRole("dialog", {
		name: copy.download.title,
	});
	await expectDialogOptionAnatomy(downloadDialog, 6);
	await expect(
		downloadDialog.locator('[data-slot="selection-option-metadata"]'),
	).toHaveCount(6);
});

test("dialog radio choices support the keyboard and Cancel restores focus", async ({
	page,
	tabelo,
}) => {
	const trigger = page.getByRole("button", { name: copy.actions.openAppMenu });
	const dialog = await tabelo.openLayoutDialog();
	const option = dialog.getByRole("radio", { name: copy.layouts.quad.label });
	await option.focus();
	await page.keyboard.press("Space");
	await expect(option).toBeChecked();

	await dialog.getByRole("button", { name: copy.actions.cancel }).click();
	await expect(dialog).toBeHidden();
	await expect(trigger).toBeFocused();
});
