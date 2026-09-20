import type { Locator } from "@playwright/test";
import { copy } from "@/copy/copy";
import { listViews } from "@/views/registry";
import type { ViewId } from "@/views/types";
import { expect, test } from "./fixtures";
import { editorScroller, renderedSource, type TabeloPage } from "./helpers";

// A selected row or column in a source view is drawn as the grid draws one
// (owner, 2026-09-19): one band per text line with no gap from the header to
// the last row, over that column's cells and nothing else, the active cell in
// the grid's focus mark, and one current line rather than a tint on every line
// the selection reaches. Positions are compared as containment and contiguity
// only, never for equality.

const TABLE = [
	"| Name | City |",
	"| --- | --- |",
	"| Ingrid | Rio |",
	"| Paulo | Madrid |",
].join("\n");

// The views whose rows are lines of cells laid out as columns. A view whose
// rows are blocks draws its selection with the text band instead (#402): see
// source-block-rows.spec.ts.
const mappedViews = listViews().filter(
	(view) =>
		view.kind === "source" &&
		view.capabilities.editable &&
		view.codec?.mapsSourceRows &&
		view.codec.mapsSourceColumns,
);

async function seed(tabelo: TabeloPage, view: ViewId): Promise<Locator> {
	await tabelo.source("markdown").fill(TABLE);
	await expect(tabelo.cell(2, 1)).toHaveText("Paulo");
	if (view !== "markdown") await tabelo.choosePaneView("markdown", view);
	return tabelo.pane(view);
}

interface Box {
	readonly left: number;
	readonly right: number;
	readonly top: number;
	readonly bottom: number;
}

interface Drawn {
	readonly bands: Box[];
	readonly textBands: number;
	readonly marks: number;
	readonly currentLines: number;
	// Where each word sits, by its glyphs.
	readonly words: Record<string, Box | null>;
}

// What the editor draws for the selection, read from its layers.
function drawn(pane: Locator, words: readonly string[]): Promise<Drawn> {
	return editorScroller(pane).evaluate((scroller, wanted) => {
		const box = (element: Element) => {
			const rect = element.getBoundingClientRect();
			return {
				left: rect.left,
				right: rect.right,
				top: rect.top,
				bottom: rect.bottom,
			};
		};
		const find = (word: string) => {
			const walker = document.createTreeWalker(
				scroller.querySelector(".cm-content") ?? scroller,
				NodeFilter.SHOW_TEXT,
			);
			for (let node = walker.nextNode(); node; node = walker.nextNode()) {
				const text = node.textContent ?? "";
				const at = text.indexOf(word);
				if (at === -1) continue;
				const range = document.createRange();
				range.setStart(node, at);
				range.setEnd(node, at + word.length);
				const rect = range.getBoundingClientRect();
				return {
					left: rect.left,
					right: rect.right,
					top: rect.top,
					bottom: rect.bottom,
				};
			}
			return null;
		};
		return {
			bands: Array.from(
				scroller.querySelectorAll(
					".cm-tabeloAxisSelectionLayer .cm-selectionBackground",
				),
				box,
			),
			textBands: scroller.querySelectorAll(
				".cm-tabeloSelectionLayer .cm-selectionBackground",
			).length,
			// Anything drawn above the text other than the carets, the product's
			// and CodeMirror's own hidden one.
			marks: scroller.querySelectorAll(
				".cm-layer-above:not(.cm-tabeloCaretLayer):not(.cm-cursorLayer) > *",
			).length,
			currentLines: scroller.querySelectorAll(".cm-activeLine").length,
			words: Object.fromEntries(wanted.map((word) => [word, find(word)])),
		};
	}, words);
}

const inside = (inner: Box, outer: Box) =>
	inner.left >= outer.left - 1 &&
	inner.right <= outer.right + 1 &&
	inner.top >= outer.top - 1 &&
	inner.bottom <= outer.bottom + 1;

const overlapsHorizontally = (a: Box, b: Box) =>
	a.left < b.right - 1 && b.left < a.right - 1;

// Every band starts where the one above it ends: no line of the table is left
// out of the column.
function expectContiguous(bands: readonly Box[]) {
	const sorted = [...bands].sort((a, b) => a.top - b.top);
	for (let index = 1; index < sorted.length; index += 1) {
		const above = sorted[index - 1];
		const below = sorted[index];
		if (!above || !below) continue;
		expect(below.top - above.bottom).toBeLessThanOrEqual(1);
	}
}

for (const view of mappedViews) {
	test(`${view.id}: a selected column is one unbroken band over its cells, with the header cell marked`, async ({
		tabelo,
	}) => {
		const pane = await seed(tabelo, view.id);
		await pane.locator('.cm-tabeloColumnMarker[data-column="1"]').click();
		await expect(tabelo.source(view.id)).toBeFocused();

		const lines = (await renderedSource(editorScroller(pane))).split("\n");
		const tableLines = lines.filter((line) => line.trim() !== "").length;
		const state = await drawn(pane, ["City", "Rio", "Madrid", "Ingrid"]);

		// One band per line of the table, the Markdown divider included.
		expect(state.bands).toHaveLength(tableLines);
		expectContiguous(state.bands);
		// The text band does not draw the selection a second time.
		expect(state.textBands).toBe(0);

		for (const word of ["City", "Rio", "Madrid"]) {
			const glyphs = state.words[word];
			expect(glyphs, word).not.toBeNull();
			if (!glyphs) continue;
			expect(state.bands.some((band) => inside(glyphs, band))).toBe(true);
		}
		const other = state.words.Ingrid;
		expect(other).not.toBeNull();
		if (other) {
			expect(
				state.bands.some((band) => overlapsHorizontally(band, other)),
			).toBe(false);
		}

		// Nothing over the band, one current line, and no match count: a
		// selected column is not a search.
		expect(state.marks).toBe(0);
		expect(state.currentLines).toBe(1);
		await expect(pane.locator('[data-slot="pane-occurrences"]')).toHaveCount(0);
	});

	test(`${view.id}: a selected row is a band across its cells`, async ({
		tabelo,
	}) => {
		const pane = await seed(tabelo, view.id);
		const scroller = editorScroller(pane);
		const lines = (await renderedSource(scroller)).split("\n");
		const index = lines.findIndex((line) => line.includes("Paulo"));
		await scroller
			.locator(".cm-lineNumbers .cm-gutterElement")
			.filter({ hasText: new RegExp(`^${index + 1}$`) })
			.click();

		await expect.poll(async () => (await drawn(pane, [])).bands.length).toBe(1);
		const state = await drawn(pane, ["Paulo", "Madrid", "Ingrid"]);
		expect(state.bands).toHaveLength(1);
		expect(state.textBands).toBe(0);
		const band = state.bands[0];
		const paulo = state.words.Paulo;
		const madrid = state.words.Madrid;
		const ingrid = state.words.Ingrid;
		if (!band || !paulo || !madrid || !ingrid) {
			throw new Error("The row and its neighbour are drawn.");
		}
		expect(inside(paulo, band)).toBe(true);
		expect(inside(madrid, band)).toBe(true);
		expect(inside(ingrid, band)).toBe(false);
		expect(state.marks).toBe(0);
	});
}

test("a fresh empty table's Jira pane marks three empty cells per row, and a column selects one per row", async ({
	page,
	tabelo,
}) => {
	await page.getByRole("button", { name: copy.actions.openAppMenu }).click();
	const menu = page.getByRole("menu", { name: copy.actions.openAppMenu });
	await menu.getByRole("menuitem", { name: copy.settings.title }).click();
	const settings = page.getByRole("dialog", { name: copy.settings.title });
	await settings
		.getByRole("switch", { name: copy.settings.emptyValueIndicators.label })
		.check();
	await settings.getByRole("button", { name: copy.settings.done }).click();
	await expect(settings).toBeHidden();

	await tabelo.showInSourcePane("jira");
	const pane = tabelo.pane("jira");
	const scroller = editorScroller(pane);
	const perLine = () =>
		scroller.evaluate((element) =>
			Array.from(
				element.querySelectorAll(".cm-content .cm-line"),
				(line) => line.querySelectorAll(".cm-tabeloEmptyValue").length,
			),
		);
	// The header and every body row, three empty cells each.
	await expect.poll(perLine).toEqual([3, 3, 3, 3]);

	// Aligned on screen, and the letters over their own columns: each letter
	// stands over the placeholder of its column on every line.
	const placement = await pane.evaluate((element) => {
		const scroller = element.querySelector(
			".cm-scroller:not(.cm-tabeloPinnedHeader *)",
		);
		const lines = Array.from(
			scroller?.querySelectorAll(".cm-content .cm-line") ?? [],
			(line) =>
				Array.from(line.querySelectorAll(".cm-tabeloEmptyValue"), (marker) => {
					const box = marker.getBoundingClientRect();
					return { left: box.left, right: box.right };
				}),
		);
		const letters = Array.from(
			element.querySelectorAll(".cm-tabeloColumnMarker"),
			(letter) => {
				const box = letter.getBoundingClientRect();
				return { left: box.left, right: box.right };
			},
		);
		return { lines, letters };
	});
	expect(placement.letters).toHaveLength(3);
	for (const [column, letter] of placement.letters.entries()) {
		expect(letter.right).toBeGreaterThan(letter.left);
		for (const markers of placement.lines) {
			const marker = markers[column];
			expect(marker).toBeDefined();
			if (!marker) continue;
			expect(letter.left < marker.right && marker.left < letter.right).toBe(
				true,
			);
		}
	}

	await pane.locator('.cm-tabeloColumnMarker[data-column="1"]').click();
	const state = await drawn(pane, []);
	expect(state.bands).toHaveLength(4);
	expectContiguous(state.bands);
	// One caret per row: the column's cell on every line.
	await expect(scroller.locator(".cm-tabeloCaret")).toHaveCount(4);
	// Every cell reads alike, and still nothing was searched for.
	await expect(pane.locator('[data-slot="pane-occurrences"]')).toHaveCount(0);
});
