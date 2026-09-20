import { copy } from "@/copy/copy";
import { samplePeopleCsv } from "@/core/sample-data";
import { expect, test } from "./fixtures";
import { activeTableStorageKey, type TabeloPage } from "./helpers";

// Transpose and Delete empty rows and columns reshape the whole document from
// the floating menu (#235). What a unit test cannot reach is the browser
// contract: the grid and an open source pane agree at once, the result is
// announced, one undo returns the previous table, and a command with nothing
// to do stays in place, disabled, with its reason.

async function runStructureCommand(
	tabelo: TabeloPage,
	label: string,
): Promise<void> {
	const menu = await tabelo.openAppMenu();
	await menu.getByRole("menuitem", { name: label }).click();
	await menu.waitFor({ state: "hidden" });
}

test("transposing turns the first column into the header row in every view, and undo returns it", async ({
	tabelo,
}) => {
	await tabelo.paste(samplePeopleCsv(2).replaceAll(",", "\t"));
	await tabelo.dismissNotices();
	await tabelo.showInSourcePane("markdown");
	const announced = await tabelo.announcements.innerText();

	await runStructureCommand(tabelo, copy.actions.transposeTable);

	await expect(tabelo.header(1)).toHaveText("name");
	await expect(tabelo.header(2)).toHaveText("Ingrid");
	await expect(tabelo.header(3)).toHaveText("Paulo");
	await expect(tabelo.cell(1, 1)).toHaveText("city");
	await expect(tabelo.cell(1, 2)).toHaveText("Rio");
	// The Markdown pane is a projection of the same document: its header line
	// now names the people.
	const source = tabelo.source("markdown");
	await expect(source).toContainText("Ingrid");
	const markdown = await source.innerText();
	const headerLine = markdown.split("\n")[0] ?? "";
	expect(headerLine).toContain("Ingrid");
	expect(headerLine).toContain("Paulo");
	await expect(tabelo.announcements).not.toHaveText(announced);

	await tabelo.runAppCommand("undo");
	await expect(tabelo.header(1)).toHaveText("name");
	await expect(tabelo.header(2)).toHaveText("city");
	await expect(tabelo.cell(1, 1)).toHaveText("Ingrid");
});

// The command reports in a notice whose Undo is the same document step as
// Mod+Z. Transposing replaces every column, so a width set before it is gone
// from the transposed table and must come back with the undo (#235).
test("the notice's Undo reverts a transpose and brings back a column's width", async ({
	page,
	tabelo,
}) => {
	await tabelo.paste(samplePeopleCsv(2).replaceAll(",", "\t"));
	await tabelo.dismissNotices();
	await tabelo.header(1).focus();
	await page.keyboard.press("Alt+Shift+ArrowRight");
	const savedWidths = async () =>
		page.evaluate(
			(key) => {
				const saved = JSON.parse(localStorage.getItem(key) ?? "null");
				return saved?.workspace?.columnWidths ?? {};
			},
			await activeTableStorageKey(page),
		);
	await expect.poll(savedWidths).not.toEqual({});
	const widened = await savedWidths();

	await runStructureCommand(tabelo, copy.actions.transposeTable);
	await expect(tabelo.header(2)).toHaveText("Ingrid");
	await expect.poll(savedWidths).toEqual({});

	const notice = tabelo.notice("info");
	await expect(notice).toHaveCount(1);
	await notice.getByRole("button", { name: copy.actions.undo }).click();

	await expect(tabelo.header(2)).toHaveText("city");
	await expect(tabelo.cell(1, 1)).toHaveText("Ingrid");
	await expect.poll(savedWidths).toEqual(widened);
	await expect(tabelo.notices).toHaveCount(0);
});

// A header holds text only, so typed values in the first column would become
// text in the transposed header. The command asks first and names how many;
// Cancel changes nothing, and agreeing is still one undo step (#235).
test("transposing asks first when the first column holds typed values", async ({
	page,
	tabelo,
}) => {
	await tabelo.importFile(
		"ages.json",
		'[{"age":35,"name":"Ingrid"},{"age":null,"name":"Paulo"}]',
		"application/json",
	);
	await expect(tabelo.cell(1, 1)).toHaveAttribute("data-cell-type", "number");
	const dialog = page.getByRole("dialog");

	await runStructureCommand(tabelo, copy.actions.transposeTable);
	await expect(dialog).toBeVisible();
	await expect(dialog).toContainText("2");
	await dialog.getByRole("button", { name: copy.actions.cancel }).click();
	await expect(dialog).toBeHidden();
	await expect(
		page.getByRole("button", { name: copy.actions.openAppMenu }),
	).toBeFocused();
	await expect(tabelo.header(1)).toHaveText("age");
	await expect(tabelo.cell(1, 1)).toHaveAttribute("data-cell-type", "number");

	await runStructureCommand(tabelo, copy.actions.transposeTable);
	await dialog
		.getByRole("button", { name: copy.transposeTypedValues.confirm })
		.click();
	await expect(dialog).toBeHidden();
	await expect(tabelo.header(1)).toHaveText("age");
	await expect(tabelo.header(2)).toHaveText("35");
	await expect(tabelo.cell(1, 1)).toHaveText("name");
	await expect(tabelo.cell(1, 2)).toHaveText("Ingrid");

	await tabelo.runAppCommand("undo");
	await expect(tabelo.header(2)).toHaveText("name");
	await expect(tabelo.cell(1, 1)).toHaveAttribute("data-cell-type", "number");
});

test("deleting empty rows and columns keeps the content, is one undo step, and then has nothing to do", async ({
	tabelo,
}) => {
	await tabelo.paste(
		["name\t\tcity", "Ingrid\t\tRio", "\t\t", "Paulo\t\tMadrid"].join("\n"),
	);
	await tabelo.dismissNotices();
	await expect(tabelo.cell(3, 1)).toHaveText("Paulo");

	await runStructureCommand(
		tabelo,
		copy.actions.deleteEmptyRowsAndColumnsDescription,
	);

	await expect(tabelo.header(2)).toHaveText("city");
	await expect(tabelo.cell(1, 2)).toHaveText("Rio");
	await expect(tabelo.cell(2, 1)).toHaveText("Paulo");
	await expect(tabelo.cell(2, 2)).toHaveText("Madrid");
	await expect(tabelo.header(3)).toHaveCount(0);

	// Nothing empty is left, so the command stays in place and explains why.
	const menu = await tabelo.openAppMenu();
	const item = menu.getByRole("menuitem", {
		name: copy.actions.deleteEmptyRowsAndColumnsDescription,
	});
	await expect(item).toBeDisabled();
	await expect(item).toHaveAccessibleDescription(/\S/);
	await tabelo.page.keyboard.press("Escape");
	await menu.waitFor({ state: "hidden" });

	await tabelo.runAppCommand("undo");
	await expect(tabelo.header(3)).toHaveText("city");
	await expect(tabelo.cell(3, 1)).toHaveText("Paulo");
});
