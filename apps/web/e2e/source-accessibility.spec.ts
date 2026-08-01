import { expect, test } from "./fixtures";

const invalidMarkdown =
	"| Name | Role |\n| not a divider |\n| Inez | Designer |";
const validMarkdown = "| Name | Role |\n| --- | --- |\n| Inez | Designer |";

test("parse errors underline the source and describe the editor", async ({
	tabelo,
}) => {
	const pane = tabelo.pane("markdown");
	const editor = tabelo.source("markdown");

	await expect(editor).not.toHaveAttribute("aria-invalid", "true");
	await expect(pane.getByRole("status")).toHaveCount(1);
	await editor.fill(invalidMarkdown);

	await expect(editor).toHaveAttribute("aria-invalid", "true");
	const descriptionId = await editor.getAttribute("aria-describedby");
	expect(descriptionId).toBeTruthy();
	const description = pane.locator(`#${descriptionId}`);
	await expect(description).not.toBeEmpty();
	const underline = pane.locator(".cm-diagnosticError");
	await expect(underline).toHaveCount(1);
	await underline.hover();
	await expect(pane.locator(".cm-diagnosticTooltip")).toBeVisible();

	await editor.fill(validMarkdown);
	await expect(editor).not.toHaveAttribute("aria-invalid", "true");
	await expect(editor).not.toHaveAttribute("aria-describedby");
	await expect(pane.getByRole("status")).toHaveCount(1);

	await editor.fill("");
	await expect(editor).toHaveAttribute("aria-invalid", "true");
	const emptyDescriptionId = await editor.getAttribute("aria-describedby");
	expect(emptyDescriptionId).toBeTruthy();
	await expect(pane.locator(`#${emptyDescriptionId}`)).not.toBeEmpty();
});

test("CSV parse failures do not leak parser copy", async ({ tabelo }) => {
	await tabelo.choosePaneView("markdown", "csv");
	const pane = tabelo.pane("csv");

	await tabelo.source("csv").fill('A,B\n1,"unterminated');

	await expect(pane).not.toContainText("Quoted field unterminated");
});

test("warnings use yellow underlines and hover tooltips without moving focus", async ({
	page,
	tabelo,
}) => {
	await tabelo.chooseLayout("quad");
	const pane = tabelo.pane("markdown");
	const editor = tabelo.source("markdown");
	await editor.focus();
	await editor.press("ControlOrMeta+a");
	await editor.press("Backspace");
	await page.keyboard.insertText(
		"| A | B |\n| --- | --- |\n| one |\n| two | extra | extra |",
	);

	const descriptionId = await editor.getAttribute("aria-describedby");
	expect(descriptionId).toBeTruthy();
	await expect(pane.locator(`#${descriptionId}`)).not.toBeEmpty();
	const underlines = pane.locator(".cm-diagnosticWarning");
	await expect(underlines).toHaveCount(2);
	await underlines.nth(1).hover();
	await expect(pane.locator(".cm-diagnosticTooltip")).toBeVisible();
	await expect(editor).toBeFocused();
});
