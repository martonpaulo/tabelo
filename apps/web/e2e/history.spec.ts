import { expect, test } from "./fixtures";

test("first-character editing creates exactly one undoable grid step", async ({
	tabelo,
}) => {
	const cell = tabelo.cell(1, 1);
	await cell.click();
	await cell.press("A");

	const editor = tabelo.grid().getByRole("textbox", {
		name: "Row 1, column 1",
	});
	await expect(editor).toHaveValue("A");
	await editor.press("Enter");
	await expect(cell).toHaveText("A");

	await tabelo.page.getByRole("button", { name: "Undo" }).click();
	await expect(cell).toHaveText("");
	await expect(
		tabelo.page.getByRole("button", { name: "Undo" }),
	).toBeDisabled();

	await tabelo.page.getByRole("button", { name: "Redo" }).click();
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
	await expect(
		tabelo.page.getByRole("button", { name: "Undo" }),
	).toBeDisabled();
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

test("toolbar undo and redo use the active source editor first", async ({
	tabelo,
}) => {
	const source = tabelo.source("Markdown");
	await source.fill("| Name |\n| --- |\n| Ana |");
	await source.press("End");
	await source.press("ArrowLeft");
	await source.press("X");
	await expect(tabelo.cell(1, 1)).toHaveText("Ana X");

	await tabelo.page.getByRole("button", { name: "Undo" }).click();
	await expect(tabelo.cell(1, 1)).toHaveText("Ana");

	await tabelo.page.getByRole("button", { name: "Redo" }).click();
	await expect(tabelo.cell(1, 1)).toHaveText("Ana X");
});

test("document undo restores an invalid draft with explicit feedback", async ({
	tabelo,
}) => {
	const source = tabelo.source("Markdown");
	const invalid = "| Name |\n| not a divider |\n| Ana |";
	await source.fill("| Name |\n| --- |\n| Ana |");
	await source.fill(invalid);
	await expect(tabelo.pane("Markdown")).toContainText(
		"Source is not valid yet. Other views still show the last valid table.",
	);

	await tabelo.editCell(1, 1, "Grid wins");
	await expect(tabelo.cell(1, 1)).toHaveText("Grid wins");
	await tabelo.page.getByRole("button", { name: "Undo" }).click();

	await expect(tabelo.cell(1, 1)).toHaveText("Ana");
	await expect(tabelo.pane("Markdown")).toContainText(
		"Source is not valid yet. Other views still show the last valid table.",
	);
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
