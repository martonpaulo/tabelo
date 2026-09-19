import type { Locator, Page } from "@playwright/test";
import { copy } from "@/copy/copy";
import { listViews } from "@/views/registry";
import { expect, test } from "./fixtures";
import { renderedSource, type TabeloPage } from "./helpers";

// Row commands in a source pane (#255). Where the view's codec maps the caret
// to a table row, Alt+ArrowUp and Alt+ArrowDown move that row as the grid does,
// and the context menu offers the same two commands. Where it cannot, the menu
// has none. Views are read from the registry by what their codec declares, so
// a view added later is covered by its declaration rather than by name. The
// menu also carries the grid's other structural commands, without keys.

const TABLE = [
	"| Name | City |",
	"| --- | --- |",
	"| Ingrid | Rio |",
	"| Paulo | Madrid |",
].join("\n");

const sourceViews = listViews().filter(
	(view) => view.kind === "source" && view.capabilities.editable,
);
const mappedViews = sourceViews.filter((view) => view.codec?.mapsSourceRows);
const unmappedViews = sourceViews.filter((view) => !view.codec?.mapsSourceRows);

async function seed(tabelo: TabeloPage): Promise<void> {
	await tabelo.source("markdown").fill(TABLE);
	await expect(tabelo.cell(2, 1)).toHaveText("Paulo");
}

// The caret just before the first data row's first value, reached with the
// arrow keys the way a user would, whatever the format spells around it. The
// arrows keep the caret in the first column from the text's start, so it is
// counted from there: `Home` would stop at an indented line's indentation, as
// HTML's and JSON's are (#402).
async function caretInFirstRow(page: Page, editor: Locator): Promise<void> {
	const lines = (await renderedSource(editor)).split("\n");
	const line = lines.findIndex((text) => text.includes("Ingrid"));
	const column = lines[line]?.indexOf("Ingrid") ?? -1;
	expect(line).toBeGreaterThanOrEqual(0);
	await editor.click();
	await editor.press("ControlOrMeta+Home");
	for (let step = 0; step < line; step += 1) {
		await page.keyboard.press("ArrowDown");
	}
	for (let step = 0; step < column; step += 1) {
		await page.keyboard.press("ArrowRight");
	}
	await expect(editor).toBeFocused();
}

async function expectOrder(
	tabelo: TabeloPage,
	names: readonly string[],
): Promise<void> {
	for (const [index, name] of names.entries()) {
		await expect(tabelo.cell(index + 1, 1)).toHaveText(name);
	}
}

for (const view of mappedViews) {
	test(`${view.id}: Alt+ArrowDown moves the row under the caret, and one undo restores it`, async ({
		page,
		tabelo,
	}) => {
		await seed(tabelo);
		if (view.id !== "markdown")
			await tabelo.choosePaneView("markdown", view.id);
		const editor = tabelo.source(view.id);
		await caretInFirstRow(page, editor);

		await page.keyboard.press("Alt+ArrowDown");
		await expectOrder(tabelo, ["Paulo", "Ingrid"]);
		await expect(editor).toBeFocused();

		// The move is one document step, so the first undo in the pane reverses
		// it rather than older typing, and redo brings it back.
		await page.keyboard.press("ControlOrMeta+Z");
		await expectOrder(tabelo, ["Ingrid", "Paulo"]);
		await page.keyboard.press("ControlOrMeta+Shift+Z");
		await expectOrder(tabelo, ["Paulo", "Ingrid"]);
	});

	test(`${view.id}: the caret follows the moved row`, async ({
		page,
		tabelo,
	}) => {
		await seed(tabelo);
		if (view.id !== "markdown")
			await tabelo.choosePaneView("markdown", view.id);
		const editor = tabelo.source(view.id);
		await caretInFirstRow(page, editor);

		await page.keyboard.press("Alt+ArrowDown");
		await expectOrder(tabelo, ["Paulo", "Ingrid"]);
		await page.keyboard.type("X");
		await expect(tabelo.cell(2, 1)).toHaveText("XIngrid");
	});
}

test("the context menu moves the row and says why a move is unavailable", async ({
	page,
	tabelo,
}) => {
	await seed(tabelo);
	const editor = tabelo.source("markdown");
	await caretInFirstRow(page, editor);
	const menu = page.getByRole("menu");

	await page.keyboard.press("ContextMenu");
	const up = menu.getByRole("menuitem", { name: copy.actions.moveRowUp });
	await expect(up).toHaveAttribute("aria-disabled", "true");
	await expect(up).toHaveAccessibleDescription(/\S/);
	await menu.getByRole("menuitem", { name: copy.actions.moveRowDown }).click();
	await expect(menu).toBeHidden();
	await expectOrder(tabelo, ["Paulo", "Ingrid"]);
	await expect(editor).toBeFocused();
});

test("a draft that does not parse names no row, so the move is refused", async ({
	page,
	tabelo,
}) => {
	await seed(tabelo);
	const editor = tabelo.source("markdown");
	await editor.fill(TABLE.replace("| --- | --- |", "| not a divider |"));
	await caretInFirstRow(page, editor);
	const before = await editor.textContent();

	await page.keyboard.press("Alt+ArrowDown");
	await expect(tabelo.notice("warning")).toBeVisible();
	await expectOrder(tabelo, ["Ingrid", "Paulo"]);
	expect(await editor.textContent()).toBe(before);

	await page.keyboard.press("ContextMenu");
	await expect(
		page
			.getByRole("menu")
			.getByRole("menuitem", { name: copy.actions.moveRowDown }),
	).toHaveAttribute("aria-disabled", "true");
});

for (const view of unmappedViews) {
	test(`${view.id}: a pane whose format cannot map rows offers no row command`, async ({
		page,
		tabelo,
	}) => {
		await seed(tabelo);
		await tabelo.choosePaneView("markdown", view.id);
		const editor = tabelo.source(view.id);
		await editor.click();
		await page.keyboard.press("ContextMenu");
		const menu = page.getByRole("menu");
		await expect(menu).toBeVisible();
		await expect(
			menu.getByRole("menuitem", { name: copy.actions.moveRowDown }),
		).toHaveCount(0);
		await expect(
			menu.getByRole("menuitem", { name: copy.actions.moveRowUp }),
		).toHaveCount(0);
		await expect(
			menu.getByRole("menuitem", { name: copy.actions.moveColumnRight }),
		).toHaveCount(0);
	});
}

// The rest of the grid's structure, menu-only (#255): no key of their own, the
// same refusals as the grid, one undo step each, and the caret left in the
// cell the command acted on.
async function runMenuCommand(page: Page, name: string): Promise<void> {
	await page.keyboard.press("ContextMenu");
	const menu = page.getByRole("menu");
	await menu.getByRole("menuitem", { name }).click();
	await expect(menu).toBeHidden();
}

for (const view of mappedViews) {
	test(`${view.id}: the context menu moves the caret's column, and the caret stays in its cell`, async ({
		page,
		tabelo,
	}) => {
		await seed(tabelo);
		if (view.id !== "markdown")
			await tabelo.choosePaneView("markdown", view.id);
		const editor = tabelo.source(view.id);
		await caretInFirstRow(page, editor);

		await runMenuCommand(page, copy.actions.moveColumnRight);
		await expect(tabelo.header(1)).toHaveText("City");
		await expect(tabelo.cell(1, 2)).toHaveText("Ingrid");
		await expect(editor).toBeFocused();
		await page.keyboard.type("X");
		await expect(tabelo.cell(1, 2)).toHaveText("XIngrid");
	});
}

test("inserted rows and columns take the caret, and one undo removes each", async ({
	page,
	tabelo,
}) => {
	await seed(tabelo);
	const editor = tabelo.source("markdown");
	await caretInFirstRow(page, editor);

	await runMenuCommand(page, copy.actions.insertRowsBelow(1));
	await expect(tabelo.cell(3, 1)).toHaveText("Paulo");
	await page.keyboard.type("Mabel");
	await expectOrder(tabelo, ["Ingrid", "Mabel", "Paulo"]);

	await caretInFirstRow(page, editor);
	await runMenuCommand(page, copy.actions.insertColumnsLeft(1));
	await expect(tabelo.header(2)).toHaveText("Name");
	await expect(tabelo.cell(1, 2)).toHaveText("Ingrid");
	await page.keyboard.press("ControlOrMeta+Z");
	await expect(tabelo.header(1)).toHaveText("Name");
	await expect(tabelo.cell(1, 1)).toHaveText("Ingrid");
});

test("sorting by the caret's column reorders the table and the caret follows its row", async ({
	page,
	tabelo,
}) => {
	await seed(tabelo);
	const editor = tabelo.source("markdown");
	await caretInFirstRow(page, editor);

	await runMenuCommand(page, copy.actions.sortColumnDescending);
	await expectOrder(tabelo, ["Paulo", "Ingrid"]);
	await page.keyboard.type("X");
	await expect(tabelo.cell(2, 1)).toHaveText("XIngrid");
});

test("deleting the header row promotes the first data row, and a refused command says why", async ({
	page,
	tabelo,
}) => {
	await seed(tabelo);
	const editor = tabelo.source("markdown");
	await editor.click();
	await editor.press("ControlOrMeta+Home");
	await page.keyboard.press("ArrowRight");
	await page.keyboard.press("ArrowRight");

	await page.keyboard.press("ContextMenu");
	const menu = page.getByRole("menu");
	const above = menu.getByRole("menuitem", {
		name: copy.actions.insertRowsAbove(1),
	});
	await expect(above).toHaveAttribute("aria-disabled", "true");
	await expect(above).toHaveAccessibleDescription(/\S/);
	await menu
		.getByRole("menuitem", { name: copy.actions.deleteRows(1) })
		.click();
	await expect(menu).toBeHidden();
	await expect(tabelo.header(1)).toHaveText("Ingrid");
	await expectOrder(tabelo, ["Paulo"]);
});

test("a draft that does not parse disables every structural command", async ({
	page,
	tabelo,
}) => {
	await seed(tabelo);
	const editor = tabelo.source("markdown");
	await editor.fill(TABLE.replace("| --- | --- |", "| not a divider |"));
	await caretInFirstRow(page, editor);

	await page.keyboard.press("ContextMenu");
	const menu = page.getByRole("menu");
	for (const name of [
		copy.actions.moveColumnRight,
		copy.actions.insertRowsBelow(1),
		copy.actions.sortColumnAscending,
		copy.actions.deleteColumns(1),
	]) {
		await expect(menu.getByRole("menuitem", { name })).toHaveAttribute(
			"aria-disabled",
			"true",
		);
	}
});
