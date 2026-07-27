import { expect, test } from "./fixtures";

const invalidMarkdown =
	"| Name | Role |\n| not a divider |\n| Ana | Designer |";
const validMarkdown = "| Name | Role |\n| --- | --- |\n| Ana | Designer |";

test("persistent parse feedback describes the editor and announces once", async ({
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
		"Source is not valid yet. Other views still show the last valid table.",
	);
	await expect(description).toContainText(
		"Line 2: The second line must be a divider like | --- | --- |.",
	);

	const announcement = pane.getByRole("status");
	await expect(announcement).toHaveText(
		"Source is not valid yet. Other views still show the last valid table.",
	);
	const announcementId = await announcement.getAttribute("id");
	await editor.press("End");
	await editor.press("x");
	await expect(announcement).toHaveAttribute("id", announcementId ?? "");
	await expect(announcement).toHaveText(
		"Source is not valid yet. Other views still show the last valid table.",
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

test("all warnings remain expandable and navigate to their source lines", async ({
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

	await expect(pane).toContainText(
		"Line 3: Row 1 has 1 cell, the table has 2 columns.",
	);
	const details = pane.getByRole("button", { name: "Show 2 warnings" });
	await details.click();
	await expect(details).toHaveAttribute("aria-expanded", "true");

	const menu = page.getByRole("menu", { name: "Show 2 warnings" });
	const items = menu.getByRole("menuitem");
	await expect(items).toHaveCount(2);
	await expect(items.nth(0)).toHaveText(
		"Line 3: Row 1 has 1 cell, the table has 2 columns.",
	);
	await expect(items.nth(1)).toHaveText(
		"Line 4: Row 2 has 3 cells, the table has 2 columns.",
	);

	await items.nth(1).click();
	await expect(editor).toBeFocused();
	await expect(pane.locator(".cm-activeLine")).toHaveText(
		"| two | extra | extra |",
	);
	await expect(details).toHaveAttribute("aria-expanded", "false");
});
