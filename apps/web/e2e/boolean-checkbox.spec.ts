import type { Page } from "@playwright/test";
import { copy } from "@/copy/copy";
import { samplePerson } from "@/core/sample-data";
import { expect, test } from "./fixtures";
import type { TabeloPage } from "./helpers";

// A boolean cell in the Visual Table is a checkbox that toggles in place
// (#483). The value is the carried boolean, so a click or Space writes the
// other boolean as one timeline step, and a local preference switches every
// boolean cell back to its text.

const first = samplePerson(0);
const second = samplePerson(1);
const HEADER = "active";

async function importBooleans(tabelo: TabeloPage): Promise<void> {
	await tabelo.importFile(
		"people.json",
		JSON.stringify([
			{ name: first.name, [HEADER]: true },
			{ name: second.name, [HEADER]: false },
		]),
		"application/json",
	);
	await expect(tabelo.cell(1, 1)).toHaveText(first.name);
}

async function setCheckboxes(page: Page, on: boolean): Promise<void> {
	await page.getByRole("button", { name: copy.actions.openAppMenu }).click();
	const menu = page.getByRole("menu", { name: copy.actions.openAppMenu });
	await menu.getByRole("menuitem", { name: copy.settings.title }).click();
	await menu.waitFor({ state: "hidden" });
	const dialog = page.getByRole("dialog", { name: copy.settings.title });
	const toggle = dialog.getByRole("switch", {
		name: copy.settings.booleanCheckboxes.label,
	});
	if (on) await toggle.check();
	else await toggle.uncheck();
	await dialog.getByRole("button", { name: copy.settings.done }).click();
	await expect(dialog).toBeHidden();
}

test("a boolean cell is a named checkbox without a tab stop of its own", async ({
	tabelo,
}) => {
	await importBooleans(tabelo);

	const checked = tabelo.cell(1, 2).getByRole("checkbox");
	const unchecked = tabelo.cell(2, 2).getByRole("checkbox");
	await expect(checked).toHaveAttribute("aria-checked", "true");
	await expect(unchecked).toHaveAttribute("aria-checked", "false");
	// The name identifies the cell: its column's header and its row number,
	// both data the grid itself shows.
	await expect(checked).toHaveAccessibleName(new RegExp(`${HEADER}.*2`));
	await expect(unchecked).toHaveAccessibleName(new RegExp(`${HEADER}.*3`));
	await expect(checked).toHaveAttribute("tabindex", "-1");
	// The cell stays unlabelled and keeps the grid's roving focus.
	await expect(tabelo.cell(1, 2)).not.toHaveAttribute("aria-label");
	// Only booleans: a text cell has no checkbox.
	await expect(tabelo.cell(1, 1).getByRole("checkbox")).toHaveCount(0);
});

test("a click toggles in place and one undo reverts it", async ({ tabelo }) => {
	await importBooleans(tabelo);
	const cell = tabelo.cell(1, 2);
	const checkbox = cell.getByRole("checkbox");

	await checkbox.click();
	await expect(checkbox).toHaveAttribute("aria-checked", "false");
	// No editor opened: the toggle never enters text editing.
	await expect(cell.getByRole("textbox")).toHaveCount(0);
	await expect(cell).toHaveAttribute("data-cell-type", "boolean");
	await expect(cell).toBeFocused();

	await cell.press("ControlOrMeta+z");
	await expect(checkbox).toHaveAttribute("aria-checked", "true");
});

test("Space toggles a boolean cell and still types over a text cell", async ({
	tabelo,
}) => {
	await importBooleans(tabelo);
	const booleanCell = tabelo.cell(2, 2);
	const checkbox = booleanCell.getByRole("checkbox");

	await tabelo.cell(2, 1).click();
	await tabelo.page.keyboard.press("ArrowRight");
	await expect(booleanCell).toBeFocused();
	await tabelo.page.keyboard.press("Space");
	await expect(checkbox).toHaveAttribute("aria-checked", "true");
	await expect(booleanCell.getByRole("textbox")).toHaveCount(0);

	await tabelo.page.keyboard.press("ControlOrMeta+z");
	await expect(checkbox).toHaveAttribute("aria-checked", "false");

	// The modifier keeps selecting the column and changes no value.
	await tabelo.page.keyboard.press("ControlOrMeta+Space");
	await expect(tabelo.cell(1, 2)).toHaveAttribute("aria-selected", "true");
	await expect(checkbox).toHaveAttribute("aria-checked", "false");

	// A text cell still opens its editor on Space, the way any printable key
	// types over it.
	await tabelo.cell(1, 1).click();
	await tabelo.page.keyboard.press("Space");
	await expect(tabelo.cell(1, 1).getByRole("textbox")).toBeVisible();
	await tabelo.page.keyboard.press("Escape");
	await expect(tabelo.cell(1, 1)).toHaveText(first.name);
});

test("the text preference shows every boolean as text and survives a reload", async ({
	page,
	tabelo,
}) => {
	await importBooleans(tabelo);
	await setCheckboxes(page, false);

	const cell = tabelo.cell(1, 2);
	await expect(cell.getByRole("checkbox")).toHaveCount(0);
	await expect(cell).toHaveText(/^true/);
	await expect(cell).toHaveAttribute("data-cell-type", "boolean");
	// Space is back to typing over the cell when it shows text.
	await tabelo.cell(2, 2).click();
	await page.keyboard.press("Space");
	await expect(tabelo.cell(2, 2).getByRole("textbox")).toBeVisible();
	await page.keyboard.press("Escape");

	await page.reload();
	await expect(tabelo.cell(1, 2)).toHaveText(/^true/);
	await expect(tabelo.cell(1, 2).getByRole("checkbox")).toHaveCount(0);

	await setCheckboxes(page, true);
	await expect(tabelo.cell(1, 2).getByRole("checkbox")).toHaveAttribute(
		"aria-checked",
		"true",
	);
});
