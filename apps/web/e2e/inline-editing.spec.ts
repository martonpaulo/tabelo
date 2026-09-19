import type { Locator } from "@playwright/test";
import { copy } from "@/copy/copy";
import { expect, test } from "./fixtures";
import { renderedSource, type TabeloPage } from "./helpers";

// #306, delivery slice 3: the Visual Table renders formatted cells as their
// semantic elements, formats the grid selection from its Format group and its
// shortcuts, edits formatted text in a rich cell editor, and adds links and
// images through their dialogs. Markdown is read back as the evidence of what
// the document holds, since it spells every mark.

const fixture = [
	"| **Name** | City | Age |",
	"| --- | --- | ---: |",
	"| Ingrid | [Rio](https://example.com/rio) | 34 |",
	"| Paulo | Madrid | 29 |",
].join("\n");

async function loadFixture(tabelo: TabeloPage): Promise<void> {
	await tabelo.importFile("roster.md", fixture, "text/markdown");
	await expect(tabelo.cell(1, 1)).toHaveText("Ingrid");
	await tabelo.showInSourcePane("markdown");
}

function markdown(tabelo: TabeloPage): Promise<string> {
	return renderedSource(tabelo.pane("markdown"));
}

async function openCellMenu(
	tabelo: TabeloPage,
	cell: Locator,
): Promise<Locator> {
	await cell.click({ button: "right" });
	const menu = tabelo.page.getByRole("menu");
	await expect(menu).toBeVisible();
	return menu;
}

function formatToggle(menu: Locator, name: string): Locator {
	return menu.getByRole("menuitemcheckbox", { name });
}

test("the grid renders formatting and links as semantic elements", async ({
	tabelo,
}) => {
	await loadFixture(tabelo);
	await expect(tabelo.header(1).locator("strong")).toHaveText("Name");

	// A link in the grid is a link without a tab stop of its own.
	const link = tabelo.cell(1, 2).getByRole("link", { name: "Rio" });
	await expect(link).toHaveAttribute("tabindex", "-1");
	await expect(link).toHaveAttribute("rel", "noopener noreferrer");

	// A plain click selects the cell; Mod+click opens the link.
	await link.click();
	await expect(tabelo.cell(1, 2)).toHaveAttribute("aria-selected", "true");
	const popup = tabelo.page.waitForEvent("popup");
	await link.click({ modifiers: ["ControlOrMeta"] });
	expect((await popup).url()).toBe("https://example.com/rio");
});

test("the Format group toggles a mark over the selection as one step", async ({
	tabelo,
}) => {
	await loadFixture(tabelo);
	await tabelo.cell(1, 1).click();
	await tabelo.cell(2, 1).click({ modifiers: ["Shift"] });

	let menu = await openCellMenu(tabelo, tabelo.cell(1, 1));
	const bold = formatToggle(menu, copy.actions.bold);
	await expect(bold).toHaveAttribute("aria-checked", "false");
	await bold.click();
	await expect(menu).toBeHidden();

	await expect(tabelo.cell(1, 1).locator("strong")).toHaveText("Ingrid");
	await expect(tabelo.cell(2, 1).locator("strong")).toHaveText("Paulo");
	await expect.poll(() => markdown(tabelo)).toContain("**Paulo**");

	// Pressed now, and one undo takes both cells back.
	menu = await openCellMenu(tabelo, tabelo.cell(1, 1));
	await expect(formatToggle(menu, copy.actions.bold)).toHaveAttribute(
		"aria-checked",
		"true",
	);
	await tabelo.page.keyboard.press("Escape");
	await expect(menu).toBeHidden();
	await tabelo.runAppCommand("undo");
	await expect(tabelo.cell(1, 1).locator("strong")).toHaveCount(0);
	await expect(tabelo.cell(2, 1).locator("strong")).toHaveCount(0);
});

test("a partly formatted selection reads as mixed", async ({ tabelo }) => {
	await loadFixture(tabelo);
	await tabelo.cell(1, 1).click();
	await tabelo.page.keyboard.press("ControlOrMeta+I");
	await expect(tabelo.cell(1, 1).locator("em")).toHaveText("Ingrid");

	await tabelo.cell(2, 1).click({ modifiers: ["Shift"] });
	const menu = await openCellMenu(tabelo, tabelo.cell(1, 1));
	const italic = formatToggle(menu, copy.actions.italic);
	await expect(italic).toHaveAttribute("aria-checked", "mixed");

	// A mixed mark runs the unpressed command: the whole selection gains it.
	await italic.click();
	await expect(menu).toBeHidden();
	await expect(tabelo.cell(1, 1).locator("em")).toHaveText("Ingrid");
	await expect(tabelo.cell(2, 1).locator("em")).toHaveText("Paulo");
});

test("formatting is unavailable for a number and says why", async ({
	page,
	tabelo,
}) => {
	await loadFixture(tabelo);
	// Markdown carries no types, so the age becomes a number by the user's
	// own choice, as it only ever can.
	await tabelo.cell(1, 3).click();
	let menu = await openCellMenu(tabelo, tabelo.cell(1, 3));
	await menu
		.getByRole("menuitemradio", { name: copy.cellTypes.real.number })
		.click();
	await expect(menu).toBeHidden();
	await expect(tabelo.cell(1, 3)).toHaveAttribute("data-cell-type", "number");

	menu = await openCellMenu(tabelo, tabelo.cell(1, 3));
	const bold = formatToggle(menu, copy.actions.bold);
	await expect(bold).toBeDisabled();
	await expect(bold).toHaveAccessibleDescription(/.+/);
	await expect(
		menu.getByRole("menuitem", { name: copy.actions.link }),
	).toBeDisabled();
	await page.keyboard.press("Escape");
	await expect(menu).toBeHidden();

	// The shortcut refuses too, and the number is still a number.
	await tabelo.cell(1, 3).click();
	await page.keyboard.press("ControlOrMeta+B");
	await expect(tabelo.notice("warning")).toBeVisible();
	await expect(tabelo.cell(1, 3)).toHaveAttribute("data-cell-type", "number");

	// Beside text, the text is formatted and a notice reports the skipped cell.
	await tabelo.cell(1, 2).click();
	await tabelo.cell(1, 3).click({ modifiers: ["Shift"] });
	await page.keyboard.press("ControlOrMeta+B");
	await expect(tabelo.cell(1, 2).locator("strong")).toHaveText("Rio");
	await expect(tabelo.notice("info")).toBeVisible();
	await expect(tabelo.cell(1, 3)).toHaveAttribute("data-cell-type", "number");
});

test("every mark shortcut formats the selected cell", async ({
	page,
	tabelo,
}) => {
	await loadFixture(tabelo);
	const cell = tabelo.cell(2, 1);
	await cell.click();
	await page.keyboard.press("ControlOrMeta+U");
	await expect(cell.locator("u")).toHaveText("Paulo");
	await page.keyboard.press("ControlOrMeta+Shift+S");
	await expect(cell.locator("s")).toHaveText("Paulo");
	// Code replaces every other mark.
	await page.keyboard.press("ControlOrMeta+Shift+M");
	await expect(cell.locator("code")).toHaveText("Paulo");
	await expect(cell.locator("u")).toHaveCount(0);
});

test("the rich editor formats a range and the caret's typing", async ({
	page,
	tabelo,
}) => {
	await loadFixture(tabelo);
	const cell = tabelo.cell(2, 1);
	await cell.dblclick();
	const editor = tabelo.grid().getByRole("textbox", {
		name: copy.a11y.cellEditor(1, 0),
	});
	await expect(editor).toBeFocused();

	// The last two letters, bold.
	await page.keyboard.press("Shift+ArrowLeft");
	await page.keyboard.press("Shift+ArrowLeft");
	await page.keyboard.press("ControlOrMeta+B");
	await expect(editor.locator("strong")).toHaveText("lo");

	// Italic at the caret applies to what is typed next.
	await page.keyboard.press("ArrowRight");
	await page.keyboard.press("ControlOrMeta+I");
	await page.keyboard.type("s");
	await expect(editor.locator("em")).toHaveText("s");

	// Local undo takes the typing back while the editor is open.
	await page.keyboard.press("ControlOrMeta+Z");
	await expect(editor).toHaveText("Paulo");

	await page.keyboard.press("Enter");
	await expect(cell.locator("strong")).toHaveText("lo");
	await expect.poll(() => markdown(tabelo)).toContain("Pau**lo**");
});

test("the rich editor keeps formatting through an edit and Escape cancels", async ({
	page,
	tabelo,
}) => {
	await loadFixture(tabelo);
	// A formatted header gains a letter and stays formatted.
	await tabelo.header(1).dblclick();
	await expect(
		tabelo.grid().getByRole("textbox", {
			name: copy.a11y.headerEditor("Name", 0),
		}),
	).toBeFocused();
	await page.keyboard.type("s");
	await page.keyboard.press("Enter");
	await expect(tabelo.header(1).locator("strong")).toHaveText("Names");

	// Escape leaves the cell as it was.
	await tabelo.cell(1, 1).dblclick();
	await page.keyboard.type("xyz");
	await page.keyboard.press("Escape");
	await expect(tabelo.cell(1, 1)).toHaveText("Ingrid");
});

test("the link dialog links a cell, edits it, and removes it", async ({
	page,
	tabelo,
}) => {
	await loadFixture(tabelo);
	const cell = tabelo.cell(2, 2);
	await cell.click();
	await page.keyboard.press("ControlOrMeta+K");

	let dialog = page.getByRole("dialog");
	await expect(dialog).toBeVisible();
	const text = dialog.getByRole("textbox", { name: copy.link.text });
	await expect(text).toBeFocused();
	await expect(text).toHaveValue("Madrid");
	// Adding a link: there is no link yet, so nothing to remove.
	await expect(
		dialog.getByRole("button", { name: copy.link.remove }),
	).toHaveCount(0);

	// Cancel leaves nothing behind, and focus returns to the cell.
	await dialog.getByRole("button", { name: copy.actions.cancel }).click();
	await expect(dialog).toBeHidden();
	await expect(cell).toBeFocused();
	await expect(cell.getByRole("link")).toHaveCount(0);

	// Save requires an address.
	await page.keyboard.press("ControlOrMeta+K");
	dialog = page.getByRole("dialog");
	await dialog.getByRole("button", { name: copy.link.confirm }).click();
	const address = dialog.getByRole("textbox", { name: copy.link.address });
	await expect(address).toHaveAttribute("aria-invalid", "true");
	await address.fill("mailto:paulo@example.com");
	await dialog.getByRole("button", { name: copy.link.confirm }).click();
	await expect(dialog).toBeHidden();
	await expect(cell.getByRole("link", { name: "Madrid" })).toHaveAttribute(
		"href",
		"mailto:paulo@example.com",
	);
	await expect
		.poll(() => markdown(tabelo))
		.toContain("[Madrid](mailto:paulo@example.com)");

	// Remove link keeps the text.
	await cell.click();
	await page.keyboard.press("ControlOrMeta+K");
	dialog = page.getByRole("dialog");
	await dialog.getByRole("button", { name: copy.link.remove }).click();
	await expect(dialog).toBeHidden();
	await expect(cell.getByRole("link")).toHaveCount(0);
	await expect(cell).toHaveText("Madrid");
});

test("Mod+K in the editor links the selected text and keeps editing", async ({
	page,
	tabelo,
}) => {
	await loadFixture(tabelo);
	const cell = tabelo.cell(2, 1);
	await cell.dblclick();
	const editor = tabelo.grid().getByRole("textbox", {
		name: copy.a11y.cellEditor(1, 0),
	});
	await editor.press("ControlOrMeta+A");
	await editor.press("ControlOrMeta+K");

	const dialog = page.getByRole("dialog");
	await dialog
		.getByRole("textbox", { name: copy.link.address })
		.fill("https://example.com/paulo");
	await dialog.getByRole("button", { name: copy.link.confirm }).click();
	await expect(dialog).toBeHidden();
	await expect(editor).toBeFocused();

	await page.keyboard.type("!");
	await page.keyboard.press("Enter");
	await expect(cell.getByRole("link", { name: "Paulo" })).toBeVisible();
	await expect
		.poll(() => markdown(tabelo))
		.toContain("[Paulo](https://example.com/paulo)!");
});

test("the image dialog requires alternative text and inserts an image", async ({
	page,
	tabelo,
}) => {
	await loadFixture(tabelo);
	const cell = tabelo.cell(2, 2);
	const menu = await openCellMenu(tabelo, cell);
	await menu.getByRole("menuitem", { name: copy.actions.image }).click();

	const dialog = page.getByRole("dialog");
	const address = dialog.getByRole("textbox", { name: copy.image.address });
	await expect(address).toBeFocused();
	await address.fill("http://example.com/madrid.png");
	await dialog.getByRole("button", { name: copy.image.insert }).click();
	const alt = dialog.getByRole("textbox", { name: copy.image.alt });
	await expect(alt).toHaveAttribute("aria-invalid", "true");

	await alt.fill("Retiro");
	await dialog.getByRole("button", { name: copy.image.insert }).click();
	await expect(dialog).toBeHidden();
	await expect(cell).toBeFocused();

	// An insecure address never loads: the alternative text stands in.
	const image = cell.getByRole("img", { name: "Retiro" });
	await expect(image).toHaveAttribute("data-image-state", "unavailable");
	await expect
		.poll(() => markdown(tabelo))
		.toContain("Madrid![Retiro](http://example.com/madrid.png)");

	// In the editor the image is one unit: one Backspace removes it whole.
	await cell.dblclick();
	await page.keyboard.press("Backspace");
	await page.keyboard.press("Enter");
	await expect(cell.getByRole("img")).toHaveCount(0);
	await expect(cell).toHaveText("Madrid");
});

// #398: the rich editor opens its own menu, which acts on the text being
// edited rather than on the whole cell.
async function openEditorMenu(
	tabelo: TabeloPage,
	editor: Locator,
	via: "pointer" | "keyboard",
): Promise<Locator> {
	if (via === "pointer") {
		const box = await editor.boundingBox();
		if (!box) throw new Error("the editor has no box");
		// Past the end of the text, where the caret already is.
		await editor.click({
			button: "right",
			position: { x: box.width - 8, y: box.height / 2 },
		});
	} else {
		await tabelo.page.keyboard.press("Shift+F10");
	}
	const menu = tabelo.page.getByRole("menu");
	await expect(menu).toBeVisible();
	return menu;
}

test("the editor's menu formats the selected text and keeps editing", async ({
	page,
	tabelo,
}) => {
	await loadFixture(tabelo);
	const cell = tabelo.cell(2, 1);
	await cell.dblclick();
	const editor = tabelo.grid().getByRole("textbox", {
		name: copy.a11y.cellEditor(1, 0),
	});
	await expect(editor).toBeFocused();
	await page.keyboard.press("Shift+ArrowLeft");
	await page.keyboard.press("Shift+ArrowLeft");

	let menu = await openEditorMenu(tabelo, editor, "keyboard");
	// The Format group, Link, and Image, and nothing that acts on cells.
	await expect(menu.getByRole("menuitemcheckbox")).toHaveCount(5);
	await expect(menu.getByRole("menuitemradio")).toHaveCount(0);
	await expect(menu.getByRole("menuitem")).toHaveCount(2);
	await formatToggle(menu, copy.actions.bold).click();
	await expect(menu).toBeHidden();

	// Only the selected letters, and the editor is still editing them.
	await expect(editor).toBeFocused();
	await expect(editor.locator("strong")).toHaveText("lo");

	// The same range now reads as bold, and closing the menu keeps editing.
	menu = await openEditorMenu(tabelo, editor, "keyboard");
	await expect(formatToggle(menu, copy.actions.bold)).toHaveAttribute(
		"aria-checked",
		"true",
	);
	await page.keyboard.press("Escape");
	await expect(menu).toBeHidden();
	await expect(editor).toBeFocused();

	// The menu's change is a local undo step.
	await page.keyboard.press("ControlOrMeta+Z");
	await expect(editor.locator("strong")).toHaveCount(0);
	await page.keyboard.press("ControlOrMeta+Shift+Z");
	await page.keyboard.press("Enter");
	await expect(cell.locator("strong")).toHaveText("lo");
	await expect.poll(() => markdown(tabelo)).toContain("Pau**lo**");
});

test("a right-click in the editor sets the caret's typing marks", async ({
	page,
	tabelo,
}) => {
	await loadFixture(tabelo);
	const cell = tabelo.cell(2, 2);
	await cell.dblclick();
	const editor = tabelo.grid().getByRole("textbox", {
		name: copy.a11y.cellEditor(1, 1),
	});
	await expect(editor).toBeFocused();

	const menu = await openEditorMenu(tabelo, editor, "pointer");
	await expect(formatToggle(menu, copy.actions.italic)).toHaveAttribute(
		"aria-checked",
		"false",
	);
	await formatToggle(menu, copy.actions.italic).click();
	await expect(menu).toBeHidden();
	await expect(editor).toBeFocused();
	await page.keyboard.type("!");
	await expect(editor.locator("em")).toHaveText("!");
	await page.keyboard.press("Enter");
	await expect(cell.locator("em")).toHaveText("!");
	await expect.poll(() => markdown(tabelo)).toContain("_!_");
});

test("the editor's menu links the selected text and inserts an image at the caret", async ({
	page,
	tabelo,
}) => {
	await loadFixture(tabelo);
	const cell = tabelo.cell(2, 2);
	await cell.dblclick();
	const editor = tabelo.grid().getByRole("textbox", {
		name: copy.a11y.cellEditor(1, 1),
	});
	await expect(editor).toBeFocused();

	// The first three letters become a link. The caret starts at the end.
	for (let step = 0; step < "Madrid".length; step += 1) {
		await page.keyboard.press("ArrowLeft");
	}
	for (let step = 0; step < 3; step += 1) {
		await page.keyboard.press("Shift+ArrowRight");
	}
	let menu = await openEditorMenu(tabelo, editor, "keyboard");
	await menu.getByRole("menuitem", { name: copy.actions.link }).click();
	let dialog = page.getByRole("dialog");
	await expect(
		dialog.getByRole("textbox", { name: copy.link.text }),
	).toHaveValue("Mad");
	await dialog
		.getByRole("textbox", { name: copy.link.address })
		.fill("https://example.com/madrid");
	await dialog.getByRole("button", { name: copy.link.confirm }).click();
	await expect(dialog).toBeHidden();
	await expect(editor).toBeFocused();
	await expect(editor.locator("[data-editor-link]")).toHaveText("Mad");

	// The image goes where the caret is, between the link and the rest.
	menu = await openEditorMenu(tabelo, editor, "keyboard");
	await menu.getByRole("menuitem", { name: copy.actions.image }).click();
	dialog = page.getByRole("dialog");
	// Adding: nothing to remove yet.
	await expect(
		dialog.getByRole("button", { name: copy.image.remove }),
	).toHaveCount(0);
	await dialog
		.getByRole("textbox", { name: copy.image.address })
		.fill("https://example.com/retiro.png");
	await dialog.getByRole("textbox", { name: copy.image.alt }).fill("Retiro");
	await dialog.getByRole("button", { name: copy.image.insert }).click();
	await expect(dialog).toBeHidden();
	await expect(editor).toBeFocused();

	await page.keyboard.press("Enter");
	await expect(cell.getByRole("img", { name: "Retiro" })).toHaveCount(1);
	await expect
		.poll(() => markdown(tabelo))
		.toContain(
			"[Mad](https://example.com/madrid)![Retiro](https://example.com/retiro.png)rid",
		);
});

// #399: an image is edited or removed through the same dialog that adds one.
test("the cell menu edits and removes a cell's only image", async ({
	page,
	tabelo,
}) => {
	await tabelo.importFile(
		"photo.md",
		"| Photo |\n| --- |\n| ![Retiro](https://example.com/madrid.png) |",
		"text/markdown",
	);
	await tabelo.showInSourcePane("markdown");
	const cell = tabelo.cell(1, 1);
	await expect(cell.getByRole("img", { name: "Retiro" })).toHaveCount(1);

	let menu = await openCellMenu(tabelo, cell);
	await menu.getByRole("menuitem", { name: copy.actions.image }).click();
	let dialog = page.getByRole("dialog");
	const address = dialog.getByRole("textbox", { name: copy.image.address });
	const alt = dialog.getByRole("textbox", { name: copy.image.alt });
	await expect(address).toBeFocused();
	await expect(address).toHaveValue("https://example.com/madrid.png");
	await expect(alt).toHaveValue("Retiro");

	// Cancel writes nothing, whatever was typed.
	await alt.fill("Retiro park");
	await dialog.getByRole("button", { name: copy.actions.cancel }).click();
	await expect(dialog).toBeHidden();
	await expect(cell).toBeFocused();
	await expect(cell.getByRole("img", { name: "Retiro" })).toHaveCount(1);

	// Save replaces the image in place, and the alternative text is required.
	menu = await openCellMenu(tabelo, cell);
	await menu.getByRole("menuitem", { name: copy.actions.image }).click();
	dialog = page.getByRole("dialog");
	await dialog.getByRole("textbox", { name: copy.image.alt }).fill(" ");
	await dialog.getByRole("button", { name: copy.image.save }).click();
	await expect(
		dialog.getByRole("textbox", { name: copy.image.alt }),
	).toHaveAttribute("aria-invalid", "true");
	await dialog
		.getByRole("textbox", { name: copy.image.alt })
		.fill("Retiro park");
	await dialog.getByRole("button", { name: copy.image.save }).click();
	await expect(dialog).toBeHidden();
	await expect(cell).toBeFocused();
	await expect
		.poll(() => markdown(tabelo))
		.toContain("![Retiro park](https://example.com/madrid.png)");

	// Remove image takes it out as one undoable step.
	menu = await openCellMenu(tabelo, cell);
	await menu.getByRole("menuitem", { name: copy.actions.image }).click();
	dialog = page.getByRole("dialog");
	await dialog.getByRole("button", { name: copy.image.remove }).click();
	await expect(dialog).toBeHidden();
	await expect(cell.getByRole("img")).toHaveCount(0);
	await tabelo.runAppCommand("undo");
	await expect(cell.getByRole("img", { name: "Retiro park" })).toHaveCount(1);
});

test("the editor's menu edits the image beside the caret", async ({
	page,
	tabelo,
}) => {
	await tabelo.importFile(
		"photo.md",
		"| Photo |\n| --- |\n| Madrid ![Retiro](https://example.com/madrid.png) |",
		"text/markdown",
	);
	await tabelo.showInSourcePane("markdown");
	const cell = tabelo.cell(1, 1);
	await cell.dblclick();
	const editor = tabelo.grid().getByRole("textbox", {
		name: copy.a11y.cellEditor(0, 0),
	});
	await expect(editor).toBeFocused();

	// The caret starts at the end, just after the image.
	const menu = await openEditorMenu(tabelo, editor, "keyboard");
	await menu.getByRole("menuitem", { name: copy.actions.image }).click();
	const dialog = page.getByRole("dialog");
	await expect(
		dialog.getByRole("textbox", { name: copy.image.alt }),
	).toHaveValue("Retiro");
	await dialog.getByRole("button", { name: copy.image.remove }).click();
	await expect(dialog).toBeHidden();
	await expect(editor).toBeFocused();
	await expect(editor.getByRole("img")).toHaveCount(0);

	await page.keyboard.press("Enter");
	await expect(cell).toContainText("Madrid");
	await expect(cell.getByRole("img")).toHaveCount(0);
});

test("find matches the text a formatted cell shows", async ({
	page,
	tabelo,
}) => {
	await loadFixture(tabelo);
	await tabelo.cell(1, 2).click();
	await page.keyboard.press("ControlOrMeta+F");
	// Only the link's label holds these letters; its address never matches.
	await page.keyboard.type("io");
	const current = tabelo.cell(1, 2).locator("[data-find-current]");
	await expect(current).toHaveText("io");
	// The mark sits inside the link, which keeps its address.
	await expect(tabelo.cell(1, 2).locator("a")).toHaveCount(2);
});
