import { copy } from "@/copy/copy";
import { samplePeopleCsv } from "@/core/sample-data";
import { expect, test } from "./fixtures";
import type { TabeloPage } from "./helpers";

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

test("deleting empty rows and columns keeps the content, is one undo step, and then has nothing to do", async ({
	tabelo,
}) => {
	await tabelo.paste(
		["name\t\tcity", "Ingrid\t\tRio", "\t\t", "Paulo\t\tMadrid"].join("\n"),
	);
	await tabelo.dismissNotices();
	await expect(tabelo.cell(3, 1)).toHaveText("Paulo");

	await runStructureCommand(tabelo, copy.actions.deleteEmptyRowsAndColumns);

	await expect(tabelo.header(2)).toHaveText("city");
	await expect(tabelo.cell(1, 2)).toHaveText("Rio");
	await expect(tabelo.cell(2, 1)).toHaveText("Paulo");
	await expect(tabelo.cell(2, 2)).toHaveText("Madrid");
	await expect(tabelo.header(3)).toHaveCount(0);

	// Nothing empty is left, so the command stays in place and explains why.
	const menu = await tabelo.openAppMenu();
	const item = menu.getByRole("menuitem", {
		name: copy.actions.deleteEmptyRowsAndColumns,
	});
	await expect(item).toBeDisabled();
	await expect(item).toHaveAccessibleDescription(/\S/);
	await tabelo.page.keyboard.press("Escape");
	await menu.waitFor({ state: "hidden" });

	await tabelo.runAppCommand("undo");
	await expect(tabelo.header(3)).toHaveText("city");
	await expect(tabelo.cell(3, 1)).toHaveText("Paulo");
});
