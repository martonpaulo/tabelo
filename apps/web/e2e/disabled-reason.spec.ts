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
	reason: string,
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

	await tabTo(page, confirm);
	await expect(page.getByRole("tooltip")).toHaveText(reason);
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

	await expectReasonReachableByKeyboard(
		page,
		confirm,
		copy.disabled.layoutAlreadyApplied,
	);
	await expectActivationSwallowed(page, dialog, confirm);

	// The dialog still works once a real change is selected.
	await dialog.getByRole("radio", { name: copy.layouts.rows.label }).click();
	await expect(confirm).toBeEnabled();
	await expect(confirm).not.toHaveAttribute("aria-disabled", "true");
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

	await expectReasonReachableByKeyboard(
		page,
		confirm,
		copy.disabled.viewAlreadyShown,
	);
	await expectActivationSwallowed(page, dialog, confirm);

	// Cancel is still reachable and still closes the dialog.
	await dialog.getByRole("button", { name: copy.actions.cancel }).click();
	await expect(dialog).toBeHidden();
});
