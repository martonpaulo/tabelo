import type { Locator, Page } from "@playwright/test";
import { copy } from "@/copy/copy";
import type { ViewId } from "@/views/types";
import { expect, test } from "./fixtures";
import {
	lastCopied,
	recordingClipboard,
	renderedSource,
	storedDocument,
	type TabeloPage,
} from "./helpers";

// The Markdown alignment divider kept in step with its table (#297), a new
// Markdown or Jira row opened with its delimiter on Enter (#391), a Markdown
// column kept padded to its widest cell while typing (#401), and the
// pane's switch that turns that assistance off for the current buffer. See
// "Source text is free; structural assistance is narrow" in AGENTS.md and
// docs/design-system/2-tokens.md, "Structural assistance can always be switched off".

// Already consistent, so seeding it leaves every byte as written.
const TABLE = [
	"| name   | city |",
	"| ------ | ---- |",
	"| Ingrid | Rio  |",
].join("\n");

async function seed(tabelo: TabeloPage): Promise<Locator> {
	const editor = tabelo.source("markdown");
	await editor.fill(TABLE);
	await expect(tabelo.cell(1, 2)).toHaveText("Rio");
	return editor;
}

function markdownLines(tabelo: TabeloPage): Promise<string[]> {
	return renderedSource(tabelo.pane("markdown")).then((text) =>
		text.split("\n"),
	);
}

async function expectDivider(tabelo: TabeloPage, divider: string) {
	await expect.poll(async () => (await markdownLines(tabelo))[1]).toBe(divider);
}

// The caret just inside the header's closing pipe, after "city".
async function caretAfterCity(page: Page, editor: Locator): Promise<void> {
	await editor.click();
	await page.keyboard.press("ControlOrMeta+Home");
	await page.keyboard.press("End");
	await page.keyboard.press("ArrowLeft");
	await page.keyboard.press("ArrowLeft");
}

function assistanceItem(menu: Locator): Locator {
	return menu.getByRole("menuitemcheckbox", {
		name: copy.workspace.structuralAssistance,
	});
}

async function setAssistance(
	tabelo: TabeloPage,
	enabled: boolean,
	view: ViewId = "markdown",
): Promise<void> {
	const menu = await tabelo.openPaneMenu(view);
	const item = assistanceItem(menu);
	if ((await item.getAttribute("aria-checked")) !== String(enabled)) {
		await item.click();
	}
	await expect(item).toHaveAttribute("aria-checked", String(enabled));
	await tabelo.page.keyboard.press("Escape");
	await menu.waitFor({ state: "hidden" });
}

async function expectAssistance(tabelo: TabeloPage, enabled: boolean) {
	const menu = await tabelo.openPaneMenu("markdown");
	await expect(assistanceItem(menu)).toHaveAttribute(
		"aria-checked",
		String(enabled),
	);
	await tabelo.page.keyboard.press("Escape");
	await menu.waitFor({ state: "hidden" });
}

test.describe("markdown divider assistance", () => {
	test("a header edit resizes the divider and every view follows", async ({
		page,
		tabelo,
	}) => {
		await recordingClipboard(page);
		await page.reload();
		await tabelo.dismissWelcome();
		const editor = await seed(tabelo);
		await caretAfterCity(page, editor);
		await page.keyboard.type("name");

		await expectDivider(tabelo, "| ------ | -------- |");
		await expect(tabelo.header(2)).toHaveText("cityname");
		// The caret stayed where the user was typing.
		await page.keyboard.type("s");
		await expect(tabelo.header(2)).toHaveText("citynames");
		await expectDivider(tabelo, "| ------ | --------- |");

		// The adjusted divider is the draft's own text: it is what Copy source
		// hands over, and what a reload restores.
		await tabelo.runPaneCommand("markdown", "copySource");
		await expect
			.poll(async () => (await lastCopied(page))?.text.split("\n")[1])
			.toBe("| ------ | --------- |");
		await page.reload();
		await expect(tabelo.header(2)).toHaveText("citynames");
		await expectDivider(tabelo, "| ------ | --------- |");
	});

	test("one undo removes the edit and its adjustment, one redo restores both", async ({
		page,
		tabelo,
	}) => {
		const editor = await seed(tabelo);
		await caretAfterCity(page, editor);
		await page.keyboard.type("!!!!");
		await expectDivider(tabelo, "| ------ | -------- |");

		// Typed in one burst, so the local history holds it as one step.
		await page.keyboard.press("ControlOrMeta+z");
		await expect
			.poll(() => renderedSource(tabelo.pane("markdown")))
			.toBe(TABLE);
		await page.keyboard.press("ControlOrMeta+Shift+Z");
		await expectDivider(tabelo, "| ------ | -------- |");
		await expect(tabelo.header(2)).toHaveText("city!!!!");

		// The app menu walks the same local step.
		await tabelo.runAppCommand("undo");
		await expect
			.poll(() => renderedSource(tabelo.pane("markdown")))
			.toBe(TABLE);
	});

	test("the divider stays ordinary editable text", async ({ page, tabelo }) => {
		const editor = await seed(tabelo);
		// A valid marker typed into the divider is the new alignment.
		await editor.click();
		await page.keyboard.press("ControlOrMeta+Home");
		await page.keyboard.press("ArrowDown");
		await page.keyboard.press("End");
		await page.keyboard.press("ArrowLeft");
		await page.keyboard.press("ArrowLeft");
		await page.keyboard.type(":");
		await expectDivider(tabelo, "| ------ | ---: |");
		await expect.poll(() => storedDocument(page)).toContain('"align":"right"');

		// A column added in the header gains its own unmarked cell.
		await page.keyboard.press("ControlOrMeta+Home");
		await page.keyboard.press("End");
		await page.keyboard.type(" age |");
		await expectDivider(tabelo, "| ------ | ---: | --- |");
		await expect(tabelo.header(3)).toHaveText("age");
	});

	test("switched off, the buffer is plain text until it is replaced", async ({
		page,
		tabelo,
	}) => {
		const editor = await seed(tabelo);
		await setAssistance(tabelo, false);
		// Switching it changes no text.
		await expect
			.poll(() => renderedSource(tabelo.pane("markdown")))
			.toBe(TABLE);

		await caretAfterCity(page, editor);
		await page.keyboard.type("name");
		await expectDivider(tabelo, "| ------ | ---- |");
		await expect(tabelo.header(2)).toHaveText("cityname");

		// An invalid divider stays exactly as typed, and the mode survives it.
		await page.keyboard.press("ArrowDown");
		await page.keyboard.type("x");
		await expect
			.poll(async () => (await markdownLines(tabelo))[1])
			.toContain("x");
		await expect(editor).toHaveAttribute("aria-invalid", "true");
		await expectAssistance(tabelo, false);
		await editor.click();
		await page.keyboard.press("ControlOrMeta+Home");
		await page.keyboard.press("ArrowDown");
		await page.keyboard.press("End");
		await page.keyboard.press("Backspace");
		await expect(editor).not.toHaveAttribute("aria-invalid", "true");

		// Switching it back on rewrites nothing until the next edit.
		await setAssistance(tabelo, true);
		await expectDivider(tabelo, "| ------ | ---- |");
		await caretAfterCity(page, editor);
		await page.keyboard.type("s");
		await expectDivider(tabelo, "| ------ | --------- |");
	});

	test("the switch resets when the buffer is superseded, changed, or reloaded", async ({
		page,
		tabelo,
	}) => {
		const editor = await seed(tabelo);

		// A grid edit supersedes the pane's draft.
		await setAssistance(tabelo, false);
		await tabelo.editCell(1, 1, "Paulo");
		await expect(editor).toContainText("Paulo");
		await expectAssistance(tabelo, true);

		// A draft brought back by document undo starts with it on too.
		await setAssistance(tabelo, false);
		await tabelo.cell(1, 2).click();
		await page.keyboard.press("ControlOrMeta+z");
		await expect(tabelo.cell(1, 1)).toHaveText("Ingrid");
		await expect(editor).toContainText("Ingrid");
		await expectAssistance(tabelo, true);

		// A view change replaces the buffer.
		await setAssistance(tabelo, false);
		await tabelo.choosePaneView("markdown", "csv");
		await tabelo.choosePaneView("csv", "markdown");
		await expectAssistance(tabelo, true);

		// A reload starts it on again, with the draft itself kept.
		await setAssistance(tabelo, false);
		await caretAfterCity(page, tabelo.source("markdown"));
		await page.keyboard.type("name");
		await expect(tabelo.header(2)).toHaveText("cityname");
		await expect.poll(() => storedDocument(page)).toContain("cityname");
		await page.reload();
		await expect(tabelo.header(2)).toHaveText("cityname");
		await expectAssistance(tabelo, true);
	});
});

// The caret at the end of the source's last line.
async function caretAtEnd(page: Page, editor: Locator): Promise<void> {
	await editor.click();
	await page.keyboard.press("ControlOrMeta+End");
}

// The caret just after "Rio" in the last row, before its padding.
async function caretAfterRio(page: Page, editor: Locator): Promise<void> {
	await caretAtEnd(page, editor);
	await page.keyboard.press("End");
	await page.keyboard.press("ArrowLeft");
	await page.keyboard.press("ArrowLeft");
	await page.keyboard.press("ArrowLeft");
}

const GROWN = [
	"| name   | city       |",
	"| ------ | ---------- |",
	"| Ingrid | Rio Grande |",
].join("\n");

// The column being typed in keeps every row padded to its widest cell, in the
// text itself (#401).
test.describe("markdown column padding assistance", () => {
	test("a growing cell re-pads its column in every row, undone as one step", async ({
		page,
		tabelo,
	}) => {
		const editor = await seed(tabelo);
		await caretAfterRio(page, editor);
		await page.keyboard.type(" Grande");
		await expect
			.poll(() => renderedSource(tabelo.pane("markdown")))
			.toBe(GROWN);
		await expect(tabelo.cell(1, 2)).toHaveText("Rio Grande");

		// Typed in one burst, so one undo takes the text and every row's padding.
		await page.keyboard.press("ControlOrMeta+z");
		await expect
			.poll(() => renderedSource(tabelo.pane("markdown")))
			.toBe(TABLE);
		await expect(tabelo.cell(1, 2)).toHaveText("Rio");
	});

	test("deleting from the widest cell shrinks the column; switched off, rows keep their padding", async ({
		page,
		tabelo,
	}) => {
		const editor = await seed(tabelo);
		await caretAfterRio(page, editor);
		await page.keyboard.type(" Grande");
		await expect
			.poll(() => renderedSource(tabelo.pane("markdown")))
			.toBe(GROWN);
		// The caret stayed after what was typed, so Backspace takes it back.
		for (let index = 0; index < " Grande".length; index += 1) {
			await page.keyboard.press("Backspace");
		}
		await expect
			.poll(() => renderedSource(tabelo.pane("markdown")))
			.toBe(TABLE);

		await setAssistance(tabelo, false);
		await caretAfterRio(page, editor);
		await page.keyboard.type(" Grande");
		await expect(tabelo.cell(1, 2)).toHaveText("Rio Grande");
		await expect
			.poll(() => renderedSource(tabelo.pane("markdown")))
			.toBe(TABLE.replace("Rio  |", "Rio Grande  |"));
	});
});

// Line text is read after typing into the new line, because an empty cell's
// placeholder draws over the bare delimiter (#274).
test.describe("markdown row-start assistance", () => {
	test("Enter at the end of a row opens the next one, undone as one step", async ({
		page,
		tabelo,
	}) => {
		const editor = await seed(tabelo);
		await caretAtEnd(page, editor);
		await page.keyboard.press("Enter");
		// The new line is already a row of the table.
		await expect(tabelo.cell(2, 1)).toBeVisible();

		// One undo takes the delimiter and the line break together.
		await page.keyboard.press("ControlOrMeta+z");
		await expect
			.poll(() => renderedSource(tabelo.pane("markdown")))
			.toBe(TABLE);
		await expect(tabelo.cell(2, 1)).toHaveCount(0);

		// Typing straight after the delimiter writes the new row.
		await page.keyboard.press("Enter");
		await page.keyboard.type("Paulo | Madrid |");
		await expect
			.poll(async () => (await markdownLines(tabelo))[3])
			.toBe("| Paulo | Madrid |");
		await expect(tabelo.cell(2, 1)).toHaveText("Paulo");
		await expect(tabelo.cell(2, 2)).toHaveText("Madrid");
		await expect.poll(() => storedDocument(page)).toContain("Madrid");
	});

	test("Enter after the header, inside a row, or switched off is a plain break", async ({
		page,
		tabelo,
	}) => {
		const editor = await seed(tabelo);
		// The divider belongs under the header, so no row opens there.
		await editor.click();
		await page.keyboard.press("ControlOrMeta+Home");
		await page.keyboard.press("End");
		await page.keyboard.press("Enter");
		await page.keyboard.type("x");
		await expect.poll(async () => (await markdownLines(tabelo))[1]).toBe("x");

		// A break inside a row splits it and adds nothing.
		await editor.fill(TABLE);
		await caretAtEnd(page, editor);
		await page.keyboard.press("Home");
		await page.keyboard.press("ArrowRight");
		await page.keyboard.press("Enter");
		await page.keyboard.type("x");
		await expect
			.poll(async () => (await markdownLines(tabelo)).at(-1))
			.toBe("x Ingrid | Rio  |");

		await editor.fill(TABLE);
		await setAssistance(tabelo, false);
		await caretAtEnd(page, editor);
		await page.keyboard.press("Enter");
		await page.keyboard.type("x");
		await expect
			.poll(async () => (await markdownLines(tabelo)).at(-1))
			.toBe("x");
	});
});

const JIRA_TABLE = ["||name||city||", "|Ingrid|Rio|"].join("\n");

async function seedJira(tabelo: TabeloPage): Promise<Locator> {
	await tabelo.choosePaneView("markdown", "jira");
	const editor = tabelo.source("jira");
	await editor.fill(JIRA_TABLE);
	await expect(tabelo.cell(1, 2)).toHaveText("Rio");
	return editor;
}

function jiraLines(tabelo: TabeloPage): Promise<string[]> {
	return renderedSource(tabelo.pane("jira")).then((text) => text.split("\n"));
}

// Jira keeps a cell's surrounding space as content, so its row opens with a
// bare pipe, and with no divider the header line opens a row too (#391).
test.describe("jira row-start assistance", () => {
	test("Enter at the end of a row opens the next one with a bare pipe, undone as one step", async ({
		page,
		tabelo,
	}) => {
		const editor = await seedJira(tabelo);
		await caretAtEnd(page, editor);
		await page.keyboard.press("Enter");
		await expect(tabelo.cell(2, 1)).toBeVisible();

		await page.keyboard.press("ControlOrMeta+z");
		await expect
			.poll(() => renderedSource(tabelo.pane("jira")))
			.toBe(JIRA_TABLE);
		await expect(tabelo.cell(2, 1)).toHaveCount(0);

		await page.keyboard.press("Enter");
		await page.keyboard.type("Paulo|Madrid|");
		await expect
			.poll(async () => (await jiraLines(tabelo))[2])
			.toBe("|Paulo|Madrid|");
		// No padding reached the first cell.
		await expect(tabelo.cell(2, 1)).toHaveText("Paulo");
		await expect(tabelo.cell(2, 2)).toHaveText("Madrid");
	});

	test("Enter after the header opens a row; switched off it is a plain break", async ({
		page,
		tabelo,
	}) => {
		const editor = await seedJira(tabelo);
		await editor.click();
		await page.keyboard.press("ControlOrMeta+Home");
		await page.keyboard.press("End");
		await page.keyboard.press("Enter");
		await page.keyboard.type("Paulo|Madrid|");
		await expect
			.poll(async () => (await jiraLines(tabelo))[1])
			.toBe("|Paulo|Madrid|");
		await expect(tabelo.cell(1, 1)).toHaveText("Paulo");

		await editor.fill(JIRA_TABLE);
		await setAssistance(tabelo, false, "jira");
		await caretAtEnd(page, editor);
		await page.keyboard.press("Enter");
		await page.keyboard.type("x");
		await expect.poll(async () => (await jiraLines(tabelo)).at(-1)).toBe("x");
	});
});
