import type { Locator } from "@playwright/test";
import { listViews } from "@/views/registry";
import { expect, test } from "./fixtures";
import { renderedSource, type TabeloPage } from "./helpers";

// Tab inside a source editor (#54). A view that is a grid of delimited fields
// moves the caret between them; a view that nests indents. In every one of
// them Tab stays inside the editor, and Escape is the way out. The views are
// read from the registry by the behaviour they declare, so a view added later
// is covered by what it declares rather than by being named here. See
// docs/design-system/9-accessibility.md, "The source-editor keyboard model".

const TABLE = ["| Name | City |", "| --- | --- |", "| Ingrid | Rio |"].join(
	"\n",
);

const fieldViews = listViews().filter(
	(view) => view.capabilities.sourceTab === "next-field",
);
const indentViews = listViews().filter(
	(view) => view.capabilities.sourceTab === "indent",
);

async function seed(tabelo: TabeloPage): Promise<void> {
	await tabelo.source("markdown").fill(TABLE);
	await expect(tabelo.cell(1, 2)).toHaveText("Rio");
}

// The editor, entered, with the caret at the very start of the text.
async function enterAtStart(editor: Locator): Promise<void> {
	await editor.click();
	await editor.press("ControlOrMeta+Home");
	await expect(editor).toBeFocused();
}

test.describe("field navigation", () => {
	for (const view of fieldViews) {
		test(`${view.id}: Tab walks the fields and never leaves the editor`, async ({
			page,
			tabelo,
		}) => {
			await seed(tabelo);
			if (view.id !== "markdown")
				await tabelo.choosePaneView("markdown", view.id);
			const editor = tabelo.source(view.id);
			await enterAtStart(editor);

			// Before or inside the first field, Shift+Tab wraps to the last one,
			// which in every format is the last cell of the table.
			await page.keyboard.press("Shift+Tab");
			await expect(editor).toBeFocused();
			await page.keyboard.type("X");
			await expect(tabelo.cell(1, 2)).toHaveText("XRio");

			// Back one field is the cell before it, whatever separates them.
			await page.keyboard.press("Shift+Tab");
			await page.keyboard.type("Y");
			await expect(tabelo.cell(1, 1)).toHaveText("YIngrid");

			// Forward past the last field wraps to the first, and back again from
			// there wraps to the last: the ring closes in both directions.
			await page.keyboard.press("Tab");
			await page.keyboard.press("Tab");
			await expect(editor).toBeFocused();
			await page.keyboard.press("Shift+Tab");
			await page.keyboard.type("Z");
			await expect(tabelo.cell(1, 2)).toHaveText("ZXRio");

			// Tab never moved focus; Escape is the exit.
			await expect(editor).toBeFocused();
			await page.keyboard.press("Escape");
			await expect(tabelo.pane(view.id)).toBeFocused();
		});
	}

	test("a delimiter inside a quoted value is not a stop", async ({
		page,
		tabelo,
	}) => {
		await seed(tabelo);
		await tabelo.editCell(1, 1, "Ingrid, Rio");
		await tabelo.choosePaneView("markdown", "csv");
		const editor = tabelo.source("csv");
		await expect(editor).toContainText('"Ingrid, Rio"');
		await enterAtStart(editor);

		// Name, City, then the quoted value as one field, inside its quotes.
		await page.keyboard.press("Tab");
		await page.keyboard.press("Tab");
		await page.keyboard.type("Q");
		await expect(tabelo.cell(1, 1)).toHaveText("QIngrid, Rio");
		await page.keyboard.press("Tab");
		await page.keyboard.type("R");
		await expect(tabelo.cell(1, 2)).toHaveText("RRio");
	});

	test("a draft that does not parse still moves, and keeps focus", async ({
		page,
		tabelo,
	}) => {
		await seed(tabelo);
		await tabelo.choosePaneView("markdown", "csv");
		const editor = tabelo.source("csv");
		await editor.fill('Name,City\nIngrid,"Rio');
		await expect(editor).toHaveAttribute("aria-invalid", "true");
		await enterAtStart(editor);

		await page.keyboard.press("Tab");
		await page.keyboard.press("Tab");
		await expect(editor).toBeFocused();
		await page.keyboard.type("W");
		// The draft is text the user owns: the stop moved the caret and nothing
		// else, so the only change is the typed character.
		expect(await renderedSource(tabelo.pane("csv"))).toBe(
			'Name,City\nWIngrid,"Rio',
		);
	});

	test("Enter keeps the whitespace after the caret, which in TSV is structure", async ({
		page,
		tabelo,
	}) => {
		await seed(tabelo);
		await tabelo.editCell(1, 1, "");
		await tabelo.choosePaneView("markdown", "tsv");
		const editor = tabelo.source("tsv");
		await enterAtStart(editor);
		// The start of the row whose first field is empty, so the first thing
		// after the caret is the tab that ends that field.
		// ArrowDown keeps column zero; Home would stop after the leading tab.
		await editor.press("ArrowDown");
		await page.keyboard.press("Enter");
		// A plain line break. CodeMirror's default Enter would delete the blank
		// space after the caret, which here is the delimiter, and re-indent the
		// row with spaces copied from its leading tab.
		expect(await renderedSource(tabelo.pane("tsv"))).toBe(
			"Name\tCity\n\n\tRio",
		);
	});
});

test.describe("indentation", () => {
	for (const view of indentViews) {
		test(`${view.id}: Tab indents by one unit and never leaves the editor`, async ({
			page,
			tabelo,
		}) => {
			await seed(tabelo);
			await tabelo.choosePaneView("markdown", view.id);
			const editor = tabelo.source(view.id);
			const pane = tabelo.pane(view.id);
			await enterAtStart(editor);
			await editor.press("ArrowDown");

			const before = await renderedSource(pane);
			const line = (text: string) => text.split("\n")[1] ?? "";
			const depth = (text: string) =>
				line(text).length - line(text).trimStart().length;
			const original = depth(before);

			await page.keyboard.press("Tab");
			await expect(editor).toBeFocused();
			await expect
				.poll(async () => depth(await renderedSource(pane)))
				.toBe(original + 2);

			await page.keyboard.press("Shift+Tab");
			await expect
				.poll(async () => depth(await renderedSource(pane)))
				.toBe(original);

			await page.keyboard.press("Escape");
			await expect(pane).toBeFocused();
		});

		test(`${view.id}: Enter continues at the current depth, in one undo step`, async ({
			page,
			tabelo,
		}) => {
			await seed(tabelo);
			await tabelo.choosePaneView("markdown", view.id);
			const editor = tabelo.source(view.id);
			const pane = tabelo.pane(view.id);
			await enterAtStart(editor);
			// The second line is nested one level inside the first in both
			// formats: the first record of the JSON array, the <thead> of the
			// HTML table.
			await editor.press("ArrowDown");
			await editor.press("End");

			const before = await renderedSource(pane);
			const second = before.split("\n")[1] ?? "";
			const indent = second.slice(0, second.length - second.trimStart().length);

			await page.keyboard.press("Enter");
			await expect
				.poll(async () => (await renderedSource(pane)).split("\n")[2])
				.toMatch(new RegExp(`^${indent}\\s*$`));

			// The line break and its indentation are one step of local history.
			await page.keyboard.press("ControlOrMeta+z");
			await expect.poll(() => renderedSource(pane)).toBe(before);
			await expect(editor).toBeFocused();

			// With the local history spent, the next undo falls through to the
			// document timeline (ADR 0003) and takes back the table itself.
			await page.keyboard.press("ControlOrMeta+z");
			await expect(tabelo.cell(1, 2)).not.toHaveText("Rio");
			await expect.poll(() => renderedSource(pane)).not.toBe(before);
		});
	}
});
