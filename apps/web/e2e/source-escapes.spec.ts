import type { Locator } from "@playwright/test";
import { samplePerson } from "@/core/sample-data";
import { escapeCell } from "@/formats/markdown-inline";
import { LINE_BREAK_GLYPH } from "@/ui/source/indicator-glyphs";
import { expect, test } from "./fixtures";
import {
	editorScroller,
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

const escapeMarker = ".cm-tabeloEscape";
const glyph = ".cm-tabeloEscapeGlyph";
const padding = ".cm-tabeloEscapePadding";

const first = samplePerson(0);

// One row holding every sequence the two codecs write: a trailing space, a
// pipe, a backslash, an ampersand, and a line break. It is typed into the
// Markdown view rather than pasted, because a line break inside a cell is a row
// break in every delimited flavour the clipboard carries.
const sequences = ["&#32;", "\\|", "\\\\", "&amp;", "<br>"] as const;

const markdownSource = [
	"| Trailing | Pipe | Backslash | Ampersand | Break |",
	"| --- | --- | --- | --- | --- |",
	`| ${first.city}${sequences[0]} | a${sequences[1]}b | back${sequences[2]}slash | x${sequences[3]}y | line${sequences[4]}break |`,
].join("\n");

async function seedEscapes(tabelo: TabeloPage): Promise<void> {
	// Filled rather than typed key by key: Enter at the end of a row starts the
	// next one with its delimiter (#391), which would add a pipe of its own.
	await tabelo.source("markdown").fill(markdownSource);
	// The parse has to land before another view can re-serialize it.
	await expect(tabelo.cell(1, 2)).toHaveText("a|b");
}

// What each glyph draws, as the theme generates it. Quotation marks are how a
// computed `content` comes back.
async function drawnGlyphs(pane: Locator): Promise<string[]> {
	return editorScroller(pane).evaluate((element) =>
		Array.from(element.querySelectorAll(".cm-tabeloEscapeGlyph"), (span) => {
			// A computed `content` comes back as a CSS string, quoted and with
			// its own backslashes escaped.
			const content = getComputedStyle(span, "::before").content;
			return content.slice(1, -1).replaceAll("\\\\", "\\");
		}),
	);
}

// The width each glyph declares, and the padding each line break hands back to
// its cell, which together are the one owner of how much room the notation
// keeps. Both are stated in characters of the editor's own font, so they
// follow the pane's zoom without anything measuring anything.
async function declaredWidths(
	pane: Locator,
	selector = ".cm-tabeloEscape",
): Promise<string[]> {
	return editorScroller(pane).evaluate(
		(element, query) =>
			Array.from(
				element.querySelectorAll(query),
				(span) => (span as HTMLElement).style.width,
			),
		selector,
	);
}

// The line break is the one sequence whose glyph takes a single character
// (owner, 2026-09-19); every other glyph keeps its sequence's width.
const lineBreak = sequences[4];
const glyphWidths = sequences.map((sequence) =>
	sequence === lineBreak ? "1ch" : `${sequence.length}ch`,
);
// What the break gave back, as padding at the end of its cell, so the pipe
// after it stays where Markdown's alignment put it.
const cellPadding = [`${lineBreak.length - 1}ch`];

test("every sequence a codec writes is drawn as one glyph", async ({
	tabelo,
}) => {
	await seedEscapes(tabelo);

	const markdown = tabelo.pane("markdown");
	// The space entity, the escaped pipe, the escaped backslash, the escaped
	// ampersand, and the line break, in the order the row lists them.
	expect(await drawnGlyphs(markdown)).toEqual([
		"·",
		"|",
		"\\",
		"&",
		LINE_BREAK_GLYPH,
	]);
	await expect(markdown.locator(escapeMarker).first()).toHaveCSS(
		"font-style",
		"normal",
	);

	await tabelo.choosePaneView("markdown", "jira");
	const jira = tabelo.pane("jira");
	// Jira escapes no whitespace, so its trailing space stays a space; the other
	// four sequences are its own spellings of the same four characters.
	expect(await drawnGlyphs(jira)).toEqual(["|", "\\", "&", LINE_BREAK_GLYPH]);
});

test("the notation keeps the room of the sequence it replaces", async ({
	tabelo,
}) => {
	await seedEscapes(tabelo);
	const pane = tabelo.pane("markdown");

	// Markdown padded each column counting the sequence's own characters, so the
	// glyph declares that many, or one for a line break whose remaining room is
	// drawn as padding before the cell's closing pipe. The spelling comes from the codec rather
	// than only from the list above, so a change to the grammar reaches this
	// expectation instead of quietly passing it.
	expect(escapeCell(`${first.city} `)).toContain(sequences[0]);
	expect(await declaredWidths(pane)).toEqual(glyphWidths);
	expect(await declaredWidths(pane, padding)).toEqual(cellPadding);

	// The width is stated in the editor's own character, so a zoom step changes
	// what a character measures and never what the glyph claims. The alignment
	// of the column therefore holds at every zoom level without the editor
	// recomputing a layout of its own.
	await tabelo.runPaneCommand("markdown", "zoomIn");
	await tabelo.runPaneCommand("markdown", "zoomIn");
	expect(await declaredWidths(pane)).toEqual(glyphWidths);
	expect(await declaredWidths(pane, padding)).toEqual(cellPadding);
	await tabelo.runPaneCommand("markdown", "zoomOut");
	await tabelo.runPaneCommand("markdown", "zoomOut");
	await tabelo.runPaneCommand("markdown", "zoomOut");
	expect(await declaredWidths(pane)).toEqual(glyphWidths);
	expect(await declaredWidths(pane, padding)).toEqual(cellPadding);
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
	await seedEscapes(tabelo);
	const pane = tabelo.pane("markdown");
	await expect(pane.locator(glyph).first()).toBeVisible();

	// The glyph is drawn for the eye only, so nothing it paints can be read out
	// or picked up by a copy that falls back to the DOM.
	await expect(pane.locator(glyph).first()).toHaveAttribute(
		"aria-hidden",
		"true",
	);
	await expect(pane.locator(escapeMarker).first()).not.toHaveAttribute(
		"aria-hidden",
		"true",
	);
	await expect(pane.locator(".cm-tabeloEscapeSource").first()).toHaveText(
		sequences[0],
	);

	// What the accessible tree and any DOM reader still hold is the source
	// itself: the sequences exactly as the codec wrote them, and none of the
	// characters the glyphs paint.
	const source = await renderedSource(pane);
	for (const drawn of ["·", LINE_BREAK_GLYPH]) {
		expect(source).not.toContain(drawn);
	}
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

// CodeMirror measures a caret beside a widget from the widget's own box. The
// glyph's box once took the whole line height, so a caret on either side of a
// sequence was drawn from the top of the line, above the text it belongs to.
// Asserted as containment in the line box and order along the line, never as
// exact positions.
test("a caret beside a sequence stays on the text line", async ({
	tabelo,
	page,
}) => {
	await tabelo.paste(["Note", "a|b"].join("\n"));
	const pane = tabelo.pane("markdown");
	const marker = pane.locator(escapeMarker);
	await expect(marker).toHaveCount(1);
	const box = await marker.boundingBox();
	if (!box) throw new Error("not rendered");
	const centre = box.x + box.width / 2;
	const caret = pane.locator(".cm-tabeloCaret-primary");
	const caretX = async () => (await caret.boundingBox())?.x ?? -1;

	// The caret layer is redrawn after the selection changes, so each check
	// polls for the state the click produces rather than reading once.
	const caretOnTextLine = async () => {
		const caretBox = await caret.boundingBox();
		const lineBox = await pane.locator(".cm-activeLine").boundingBox();
		if (!caretBox || !lineBox) return false;
		return (
			caretBox.y > lineBox.y &&
			caretBox.y + caretBox.height < lineBox.y + lineBox.height
		);
	};

	// Inside the glyph's left half the caret lands before the sequence...
	await page.mouse.click(box.x + 1, box.y + box.height / 2);
	await expect.poll(caretX).toBeLessThan(centre);
	await expect.poll(caretOnTextLine).toBe(true);

	// ...and inside its right half, after it.
	await page.mouse.click(box.x + box.width - 1, box.y + box.height / 2);
	await expect.poll(caretX).toBeGreaterThan(centre);
	await expect.poll(caretOnTextLine).toBe(true);
});

test("hovering a glyph says what the sequence stands for", async ({
	tabelo,
	page,
}) => {
	await seedEscapes(tabelo);
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
	await tabelo.showInSourcePane("markdown");
	const pane = tabelo.pane("markdown");

	expect(await renderedSource(pane)).toContain("&amp;#32;");
	expect(await drawnGlyphs(pane)).toEqual(["&"]);
	// The value itself is untouched by any of it.
	await expect(tabelo.cell(1, 1)).toHaveText("&#32;");
});
