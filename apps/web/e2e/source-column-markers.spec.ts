import type { Locator } from "@playwright/test";
import { copy } from "@/copy/copy";
import { samplePeople, samplePeopleHeaders } from "@/core/sample-data";
import { expect, test } from "./fixtures";
import {
	lastCopied,
	recordingClipboard,
	renderedSource,
	type TabeloPage,
} from "./helpers";

// The column markers of a source view (#368): a strip of column letters above
// the text, one over each column, where the codec declares that its output
// aligns columns. The strip is presentation only and hidden from assistive
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
		.locator(".cm-scroller")
		.first()
		.evaluate((scroller) => {
			scroller.scrollLeft = 120;
		});
	await expect.poll(() => letterEdge(pane, 4)).toBeLessThan(resting);
});

test("wrapping hides the letters and unwrapping brings them back", async ({
	tabelo,
}) => {
	const pane = await fillMarkdown(tabelo);
	await expect(pane.locator(STRIP)).toBeVisible();

	const menu = await tabelo.openPaneMenu("markdown");
	await menu
		.getByRole("menuitemcheckbox", { name: copy.workspace.wrapSource })
		.click();
	await tabelo.paneMenuTrigger("markdown").click();
	await expect(pane.locator(STRIP)).toHaveCount(0);

	const again = await tabelo.openPaneMenu("markdown");
	await again
		.getByRole("menuitemcheckbox", { name: copy.workspace.wrapSource })
		.click();
	await tabelo.paneMenuTrigger("markdown").click();
	await expect(markers(pane)).toHaveCount(5);
});

test("a format that does not align its columns shows no letters", async ({
	tabelo,
}) => {
	await fillMarkdown(tabelo);
	for (const view of ["csv", "tsv", "jira"] as const) {
		await tabelo.showInSourcePane(view);
		await expect(tabelo.source(view)).toBeVisible();
		await expect(tabelo.pane(view).locator(STRIP)).toHaveCount(0);
	}
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
	expect(await pane.locator(".cm-editor").ariaSnapshot()).not.toMatch(
		/\b[A-E]\b/,
	);

	// What is copied is the source text and nothing else.
	const shown = await renderedSource(pane);
	await tabelo.runPaneCommand("markdown", "copySource");
	expect((await lastCopied(page))?.text).toBe(shown);
});
