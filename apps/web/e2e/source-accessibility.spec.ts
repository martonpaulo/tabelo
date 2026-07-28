import { expect, test } from "./fixtures";

const invalidMarkdown =
	"| Name | Role |\n| not a divider |\n| Inez | Designer |";
const validMarkdown = "| Name | Role |\n| --- | --- |\n| Inez | Designer |";

test("parse errors underline the source and describe the editor", async ({
	tabelo,
}) => {
	const pane = tabelo.pane("Markdown");
	const editor = tabelo.source("Markdown");

	await expect(editor).not.toHaveAttribute("aria-invalid", "true");
	await expect(pane.getByRole("status")).toHaveCount(0);
	await editor.fill(invalidMarkdown);

	await expect(editor).toHaveAttribute("aria-invalid", "true");
	const descriptionId = await editor.getAttribute("aria-describedby");
	expect(descriptionId).toBeTruthy();
	const description = pane.locator(`#${descriptionId}`);
	await expect(description).toContainText(
		"Line 2: The second line must be a divider like | --- | --- |.",
	);
	const underline = pane.locator(".cm-diagnosticError");
	await expect(underline).toHaveCount(1);
	await underline.hover();
	await expect(pane.locator(".cm-diagnosticTooltip")).toContainText(
		"Line 2: The second line must be a divider like | --- | --- |.",
	);

	await editor.fill(validMarkdown);
	await expect(editor).not.toHaveAttribute("aria-invalid", "true");
	await expect(editor).not.toHaveAttribute("aria-describedby");
	await expect(pane.getByRole("status")).toHaveCount(0);

	await editor.fill("");
	await expect(editor).toHaveAttribute("aria-invalid", "true");
	const emptyDescriptionId = await editor.getAttribute("aria-describedby");
	expect(emptyDescriptionId).toBeTruthy();
	await expect(pane.locator(`#${emptyDescriptionId}`)).toContainText(
		"Nothing to read yet.",
	);
});

test("CSV parse failures use product-owned copy", async ({ tabelo }) => {
	await tabelo.choosePaneView("Markdown", "CSV");
	const pane = tabelo.pane("CSV");

	await tabelo.source("CSV").fill('A,B\n1,"unterminated');

	await expect(pane).toContainText("Line 2: A quoted field is not closed.");
	await expect(pane).not.toContainText("Quoted field unterminated");
});

test("warnings use yellow underlines and hover tooltips without moving focus", async ({
	page,
	tabelo,
}) => {
	await tabelo.chooseLayout("Four panes");
	const pane = tabelo.pane("Markdown");
	const editor = tabelo.source("Markdown");
	await editor.focus();
	await editor.press("ControlOrMeta+a");
	await editor.press("Backspace");
	await page.keyboard.insertText(
		"| A | B |\n| --- | --- |\n| one |\n| two | extra | extra |",
	);

	const descriptionId = await editor.getAttribute("aria-describedby");
	expect(descriptionId).toBeTruthy();
	await expect(pane.locator(`#${descriptionId}`)).toContainText(
		"Line 3: Row 1 has 1 cell, the table has 2 columns.",
	);
	const underlines = pane.locator(".cm-diagnosticWarning");
	await expect(underlines).toHaveCount(2);
	await underlines.nth(1).hover();
	await expect(pane.locator(".cm-diagnosticTooltip")).toContainText(
		"Line 4: Row 2 has 3 cells, the table has 2 columns.",
	);
	await expect(editor).toBeFocused();
	await expect(
		pane.getByRole("button", { name: /Show .* warnings/ }),
	).toHaveCount(0);
});
