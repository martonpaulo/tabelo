import type { Locator, Page } from "@playwright/test";
import { copy } from "@/copy/copy";
import { listViews } from "@/views/registry";
import { expect, test } from "./fixtures";
import { openSubmenu, renderedSource, type TabeloPage } from "./helpers";

// Row commands in a source pane (#255). Where the view's codec maps the caret
// to a table row, Alt+ArrowUp and Alt+ArrowDown move that row as the grid does,
// and the context menu offers the same two commands. Where it cannot, the menu
// has none. Views are read from the registry by what their codec declares, so
// a view added later is covered by its declaration rather than by name. The
// menu also carries the grid's other structural commands, and the inserts
// answer the grid's four insert chords.

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
	const move = await openSubmenu(page, menu.first(), copy.actions.move);
	const up = move.getByRole("menuitem", { name: copy.actions.moveUp });
	await expect(up).toHaveAttribute("aria-disabled", "true");
	await expect(up).toHaveAccessibleDescription(/\S/);
	await move.getByRole("menuitem", { name: copy.actions.moveDown }).click();
	await expect(menu).toHaveCount(0);
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
	const move = await openSubmenu(
		page,
		page.getByRole("menu").first(),
		copy.actions.move,
	);
	await expect(
		move.getByRole("menuitem", { name: copy.actions.moveDown }),
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
		for (const name of [
			copy.actions.move,
			copy.actions.sort,
			copy.actions.insertRowsBelow(1),
		]) {
			await expect(menu.getByRole("menuitem", { name })).toHaveCount(0);
		}
	});
}

// The rest of the grid's structure (#255): the same refusals as the grid, one
// undo step each, and the caret left in the cell the command acted on. A
// command inside one of the menu's submenus is reached through it.
async function runMenuCommand(
	page: Page,
	name: string,
	submenu?: string,
): Promise<void> {
	await page.keyboard.press("ContextMenu");
	const menus = page.getByRole("menu");
	const scope = submenu
		? await openSubmenu(page, menus.first(), submenu)
		: menus.first();
	await scope.getByRole("menuitem", { name }).click();
	await expect(menus).toHaveCount(0);
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

		await runMenuCommand(page, copy.actions.moveRight, copy.actions.move);
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

	await runMenuCommand(page, copy.actions.sortDescending, copy.actions.sort);
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
	const menu = page.getByRole("menu").first();
	for (const name of [
		copy.actions.insertRowsBelow(1),
		copy.actions.deleteColumns(1),
	]) {
		await expect(menu.getByRole("menuitem", { name })).toHaveAttribute(
			"aria-disabled",
			"true",
		);
	}
	const move = await openSubmenu(page, menu, copy.actions.move);
	await expect(
		move.getByRole("menuitem", { name: copy.actions.moveRight }),
	).toHaveAttribute("aria-disabled", "true");
	await page.keyboard.press("ArrowLeft");
	const sort = await openSubmenu(page, menu, copy.actions.sort);
	await expect(
		sort.getByRole("menuitem", { name: copy.actions.sortAscending }),
	).toHaveAttribute("aria-disabled", "true");
});

// The grid's four insert chords, in every pane whose codec maps rows (owner,
// 2026-09-19): Mod+Enter and Mod+Shift+Enter insert a row below and above the
// caret's, Alt+Enter and Alt+Shift+Enter a column right and left of its cell,
// each one document step. Each is undone from the grid before the next,
// because a view that titles its rows by the first column, such as Records,
// is unavailable while a row or column is still empty.
for (const view of mappedViews) {
	test(`${view.id}: the insert chords add a row and a column at the caret`, async ({
		page,
		tabelo,
	}) => {
		await seed(tabelo);
		if (view.id !== "markdown")
			await tabelo.choosePaneView("markdown", view.id);
		const editor = tabelo.source(view.id);
		const chord = async (keys: string) => {
			await caretInFirstRow(page, editor);
			await page.keyboard.press(keys);
		};
		const undoFromGrid = async () => {
			await tabelo.cell(1, 1).click();
			await page.keyboard.press("ControlOrMeta+Z");
			await expectOrder(tabelo, ["Ingrid", "Paulo"]);
			await expect(tabelo.header(1)).toHaveText("Name");
			await expect(tabelo.header(2)).toHaveText("City");
		};

		await chord("ControlOrMeta+Enter");
		await expect(tabelo.cell(1, 1)).toHaveText("Ingrid");
		await expect(tabelo.cell(3, 1)).toHaveText("Paulo");
		await undoFromGrid();

		await chord("ControlOrMeta+Shift+Enter");
		await expect(tabelo.cell(2, 1)).toHaveText("Ingrid");
		await expect(tabelo.cell(3, 1)).toHaveText("Paulo");
		await undoFromGrid();

		await chord("Alt+Enter");
		await expect(tabelo.header(1)).toHaveText("Name");
		await expect(tabelo.header(3)).toHaveText("City");
		await undoFromGrid();

		await chord("Alt+Shift+Enter");
		await expect(tabelo.header(2)).toHaveText("Name");
		await expect(tabelo.header(3)).toHaveText("City");
	});
}
