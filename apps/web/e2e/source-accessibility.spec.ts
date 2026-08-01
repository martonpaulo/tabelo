import { copy } from "@/copy/copy";
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
	const dividerIssue = copy.source.issue({
		code: "markdown-divider-required",
		line: 2,
	});
	await expect(description).toContainText(dividerIssue);
	const underline = pane.locator(".cm-diagnosticError");
	await expect(underline).toHaveCount(1);
	await underline.hover();
	await expect(pane.locator(".cm-diagnosticTooltip")).toContainText(
		dividerIssue,
	);

	await editor.fill(validMarkdown);
	await expect(editor).not.toHaveAttribute("aria-invalid", "true");
	await expect(editor).not.toHaveAttribute("aria-describedby");
	await expect(pane.getByRole("status")).toHaveCount(1);

	await editor.fill("");
	await expect(editor).toHaveAttribute("aria-invalid", "true");
	const emptyDescriptionId = await editor.getAttribute("aria-describedby");
	expect(emptyDescriptionId).toBeTruthy();
	await expect(pane.locator(`#${emptyDescriptionId}`)).toContainText(
		copy.source.issue({ code: "empty-source" }),
	);
});

test("CSV parse failures use product-owned copy", async ({ tabelo }) => {
	await tabelo.choosePaneView("markdown", "csv");
	const pane = tabelo.pane("csv");

	await tabelo.source("csv").fill('A,B\n1,"unterminated');

	await expect(pane).toContainText(
		copy.source.issue({
			code: "delimited-unclosed-quote",
			line: 2,
		}),
	);
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
	await expect(pane.locator(`#${descriptionId}`)).toContainText(
		copy.source.issue({
			code: "row-column-count",
			line: 3,
			row: 1,
			actual: 1,
			expected: 2,
		}),
	);
	const underlines = pane.locator(".cm-diagnosticWarning");
	await expect(underlines).toHaveCount(2);
	await underlines.nth(1).hover();
	await expect(pane.locator(".cm-diagnosticTooltip")).toContainText(
		copy.source.issue({
			code: "row-column-count",
			line: 4,
			row: 2,
			actual: 3,
			expected: 2,
		}),
	);
	await expect(editor).toBeFocused();
});
