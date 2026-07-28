import { expect, test } from "./fixtures";

test("first-character editing creates exactly one undoable grid step", async ({
	tabelo,
}) => {
	const cell = tabelo.cell(1, 1);
	await cell.click();
	await cell.press("A");

	const editor = tabelo.grid().getByRole("textbox", {
		name: "Row 2, column 1",
	});
	await expect(editor).toHaveValue("A");
	await editor.press("Enter");
	await expect(cell).toHaveText("A");

	await tabelo.runAppCommand("Undo");
	await expect(cell).toHaveText("");
	const menu = await tabelo.openAppMenu();
	await expect(menu.getByRole("menuitem", { name: "Undo" })).toBeDisabled();
	await tabelo.page.keyboard.press("Escape");

	await tabelo.runAppCommand("Redo");
	await expect(cell).toHaveText("A");
});

test("canceling first-character editing does not create history", async ({
	tabelo,
}) => {
	const cell = tabelo.cell(1, 1);
	await cell.click();
	await cell.press("A");
	await tabelo.grid().getByRole("textbox").press("Escape");

	await expect(cell).toHaveText("");
	const menu = await tabelo.openAppMenu();
	await expect(menu.getByRole("menuitem", { name: "Undo" })).toBeDisabled();
});

test("global undo supports both redo shortcuts", async ({ tabelo }) => {
	await tabelo.editCell(1, 1, "A");
	await tabelo.cell(1, 1).press("ControlOrMeta+z");
	await expect(tabelo.cell(1, 1)).toHaveText("");

	await tabelo.cell(1, 1).press("ControlOrMeta+Shift+z");
	await expect(tabelo.cell(1, 1)).toHaveText("A");

	await tabelo.cell(1, 1).press("ControlOrMeta+z");
	await tabelo.cell(1, 1).press("ControlOrMeta+y");
	await expect(tabelo.cell(1, 1)).toHaveText("A");
});

test("app menu undo and redo use the active source editor first", async ({
	tabelo,
}) => {
	const source = tabelo.source("Markdown");
	await source.fill("| Name |\n| --- |\n| Inez |");
	await source.press("End");
	await source.press("ArrowLeft");
	await source.press("X");
	await expect(tabelo.cell(1, 1)).toHaveText("Inez X");

	await tabelo.runAppCommand("Undo");
	await expect(tabelo.cell(1, 1)).toHaveText("Inez");

	await tabelo.runAppCommand("Redo");
	await expect(tabelo.cell(1, 1)).toHaveText("Inez X");
});

test("document undo restores an invalid draft with explicit feedback", async ({
	tabelo,
}) => {
	const source = tabelo.source("Markdown");
	const invalid = "| Name |\n| not a divider |\n| Inez |";
	await source.fill("| Name |\n| --- |\n| Inez |");
	await source.fill(invalid);
	await expect(
		tabelo.pane("Markdown").locator(".cm-diagnosticError"),
	).toHaveCount(1);

	await tabelo.editCell(1, 1, "Grid wins");
	await expect(tabelo.cell(1, 1)).toHaveText("Grid wins");
	await tabelo.runAppCommand("Undo");

	await expect(tabelo.cell(1, 1)).toHaveText("Inez");
	await expect(
		tabelo.pane("Markdown").locator(".cm-diagnosticError"),
	).toHaveCount(1);
	await expect
		.poll(() =>
			source.evaluate((element) =>
				Array.from(
					element.querySelectorAll(".cm-line"),
					(line) => line.textContent ?? "",
				).join("\n"),
			),
		)
		.toBe(invalid);
});
