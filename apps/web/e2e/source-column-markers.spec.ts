import type { Locator } from "@playwright/test";
import { copy } from "@/copy/copy";
import { samplePeople, samplePeopleHeaders } from "@/core/sample-data";
import { listViews } from "@/views/registry";
import { expect, test } from "./fixtures";
import {
	lastCopied,
	outsidePinnedHeader,
	recordingClipboard,
	renderedSource,
	type TabeloPage,
} from "./helpers";

// The column markers of a source view (#368): a strip of column letters above
// the text, one over each header cell, wherever the codec maps where its
// header cells sit. The strip is presentation only and hidden from assistive
// technology, so it has no role or name to be found by: the class names and the
// letter attribute are the technical contract. Positions are checked by
// direction only, never by equality with the text they stand over.

const STRIP = ".cm-tabeloColumnStrip";
const MARKER = ".cm-tabeloColumnMarker";

// A padded Markdown table, as the serializer writes one, with a note column
// long enough to scroll sideways.
function markdownTable(): string {
	const headers = [...samplePeopleHeaders, "note"];
	const rows = samplePeople.map((person, index) => [
		person.name,
		person.city,
		person.role,
		String(person.age),
		`a note long enough to scroll the pane sideways, row ${index}`,
	]);
	const widths = headers.map((header, column) =>
		Math.max(header.length, ...rows.map((row) => row[column]?.length ?? 0)),
	);
	const line = (cells: readonly string[]) =>
		`| ${cells.map((cell, column) => cell.padEnd(widths[column] ?? 0)).join(" | ")} |`;
	const divider = `| ${widths.map((width) => "-".repeat(width)).join(" | ")} |`;
	return [line(headers), divider, ...rows.map(line)].join("\n");
}

async function fillMarkdown(tabelo: TabeloPage): Promise<Locator> {
	await tabelo.showInSourcePane("markdown");
	await tabelo.source("markdown").fill(markdownTable());
	await expect(tabelo.cell(1, 1)).toHaveText(samplePeople[0]?.name ?? "");
	return tabelo.pane("markdown");
}

function markers(pane: Locator): Locator {
	return pane.locator(`${STRIP} ${MARKER}`);
}

// Each letter's left edge in the viewport, in column order.
function letterEdges(pane: Locator): Promise<number[]> {
	return markers(pane).evaluateAll((letters) =>
		letters.map((letter) => letter.getBoundingClientRect().left),
	);
}

async function letterEdge(pane: Locator, index: number): Promise<number> {
	return (await letterEdges(pane))[index] ?? Number.NaN;
}

test("a Markdown pane labels each column once, in order", async ({
	tabelo,
}) => {
	const pane = await fillMarkdown(tabelo);
	await expect(pane.locator(STRIP)).toBeVisible();
	await expect(markers(pane)).toHaveCount(samplePeopleHeaders.length + 1);
	const letters = await markers(pane).evaluateAll((elements) =>
		elements.map((element) => (element as HTMLElement).dataset.letter),
	);
	expect(letters).toEqual(["A", "B", "C", "D", "E"]);
	const edges = await letterEdges(pane);
	for (let index = 1; index < edges.length; index += 1) {
		expect(edges[index]).toBeGreaterThan(edges[index - 1] ?? Number.NaN);
	}
});

test("the letters follow the header line through typing, zoom, and scrolling", async ({
	page,
	tabelo,
}) => {
	const pane = await fillMarkdown(tabelo);
	await expect(markers(pane)).toHaveCount(5);

	// A longer name in column A pushes the header's column B to the right, and
	// its letter with it.
	const before = await letterEdge(pane, 1);
	const source = tabelo.source("markdown");
	await source.click();
	await page.keyboard.press("ControlOrMeta+Home");
	for (let step = 0; step < 6; step += 1) {
		await page.keyboard.press("ArrowRight");
	}
	await page.keyboard.type("longer");
	await expect.poll(() => letterEdge(pane, 1)).toBeGreaterThan(before);

	// A larger scale draws wider text, so the columns spread apart.
	const spread = async () =>
		(await letterEdge(pane, 2)) - (await letterEdge(pane, 0));
	const unzoomed = await spread();
	await tabelo.runPaneCommand("markdown", "zoomIn");
	await expect.poll(spread).toBeGreaterThan(unzoomed);

	// Scrolling sideways carries the letters with the text.
	const resting = await letterEdge(pane, 4);
	await pane
		.locator(`.cm-scroller${outsidePinnedHeader}`)
		.first()
		.evaluate((scroller) => {
			scroller.scrollLeft = 120;
		});
	await expect.poll(() => letterEdge(pane, 4)).toBeLessThan(resting);
});

// A letter drawn over a header cell, as opposed to one kept for a cell that
// begins on a later visual line of a wrapped header.
function shownMarkers(pane: Locator): Locator {
	return pane.locator(`${STRIP} ${MARKER}:not([hidden])`);
}

test("wrapping keeps the strip and its letters on the header's first line", async ({
	tabelo,
}) => {
	const pane = await fillMarkdown(tabelo);
	await expect(shownMarkers(pane)).toHaveCount(5);

	const menu = await tabelo.openPaneMenu("markdown");
	await menu
		.getByRole("menuitemcheckbox", { name: copy.workspace.wrapSource })
		.click();
	await tabelo.paneMenuTrigger("markdown").click();
	await expect(pane.locator(STRIP)).toBeVisible();
	// The first header cell always begins on the header's first visual line.
	await expect(shownMarkers(pane).first()).toHaveAttribute("data-letter", "A");
	const edges = await shownMarkers(pane).evaluateAll((letters) =>
		letters.map((letter) => letter.getBoundingClientRect().left),
	);
	for (let index = 1; index < edges.length; index += 1) {
		expect(edges[index]).toBeGreaterThan(edges[index - 1] ?? Number.NaN);
	}
});

test("every source view that maps its header cells labels them, and no other", async ({
	tabelo,
}) => {
	await fillMarkdown(tabelo);
	for (const view of listViews()) {
		if (view.kind !== "source") continue;
		await tabelo.showInSourcePane(view.id);
		await expect(tabelo.source(view.id)).toBeVisible();
		const strip = tabelo.pane(view.id).locator(STRIP);
		if (view.codec?.mapsSourceRows) {
			await expect(shownMarkers(tabelo.pane(view.id))).toHaveCount(
				samplePeopleHeaders.length + 1,
			);
		} else {
			await expect(strip).toBeHidden();
		}
	}
});

test("the scroller runs the pane's full height behind the strip", async ({
	tabelo,
}) => {
	const pane = await fillMarkdown(tabelo);
	await expect(pane.locator(STRIP)).toBeVisible();
	const tops = await pane
		.locator(`.cm-editor${outsidePinnedHeader}`)
		.evaluate((editor) => ({
			scroller:
				editor.querySelector(".cm-scroller")?.getBoundingClientRect().top ??
				Number.NaN,
			strip:
				editor.querySelector(".cm-tabeloColumnStrip")?.getBoundingClientRect()
					.top ?? Number.NaN,
		}));
	expect(tops.scroller).toBeLessThanOrEqual(tops.strip);
});

test("the letters never reach the text, the clipboard, or assistive technology", async ({
	page,
	tabelo,
}) => {
	await recordingClipboard(page);
	await page.reload();
	await tabelo.dismissWelcome();
	await expect(tabelo.workspace).toBeVisible();
	const pane = await fillMarkdown(tabelo);
	await expect(markers(pane)).toHaveCount(5);

	// The strip is hidden and inert, and a letter is drawn from an attribute,
	// so it is not text in the page at all.
	const strip = pane.locator(STRIP);
	await expect(strip).toHaveAttribute("aria-hidden", "true");
	expect(
		await strip.evaluate((element) => (element as HTMLElement).inert),
	).toBe(true);
	expect(await strip.evaluate((element) => element.textContent)).toBe("");
	expect(
		await pane.locator(`.cm-editor${outsidePinnedHeader}`).ariaSnapshot(),
	).not.toMatch(/\b[A-E]\b/);

	// What is copied is the source text and nothing else.
	const shown = await renderedSource(pane);
	await tabelo.runPaneCommand("markdown", "copySource");
	expect((await lastCopied(page))?.text).toBe(shown);
});
