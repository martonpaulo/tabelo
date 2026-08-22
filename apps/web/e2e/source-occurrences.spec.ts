import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import type { TabeloPage } from "./helpers";

// Mod+D in a source view: add the next matching occurrence to the selection,
// keep the newest one primary and revealed, and say how many are gathered.
//
// The counts are the assertion, never the sentence around them. A test that
// rebuilt the sentence from the same copy function that renders it would only
// prove that a value equals itself.

// Three whole-word occurrences of "Rio", and one "Riobamba" that shares the
// prefix without being a match for a whole-word selection.
const TABLE = [
	"| Name | City |",
	"| --- | --- |",
	"| Ingrid | Rio |",
	"| Paulo | Rio |",
	"| Mabel | Rio |",
	"| Felix | Riobamba |",
].join("\n");

const CITY_COLUMN = 11;
const RIO = 3;

// Selecting by counted key presses rather than by clicking at a coordinate:
// the position is the fixture's, so nothing here depends on where a glyph
// happens to land.
async function selectRange(
	editor: Locator,
	line: number,
	column: number,
	length: number,
): Promise<void> {
	await editor.click();
	await editor.press("ControlOrMeta+Home");
	for (let step = 1; step < line; step += 1) await editor.press("ArrowDown");
	await editor.press("Home");
	for (let step = 0; step < column; step += 1) await editor.press("ArrowRight");
	for (let step = 0; step < length; step += 1) {
		await editor.press("Shift+ArrowRight");
	}
}

function summary(pane: Locator): Locator {
	return pane.locator('[data-slot="pane-occurrences"]');
}

// "selected of total", read as two numbers so the assertion is about state
// rather than about wording.
async function counts(pane: Locator): Promise<[number, number]> {
	const text = (await summary(pane).textContent()) ?? "";
	const numbers = text.match(/\d+/g) ?? [];
	return [Number(numbers[0]), Number(numbers[1])];
}

// The summary is React state rendered after CodeMirror applies the press, so a
// single read can land on the previous count. Polling waits for the state the
// press produces instead of for a duration.
function expectCounts(
	pane: Locator,
	expected: [number, number],
): Promise<void> {
	return expect.poll(() => counts(pane)).toEqual(expected);
}

async function seed(tabelo: TabeloPage): Promise<Locator> {
	const editor = tabelo.source("markdown");
	await editor.fill(TABLE);
	await expect(tabelo.cell(1, 2)).toHaveText("Rio");
	return editor;
}

// Whether the key press was left for the browser. CodeMirror prevents the
// default only when a binding claims the key, so a listener behind it sees
// exactly what the browser would go on to act upon.
async function watchModD(page: Page): Promise<void> {
	await page.evaluate(() => {
		const claimed: boolean[] = [];
		Object.defineProperty(window, "__modD", { value: claimed, writable: true });
		document.addEventListener("keydown", (event) => {
			if (event.key.toLowerCase() === "d") claimed.push(event.defaultPrevented);
		});
	});
}

function modDClaims(page: Page): Promise<boolean[]> {
	return page.evaluate(() => (window as { __modD?: boolean[] }).__modD ?? []);
}

test("a first press keeps the selection and adds the next occurrence", async ({
	tabelo,
}) => {
	const editor = await seed(tabelo);
	await selectRange(editor, 3, CITY_COLUMN, RIO);
	await expect(summary(tabelo.pane("markdown"))).toHaveCount(0);

	await editor.press("ControlOrMeta+d");

	await expectCounts(tabelo.pane("markdown"), [2, 3]);
	await expect(editor).toBeFocused();
});

test("repeated presses add one occurrence at a time and then stop", async ({
	tabelo,
}) => {
	const editor = await seed(tabelo);
	const pane = tabelo.pane("markdown");
	await selectRange(editor, 3, CITY_COLUMN, RIO);

	await editor.press("ControlOrMeta+d");
	await expectCounts(pane, [2, 3]);
	await editor.press("ControlOrMeta+d");
	await expectCounts(pane, [3, 3]);

	// Every match is selected, so the command has nothing left to add. It must
	// stop rather than cycle, and "Riobamba" is not a match for a whole word.
	await editor.press("ControlOrMeta+d");
	await expectCounts(pane, [3, 3]);
});

test("a selection that is not a whole word matches inside longer words", async ({
	tabelo,
}) => {
	const editor = await seed(tabelo);
	const pane = tabelo.pane("markdown");
	// "io" of "Rio", which is a fragment rather than a word, so "Riobamba"
	// counts too: four occurrences instead of three.
	await selectRange(editor, 3, CITY_COLUMN + 1, 2);

	await editor.press("ControlOrMeta+d");
	await expectCounts(pane, [2, 4]);
});

test("the newest occurrence becomes the primary selection", async ({
	tabelo,
}) => {
	const editor = await seed(tabelo);
	const pane = tabelo.pane("markdown");
	await selectRange(editor, 3, CITY_COLUMN, RIO);
	await editor.press("ControlOrMeta+d");
	await expectCounts(pane, [2, 3]);

	// Occurrences are gathered downwards through the document, so the range the
	// press just added is the lowest one on screen. Which cursor is drawn lower
	// is a direction, not a measurement: the assertion is that the primary
	// cursor followed the new range rather than staying on the original.
	//
	// The count above proves the command ran; the cursor layer is CodeMirror's
	// own repaint and can still land after it, so both cursors are read together
	// and retried. A single read under load can catch them coincident on the
	// pre-update layout, which reads as no direction at all.
	await expect.poll(() => cursorDrop(pane)).toBeGreaterThan(0);
	await expect(editor).toBeFocused();
});

// How far the primary cursor sits below the first secondary one. Null while
// either is undrawn, so the poll retries rather than deciding on half a layout.
async function cursorDrop(pane: Locator): Promise<number | null> {
	const primary = await pane
		.locator(".cm-cursor-primary")
		.first()
		.boundingBox();
	const secondary = await pane
		.locator(".cm-cursor-secondary")
		.first()
		.boundingBox();
	if (!primary || !secondary) return null;
	return primary.y - secondary.y;
}

test("typing replaces every selected occurrence and one undo restores them", async ({
	tabelo,
}) => {
	const editor = await seed(tabelo);
	await selectRange(editor, 3, CITY_COLUMN, RIO);
	await editor.press("ControlOrMeta+d");
	await editor.press("ControlOrMeta+d");

	await editor.press("L");
	await expect(tabelo.cell(1, 2)).toHaveText("L");
	await expect(tabelo.cell(2, 2)).toHaveText("L");
	await expect(tabelo.cell(3, 2)).toHaveText("L");

	// One CodeMirror transaction covered all three ranges, so one step of the
	// editor's own history restores all three. A loop of dispatches would need
	// three, and would leave the ranges half restored in between.
	await editor.press("ControlOrMeta+z");
	await expect(tabelo.cell(1, 2)).toHaveText("Rio");
	await expect(tabelo.cell(2, 2)).toHaveText("Rio");
	await expect(tabelo.cell(3, 2)).toHaveText("Rio");
});

test("a caret leaves the key to the browser", async ({ page, tabelo }) => {
	const editor = await seed(tabelo);
	await editor.click();
	await editor.press("ControlOrMeta+Home");
	await watchModD(page);

	await editor.press("ControlOrMeta+d");

	expect(await modDClaims(page)).toEqual([false]);
	await expect(summary(tabelo.pane("markdown"))).toHaveCount(0);
});

test("a claimed press is the only one the editor swallows", async ({
	page,
	tabelo,
}) => {
	const editor = await seed(tabelo);
	await selectRange(editor, 3, CITY_COLUMN, RIO);
	await watchModD(page);

	// Two that apply, then one with nothing left to add.
	await editor.press("ControlOrMeta+d");
	await editor.press("ControlOrMeta+d");
	await editor.press("ControlOrMeta+d");

	expect(await modDClaims(page)).toEqual([true, true, false]);
});

test("the summary clears when the selection collapses", async ({ tabelo }) => {
	const editor = await seed(tabelo);
	const pane = tabelo.pane("markdown");
	await selectRange(editor, 3, CITY_COLUMN, RIO);
	await editor.press("ControlOrMeta+d");
	await expectCounts(pane, [2, 3]);

	await editor.press("ArrowRight");
	await expect(summary(pane)).toHaveCount(0);
});

test("the summary clears when the pane changes view", async ({ tabelo }) => {
	const editor = await seed(tabelo);
	await selectRange(editor, 3, CITY_COLUMN, RIO);
	await editor.press("ControlOrMeta+d");
	await expectCounts(tabelo.pane("markdown"), [2, 3]);

	await tabelo.choosePaneView("markdown", "csv");
	await expect(summary(tabelo.pane("csv"))).toHaveCount(0);
});

// Registry-driven rather than named per view: the same pane, showing a
// different editable source format, gets the same behaviour with no view id
// anywhere in the implementation.
test("the behaviour follows the pane into another editable source view", async ({
	tabelo,
}) => {
	await seed(tabelo);
	await tabelo.choosePaneView("markdown", "csv");

	const editor = tabelo.source("csv");
	await editor.click();
	// Line 2 of the CSV projection is "Ingrid,Rio"; the city starts after the
	// name and its comma.
	await selectRange(editor, 2, "Ingrid,".length, RIO);
	await editor.press("ControlOrMeta+d");

	expect(await counts(tabelo.pane("csv"))).toEqual([2, 3]);
});

test("each press is announced through the app's polite region", async ({
	tabelo,
}) => {
	const editor = await seed(tabelo);
	await tabelo.dismissNotices();
	await selectRange(editor, 3, CITY_COLUMN, RIO);

	await editor.press("ControlOrMeta+d");
	await expect(tabelo.announcements).toHaveText(/\b2\b[^0-9]*\b3\b/);

	await editor.press("ControlOrMeta+d");
	await expect(tabelo.announcements).toHaveText(/\b3\b[^0-9]*\b3\b/);
});

// The one geometry assertion here, and it is on purpose: §5's "nothing may
// reflow because of a status change" is a statement about the header keeping
// its box and the actions trigger keeping its place, and there is no other way
// to observe it. Run at the narrowest tiled width, where a header has the
// least room to absorb anything.
test("the header keeps its row and its trigger as the count changes", async ({
	page,
	tabelo,
}) => {
	await page.setViewportSize({ width: 900, height: 700 });
	const editor = await seed(tabelo);
	await tabelo.dismissNotices();
	const header = tabelo.pane("markdown").locator("header");
	const trigger = tabelo.paneMenuTrigger("markdown");

	const restingHeader = await box(header);
	const restingTrigger = await box(trigger);

	await selectRange(editor, 3, CITY_COLUMN, RIO);
	await editor.press("ControlOrMeta+d");
	expect(await box(header)).toEqual(restingHeader);
	expect(await box(trigger)).toEqual(restingTrigger);

	await editor.press("ControlOrMeta+d");
	expect(await box(header)).toEqual(restingHeader);
	expect(await box(trigger)).toEqual(restingTrigger);
});

async function box(locator: Locator) {
	const value = await locator.boundingBox();
	if (!value) throw new Error("element is not rendered");
	return value;
}

test("Escape still leaves the editor with occurrences selected", async ({
	tabelo,
}) => {
	const editor = await seed(tabelo);
	const pane = tabelo.pane("markdown");
	await selectRange(editor, 3, CITY_COLUMN, RIO);
	await editor.press("ControlOrMeta+d");

	// The default keymap binds Escape to collapsing a multiple selection.
	// Tabelo's own binding sits above it and owns the pane's escape route, so
	// this must leave the editor rather than tidy the selection.
	await editor.press("Escape");
	await expect(pane).toBeFocused();
});
