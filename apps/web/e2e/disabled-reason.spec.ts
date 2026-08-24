import type { Locator, Page } from "@playwright/test";
import { copy } from "@/copy/copy";
import { expect, test } from "./fixtures";

// The confirm sits after the selection list and Cancel, so a handful of stops
// is enough. Bounded so a broken tab order fails instead of hanging.
const MAX_TAB_STOPS = 12;

async function tabTo(page: Page, target: Locator): Promise<void> {
	for (let stop = 0; stop < MAX_TAB_STOPS; stop += 1) {
		if (await target.evaluate((element) => element === document.activeElement))
			return;
		await page.keyboard.press("Tab");
	}
	await expect(target).toBeFocused();
}

async function expectReasonReachableByKeyboard(
	page: Page,
	confirm: Locator,
): Promise<void> {
	// Unavailable through the accessibility tree, not through a native
	// `disabled` attribute that would take the control out of the tab order.
	await expect(confirm).toBeDisabled();
	await expect(confirm).toHaveAttribute("aria-disabled", "true");
	expect(
		await confirm.evaluate(
			(element) => (element as HTMLButtonElement).disabled === true,
		),
	).toBe(false);
	await expect(confirm).toHaveAccessibleDescription(/\S/);

	await tabTo(page, confirm);
	const tooltip = page.locator('[role="tooltip"][data-open]');
	await expect(tooltip).toBeVisible();
	const reason = (await tooltip.innerText()).trim();
	expect(reason).not.toBe("");
	await expect(confirm).toHaveAccessibleDescription(reason);
	await expect(confirm).toHaveAccessibleName(
		(await confirm.innerText()).trim(),
	);
}

async function expectActivationSwallowed(
	page: Page,
	dialog: Locator,
	confirm: Locator,
): Promise<void> {
	await confirm.focus();
	for (const key of ["Enter", " "]) {
		await page.keyboard.press(key);
		await expect(dialog).toBeVisible();
		await expect(confirm).toBeFocused();
	}
	// `click` skips the actionability wait that an unavailable control would
	// never satisfy, so the press really reaches the element.
	await confirm.click({ force: true });
	await expect(dialog).toBeVisible();
}

test("the Layout dialog explains its unavailable confirm to the keyboard", async ({
	page,
	tabelo,
}) => {
	const dialog = await tabelo.openLayoutDialog();
	const confirm = dialog.getByRole("button", {
		name: copy.workspace.applyLayout,
	});

	await expectReasonReachableByKeyboard(page, confirm);
	await expectActivationSwallowed(page, dialog, confirm);

	// The dialog still works once a real change is selected.
	await dialog.getByRole("radio", { name: copy.layouts.rows.label }).click();
	await expect(confirm).toBeEnabled();
	await expect(confirm).not.toHaveAttribute("aria-disabled", "true");
	await expect(confirm).not.toHaveAttribute("aria-describedby");
	await expect(confirm).toHaveAccessibleDescription("");
	await confirm.click();
	await expect(dialog).toBeHidden();
});

test("the Change view dialog explains its unavailable confirm to the keyboard", async ({
	page,
	tabelo,
}) => {
	const dialog = await tabelo.openChangeViewDialog("markdown");
	const confirm = dialog.getByRole("button", {
		name: copy.workspace.changeView,
		exact: true,
	});
	await expect(
		dialog.getByRole("radio", { disabled: true }).first(),
	).toHaveAccessibleDescription(/\S/);

	await expectReasonReachableByKeyboard(page, confirm);
	await expectActivationSwallowed(page, dialog, confirm);

	// Cancel is still reachable and still closes the dialog.
	await dialog.getByRole("button", { name: copy.actions.cancel }).click();
	await expect(dialog).toBeHidden();
});

test("a disabled menu item exposes its reason as its description", async ({
	page,
	tabelo,
}) => {
	await tabelo.chooseLayout("single");
	const menu = await tabelo.openPaneMenu("grid");
	const closeView = menu.getByRole("menuitem", {
		name: copy.workspace.closeView,
	});
	await expect(closeView).toBeDisabled();
	await expect(closeView).toHaveAccessibleDescription(/\S/);

	for (let step = 0; step < MAX_TAB_STOPS; step += 1) {
		if (await closeView.evaluate((element) => element.matches(":focus"))) break;
		await page.keyboard.press("ArrowDown");
	}
	await expect(closeView).toBeFocused();
	const tooltip = page.locator('[role="tooltip"][data-open]');
	await expect(tooltip).toBeVisible();
	const reason = (await tooltip.innerText()).trim();
	expect(reason).not.toBe("");
	await expect(closeView).toHaveAccessibleDescription(reason);
	await expect(closeView).toHaveAccessibleName(
		(await closeView.innerText()).trim(),
	);
});

test("the find bar exposes its no-results reason on its controls", async ({
	page,
	tabelo,
}) => {
	await tabelo.cell(1, 1).click();
	await page.keyboard.press("ControlOrMeta+f");
	const findBar = page.getByRole("region", { name: copy.find.title });
	await findBar
		.getByRole("textbox", { name: copy.find.query })
		.fill("no match");
	const next = findBar.getByRole("button", { name: copy.find.next });

	await expect(next).toBeDisabled();
	await expect(next).toHaveAccessibleDescription(/\S/);
	await next.hover();
	const tooltip = page.locator('[role="tooltip"][data-open]');
	await expect(tooltip).toBeVisible();
	await expect(next).toHaveAccessibleDescription(
		(await tooltip.innerText()).trim(),
	);
});
