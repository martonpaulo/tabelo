import { copy } from "@/copy/copy";
import { expect, test } from "./fixtures";
import { lastCopied, recordingClipboard } from "./helpers";

// A source pane's own context menu (#234). Right-click and the keyboard's
// context-menu gesture open it; Shift+right-click is left to the browser. The
// pair is what is tested, since one modifier is all that separates them.

test("right-click opens the source menu and Shift+right-click does not", async ({
	page,
	tabelo,
}) => {
	await tabelo.editCell(1, 1, "Ingrid");
	const editor = tabelo.source("markdown");
	const menu = page.getByRole("menu");

	await editor.click({ button: "right" });
	await expect(menu).toBeVisible();
	await expect(
		menu.getByRole("menuitem", { name: copy.actions.selectNextOccurrence }),
	).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(menu).toBeHidden();

	await editor.click({ button: "right", modifiers: ["Shift"] });
	await expect(menu).toBeHidden();
});

test("the keyboard gesture opens it, and Escape walks back out of the pane", async ({
	page,
	tabelo,
}) => {
	await tabelo.editCell(1, 1, "Ingrid");
	const editor = tabelo.source("markdown");
	await editor.click();
	await page.keyboard.press("ContextMenu");
	const menu = page.getByRole("menu");
	await expect(menu).toBeVisible();

	// First Escape closes the menu and gives the text its focus back; the
	// second leaves the editor for the pane, as it does without the menu.
	await page.keyboard.press("Escape");
	await expect(menu).toBeHidden();
	await expect(editor).toBeFocused();
	await page.keyboard.press("Escape");
	await expect(editor).not.toBeFocused();
});

test("a command chosen from the menu acts on the editor", async ({
	page,
	tabelo,
}) => {
	await recordingClipboard(page);
	await page.reload();
	await tabelo.dismissWelcome();
	await tabelo.editCell(1, 1, "Ingrid");
	const editor = tabelo.source("markdown");

	// Nothing selected yet: Copy is unavailable, with its reason.
	await editor.click();
	await editor.click({ button: "right" });
	const menu = page.getByRole("menu");
	const copyItem = menu.getByRole("menuitem", { name: copy.actions.copy });
	await expect(copyItem).toHaveAttribute("aria-disabled", "true");
	await expect(copyItem).toHaveAccessibleDescription(/\S/);

	await menu
		.getByRole("menuitem", { name: copy.actions.selectAllText })
		.click();
	await expect(menu).toBeHidden();
	await editor.click({ button: "right" });
	await menu.getByRole("menuitem", { name: copy.actions.copy }).click();
	await expect
		.poll(async () => (await lastCopied(page))?.text ?? "")
		.toContain("Ingrid");
});
