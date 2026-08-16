import type { Locator } from "@playwright/test";
import { copy } from "@/copy/copy";
import { expect, test } from "./fixtures";
import type { TabeloPage } from "./helpers";

// A codec that refuses the document already knows which column is at fault.
// These cover the command that acts on that knowledge: the refused choice stays
// disabled, its correction is a separate reachable command, and running it
// moves the user to the offending header without touching the workspace or the
// document.

async function nameColumns(
	tabelo: TabeloPage,
	...headers: readonly string[]
): Promise<void> {
	for (const [index, header] of headers.entries()) {
		await tabelo.editHeader(index + 1, header);
	}
}

function fixTable(scope: Locator, view: string): Locator {
	return scope.getByRole("button", { name: copy.a11y.fixTableFor(view) });
}

test("a refused view stays disabled and offers the correction beside it", async ({
	page,
	tabelo,
}) => {
	await nameColumns(tabelo, "Name", "Role", "Name");
	const dialog = await tabelo.openChangeViewDialog("markdown");

	const json = dialog.getByRole("radio", { name: copy.views.json.label });
	await expect(json).toBeDisabled();
	// The correction is a sibling command, not the refused option answering to
	// a click it reports itself as unable to take.
	const fix = fixTable(dialog, copy.views.json.label);
	await expect(fix).toBeEnabled();

	// Reachable from the keyboard: the radio group must not swallow it.
	await json.focus();
	await page.keyboard.press("Tab");
	await expect(fix).toBeFocused();
});

test("the correction goes to the first offending header and leaves everything else alone", async ({
	tabelo,
}) => {
	await nameColumns(tabelo, "Name", "Role", "Name");
	const dialog = await tabelo.openChangeViewDialog("markdown");

	await fixTable(dialog, copy.views.json.label).click();

	await expect(dialog).toBeHidden();
	// The refused view was not opened and the workspace kept its two panes.
	await expect(tabelo.pane("markdown")).toBeVisible();
	await expect(tabelo.pane("json")).toHaveCount(0);
	await expect(tabelo.workspace.getByRole("region")).toHaveCount(2);

	await expect(tabelo.header(1)).toHaveAttribute("aria-selected", "true");
	await expect(tabelo.header(1)).toBeFocused();
	await expect(tabelo.notice("warning")).toBeVisible();
});

test("correcting the value makes the refused view available again", async ({
	tabelo,
}) => {
	await nameColumns(tabelo, "Name", "Role", "Name");
	const blocked = await tabelo.openChangeViewDialog("markdown");
	await fixTable(blocked, copy.views.json.label).click();
	await expect(blocked).toBeHidden();

	// The selection landed on the header the refusal named, so this is the
	// column the user was taken to.
	await tabelo.editHeader(1, "Person", "Name");
	await tabelo.dismissNotices();

	const dialog = await tabelo.openChangeViewDialog("markdown");
	await expect(
		dialog.getByRole("radio", { name: copy.views.json.label }),
	).toBeEnabled();
	await expect(fixTable(dialog, copy.views.json.label)).toHaveCount(0);
});

test("the download chooser offers the same correction", async ({
	page,
	tabelo,
}) => {
	await nameColumns(tabelo, "Name", "Role", "Name");

	await tabelo.runAppCommand("downloadTable");
	const dialog = page.getByRole("dialog");
	await expect(
		dialog.getByRole("radio", { name: copy.views.json.shortLabel }),
	).toBeDisabled();

	await fixTable(dialog, copy.views.json.shortLabel).click();

	await expect(dialog).toBeHidden();
	await expect(tabelo.header(1)).toHaveAttribute("aria-selected", "true");
	await expect(tabelo.notice("warning")).toBeVisible();
});

test("a blocked pane offers the correction beside its refused copy command", async ({
	tabelo,
}) => {
	await nameColumns(tabelo, "Name", "Role", "City");
	await tabelo.choosePaneView("markdown", "json");
	await tabelo.editHeader(3, "Name", "City");

	const menu = await tabelo.openPaneMenu("json");
	await expect(
		menu.getByRole("menuitem", { name: copy.actions.copySource }),
	).toBeDisabled();

	await menu
		.getByRole("menuitem", {
			name: copy.a11y.fixTableFor(copy.views.json.label),
		})
		.click();

	await expect(menu).toBeHidden();
	// The pane still shows JSON, still blocked: recovery reports, it does not
	// rearrange the workspace.
	await expect(tabelo.pane("json")).toBeVisible();
	await expect(tabelo.header(1)).toHaveAttribute("aria-selected", "true");
	await expect(tabelo.header(1)).toBeFocused();
	await expect(tabelo.notice("warning")).toBeVisible();
});

test("with no grid open the correction reports without opening one", async ({
	page,
	tabelo,
}) => {
	await nameColumns(tabelo, "Name", "Role", "Name");
	// Leaves the workspace with two source panes and no visual table at all.
	await tabelo.choosePaneView("grid", "csv");
	await expect(tabelo.pane("grid")).toHaveCount(0);

	await tabelo.runAppCommand("downloadTable");
	const dialog = page.getByRole("dialog");
	await fixTable(dialog, copy.views.json.shortLabel).click();

	await expect(dialog).toBeHidden();
	await expect(tabelo.notice("warning")).toBeVisible();
	await expect(tabelo.pane("grid")).toHaveCount(0);
	await expect(tabelo.workspace.getByRole("region")).toHaveCount(2);
});
