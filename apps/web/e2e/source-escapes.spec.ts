import type { Locator, Page } from "@playwright/test";
import { samplePerson } from "@/core/sample-data";
import { escapeCell } from "@/formats/markdown";
import { expect, test } from "./fixtures";
import {
	lastCopied,
	recordingClipboard,
	renderedSource,
	storedDocument,
	type TabeloPage,
} from "./helpers";

// An escape sequence is notation the codec wrote, drawn as the one character it
// stands for. What these tests protect is that it is only ever a drawing: the
// same bytes reach the document, the clipboard, and storage whether the glyphs
// are drawn or not, and the caret keeps addressing the characters the file
// holds.

const glyph = ".cm-tabeloEscape";

const first = samplePerson(0);

// One row holding every sequence the two codecs write: a trailing space, a
// pipe, a backslash, an ampersand, and a line break. It is typed into the
// Markdown view rather than pasted, because a line break inside a cell is a row
// break in every delimited flavour the clipboard carries.
const sequences = ["&#32;", "\\|", "\\\\", "&amp;", "<br>"];

const markdownSource = [
	"| Trailing | Pipe | Backslash | Ampersand | Break |",
	"| --- | --- | --- | --- | --- |",
	`| ${first.city}${sequences[0]} | a${sequences[1]}b | back${sequences[2]}slash | x${sequences[3]}y | line${sequences[4]}break |`,
].join("\n");

async function seedEscapes(tabelo: TabeloPage, page: Page): Promise<void> {
	const editor = tabelo.source("markdown");
	await editor.click();
	await page.keyboard.press("ControlOrMeta+a");
	await page.keyboard.type(markdownSource);
	// The parse has to land before another view can re-serialize it.
	await expect(tabelo.cell(1, 2)).toHaveText("a|b");
}

// What each glyph draws, as the theme generates it. Quotation marks are how a
// computed `content` comes back.
async function drawnGlyphs(pane: Locator): Promise<string[]> {
	return pane.evaluate((element) =>
		Array.from(element.querySelectorAll(".cm-tabeloEscape"), (span) => {
			// A computed `content` comes back as a CSS string, quoted and with
			// its own backslashes escaped.
			const content = getComputedStyle(span, "::before").content;
			return content.slice(1, -1).replaceAll("\\\\", "\\");
		}),
	);
}

// The width each glyph declares, which is the one owner of how much room the
// notation keeps. It is stated in characters of the editor's own font, so it
// follows the pane's zoom without anything measuring anything.
async function declaredWidths(pane: Locator): Promise<string[]> {
	return pane.evaluate((element) =>
		Array.from(
			element.querySelectorAll(".cm-tabeloEscape"),
			(span) => (span as HTMLElement).style.width,
		),
	);
}

test("every sequence a codec writes is drawn as one glyph", async ({
	tabelo,
	page,
}) => {
	await seedEscapes(tabelo, page);

	const markdown = tabelo.pane("markdown");
	// The space entity, the escaped pipe, the escaped backslash, the escaped
	// ampersand, and the line break, in the order the row lists them.
	expect(await drawnGlyphs(markdown)).toEqual(["·", "|", "\\", "&", "↵"]);

	await tabelo.choosePaneView("markdown", "jira");
	const jira = tabelo.pane("jira");
	// Jira escapes no whitespace, so its trailing space stays a space; the other
	// four sequences are its own spellings of the same four characters.
	expect(await drawnGlyphs(jira)).toEqual(["|", "\\", "&", "↵"]);
});

test("a glyph keeps the room of the sequence it replaces", async ({
	tabelo,
	page,
}) => {
	await seedEscapes(tabelo, page);
	const pane = tabelo.pane("markdown");

	// Markdown padded each column counting the sequence's own characters, so the
	// glyph declares exactly that many. The spelling comes from the codec rather
	// than only from the list above, so a change to the grammar reaches this
	// expectation instead of quietly passing it.
	expect(escapeCell(`${first.city} `)).toContain(sequences[0]);
	expect(await declaredWidths(pane)).toEqual(
		sequences.map((sequence) => `${sequence.length}ch`),
	);

	// The width is stated in the editor's own character, so a zoom step changes
	// what a character measures and never what the glyph claims. The alignment
	// of the column therefore holds at every zoom level without the editor
	// recomputing a layout of its own.
	await tabelo.runPaneCommand("markdown", "zoomIn");
	await tabelo.runPaneCommand("markdown", "zoomIn");
	expect(await declaredWidths(pane)).toEqual(
		sequences.map((sequence) => `${sequence.length}ch`),
	);
	await tabelo.runPaneCommand("markdown", "zoomOut");
	await tabelo.runPaneCommand("markdown", "zoomOut");
	await tabelo.runPaneCommand("markdown", "zoomOut");
	expect(await declaredWidths(pane)).toEqual(
		sequences.map((sequence) => `${sequence.length}ch`),
	);
});

test("the glyph is drawn over the source without joining it", async ({
	tabelo,
	page,
}) => {
	// The recorder is installed for the next load, so the page is reloaded onto
	// it before anything is typed.
	await recordingClipboard(page);
	await page.reload();
	await tabelo.dismissWelcome();
	await expect(tabelo.workspace).toBeVisible();
	await seedEscapes(tabelo, page);
	const pane = tabelo.pane("markdown");
	await expect(pane.locator(glyph).first()).toBeVisible();

	// The glyph is drawn for the eye only, so nothing it paints can be read out
	// or picked up by a copy that falls back to the DOM.
	await expect(pane.locator(glyph).first()).toHaveAttribute(
		"aria-hidden",
		"true",
	);

	// What the accessible tree and any DOM reader still hold is the source
	// itself: the sequences exactly as the codec wrote them, and none of the
	// characters the glyphs paint.
	const source = await renderedSource(pane);
	for (const drawn of ["·", "↵"]) expect(source).not.toContain(drawn);
	for (const sequence of sequences) expect(source).toContain(sequence);

	// The clipboard and storage carry the source, not the drawing.
	await tabelo.runPaneCommand("markdown", "copySource");
	await expect
		.poll(async () => (await lastCopied(page))?.text)
		.toContain("&#32;");
	expect((await lastCopied(page))?.text).not.toContain("·");
	expect(await storedDocument(page)).not.toContain("·");
});

test("the caret steps over a sequence rather than into it", async ({
	tabelo,
	page,
}) => {
	// One escape on a line of its own making, so the count of key presses is
	// what the assertion turns on.
	await tabelo.paste(["Note", "a|b"].join("\n"));
	const pane = tabelo.pane("markdown");
	const editor = tabelo.source("markdown");
	await expect(pane.locator(glyph)).toHaveCount(1);

	// From the end of the row: past the closing pipe, its padding, and `b`, the
	// next step crosses the whole sequence at once. A caret that could rest
	// inside it would land between the backslash and the pipe instead.
	await editor.click();
	await page.keyboard.press("ControlOrMeta+End");
	await page.keyboard.press("End");
	for (let press = 0; press < 4; press += 1) {
		await page.keyboard.press("ArrowLeft");
	}
	await page.keyboard.type("Z");

	expect(await renderedSource(pane)).toContain("aZ\\|b");
	// And the edit is an ordinary one that reaches the table.
	await expect(tabelo.cell(1, 1)).toHaveText("aZ|b");
});

test("hovering a glyph says what the sequence stands for", async ({
	tabelo,
	page,
}) => {
	await seedEscapes(tabelo, page);
	const pane = tabelo.pane("markdown");
	await pane.locator(glyph).first().hover();

	const tooltip = page.locator(".cm-tooltip");
	await expect(tooltip).toBeVisible();
	// The spelling the file holds, so a reader can match what they are told
	// against what is written there.
	await expect(tooltip).toContainText("&#32;");
});

test("text that only looks like a sequence stays text", async ({ tabelo }) => {
	// The literal five characters `&#32;`, which Markdown serializes with its
	// ampersand protected. Only that ampersand is notation.
	await tabelo.paste(["Note", "&#32;"].join("\n"));
	const pane = tabelo.pane("markdown");

	expect(await renderedSource(pane)).toContain("&amp;#32;");
	expect(await drawnGlyphs(pane)).toEqual(["&"]);
	// The value itself is untouched by any of it.
	await expect(tabelo.cell(1, 1)).toHaveText("&#32;");
});
