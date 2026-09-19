import type { Locator } from "@playwright/test";
import { copy } from "@/copy/copy";
import { samplePeople, samplePerson } from "@/core/sample-data";
import { listViews } from "@/views/registry";
import type { ViewId } from "@/views/types";
import { expect, test } from "./fixtures";
import {
	lastCopied,
	recordingClipboard,
	renderedSource,
	type TabeloPage,
} from "./helpers";

// The pinned header of a source view (#252). While the header row is scrolled
// out of sight, a read-only copy of it stays at the top of the pane. The copy
// is presentation only, so what is asserted is when it appears, which text it
// shows, that it follows the pane's own scrolling and settings, and that
// nothing a reader can reach, copy, or edit changed because of it. The class
// names are the technical contract: the copy is hidden from assistive
// technology, so it has no role or name to be found by.

const PINNED = ".cm-tabeloPinnedHeader";

// Enough rows to scroll well past the header in any pane, each long enough to
// scroll sideways when lines are not wrapped.
function bodyRows(row: (cells: readonly string[]) => string) {
	return Array.from({ length: 60 }, (_, index) => {
		const person = samplePerson(index % samplePeople.length);
		return row([
			`${person.name} ${index}`,
			`${person.city} is where this row keeps a long note number ${index}`,
			person.role,
		]);
	});
}

// Numbered, so the first column is unique and Records can show the table too.
const firstName = `${samplePerson(0).name} 0`;

interface Case {
	readonly view: ViewId;
	readonly header: string;
	readonly body: readonly string[];
	// How many of the header's lines are pinned, when not all of them.
	readonly pinnedLines?: number;
}

const cases: readonly Case[] = [
	{
		view: "markdown",
		// The divider belongs to the header row but names no column, so only
		// the header line is pinned (owner, 2026-09-19).
		header: "| name | note | role \\| team |\n| --- | --- | --- |",
		body: bodyRows((cells) => `| ${cells.join(" | ")} |`),
		pinnedLines: 1,
	},
	{
		view: "csv",
		// A quoted line break keeps a two-line header one record.
		header: 'name,"note\nsecond line",role',
		body: bodyRows((cells) => cells.join(",")),
	},
	{
		view: "tsv",
		header: "name\tnote\trole",
		body: bodyRows((cells) => cells.join("\t")),
	},
	{
		view: "jira",
		header: "||name||note||role \\| team||",
		body: bodyRows((cells) => `|${cells.join("|")}|`),
	},
];

function pinned(pane: Locator): Locator {
	return pane.locator(PINNED);
}

// Whether the copy is showing. It exists whenever there is a header to pin and
// the scroll itself reveals it, through its opacity, which the compositor can
// change in the frame it scrolls; so showing is full opacity, not presence.
async function expectPinned(pane: Locator, shown: boolean): Promise<void> {
	await expect
		.poll(() =>
			pane.evaluate((element, selector) => {
				const copy = element.querySelector<HTMLElement>(selector);
				return (
					copy !== null &&
					!copy.hidden &&
					getComputedStyle(copy).opacity === "1"
				);
			}, PINNED),
		)
		.toBe(shown);
}

// The copy's text, line by line, as the DOM holds it. Every marker the editor
// draws is generated content or a clipped copy of the notation it replaces, so
// this is the source text itself.
async function pinnedText(pane: Locator): Promise<string> {
	return pinned(pane).evaluate((element) =>
		Array.from(element.querySelectorAll(".cm-line"))
			.map((line) => line.textContent ?? "")
			.join("\n"),
	);
}

async function scrollTo(pane: Locator, top: number, left = 0): Promise<void> {
	await pane
		.locator(".cm-scroller")
		.first()
		.evaluate(
			(scroller, position) => {
				scroller.scrollTop = position.top;
				scroller.scrollLeft = position.left;
			},
			{ top, left },
		);
}

async function fillSource(
	tabelo: TabeloPage,
	{ view, header, body }: Case,
): Promise<Locator> {
	await tabelo.showInSourcePane(view);
	await tabelo.source(view).fill([header, ...body].join("\n"));
	await expect(tabelo.cell(1, 1)).toHaveText(firstName);
	const pane = tabelo.pane(view);
	await scrollTo(pane, 0);
	return pane;
}

for (const testCase of cases) {
	test(`${testCase.view} pins its header row only once it has scrolled away`, async ({
		tabelo,
	}) => {
		const pane = await fillSource(tabelo, testCase);
		// A document at rest shows its real header and no copy.
		await expectPinned(pane, false);
		// The header as the editor now holds it: Markdown's divider assistance
		// may have resized the divider the fixture typed.
		const header = (await renderedSource(pane))
			.split("\n")
			.slice(0, testCase.pinnedLines ?? testCase.header.split("\n").length)
			.join("\n");
		expect(header.split("\n")[0]).toBe(testCase.header.split("\n")[0]);

		await scrollTo(pane, 800);
		await expectPinned(pane, true);
		expect(await pinnedText(pane)).toBe(header);

		// The copy is not a second editor: it is hidden, inert, and holds no
		// focusable content, so the pane still has exactly one text box.
		await expect(pinned(pane)).toHaveAttribute("aria-hidden", "true");
		expect(
			await pinned(pane).evaluate((element) => (element as HTMLElement).inert),
		).toBe(true);
		await expect(pane.getByRole("textbox")).toHaveCount(1);

		await scrollTo(pane, 0);
		await expectPinned(pane, false);
	});
}

// Views whose rows are blocks map rows but no header line of cells (#402),
// read from the registry by what their codec declares.
test("views without a header line of cells never pin one", async ({
	tabelo,
}) => {
	const csv = cases[1];
	if (!csv) throw new Error("missing CSV case");
	await fillSource(tabelo, csv);
	for (const { id } of listViews().filter(
		(view) => view.kind === "source" && !view.codec?.mapsSourceColumns,
	)) {
		await tabelo.showInSourcePane(id);
		const pane = tabelo.pane(id);
		await scrollTo(pane, 800);
		await expect(pane.locator(".cm-scroller").first()).not.toHaveJSProperty(
			"scrollTop",
			0,
		);
		await expectPinned(pane, false);
	}
});

test("a selection that covers the header shows on the pinned copy", async ({
	page,
	tabelo,
}) => {
	const markdown = cases[0];
	if (!markdown) throw new Error("missing Markdown case");
	const pane = await fillSource(tabelo, markdown);
	await tabelo.source("markdown").click();
	await page.keyboard.press("ControlOrMeta+a");
	await scrollTo(pane, 800);
	await expectPinned(pane, true);
	// Drawn like the grid's pinned header row, which shows a selection over it.
	await expect(
		pinned(pane).locator(".cm-selectionBackground").first(),
	).toBeVisible();
	// Only the header's part of the selection: no band may reach past the
	// copy's own box over the lines it hides.
	const overflow = await pinned(pane).evaluate((element) => {
		const box = element.getBoundingClientRect();
		return Array.from(element.querySelectorAll(".cm-selectionBackground")).some(
			(band) => band.getBoundingClientRect().bottom > box.bottom + 1,
		);
	});
	expect(overflow).toBe(false);
});

test("a selection to the end never reaches below the last line", async ({
	page,
	tabelo,
}) => {
	const markdown = cases[0];
	if (!markdown) throw new Error("missing Markdown case");
	const pane = await fillSource(tabelo, markdown);
	await tabelo.source("markdown").click();
	await page.keyboard.press("ControlOrMeta+a");
	for (const top of [0, 400, 100000]) {
		await scrollTo(pane, top);
		const past = await pane.evaluate((element) => {
			const scroller = element.querySelector(".cm-editor > .cm-scroller");
			const lines = scroller?.querySelectorAll(":scope .cm-content > .cm-line");
			const last = lines?.[lines.length - 1]?.getBoundingClientRect();
			if (!scroller || !last) return false;
			return Array.from(
				scroller.querySelectorAll(
					":scope > .cm-tabeloSelectionLayer .cm-selectionBackground",
				),
			).some((band) => band.getBoundingClientRect().bottom > last.bottom + 1);
		});
		expect(past).toBe(false);
	}
});

test("the pinned header follows horizontal scrolling", async ({ tabelo }) => {
	const markdown = cases[0];
	if (!markdown) throw new Error("missing Markdown case");
	const pane = await fillSource(tabelo, markdown);
	await scrollTo(pane, 800);
	await expectPinned(pane, true);
	// The copy never scrolls itself: it is moved with the editor's own scroll
	// by a scroll-driven animation, so what is read is where its text is drawn.
	const textLeft = () =>
		pinned(pane).evaluate(
			(element) =>
				element.querySelector(".cm-content")?.getBoundingClientRect().left ??
				Number.NaN,
		);
	const resting = await textLeft();

	await scrollTo(pane, 800, 100);
	await expect.poll(textLeft).toBeLessThan(resting);
	const scrolled = await textLeft();

	await scrollTo(pane, 800, 40);
	await expect.poll(textLeft).toBeGreaterThan(scrolled);
	await expect.poll(textLeft).toBeLessThan(resting);
});

test("the pinned header follows wrapping and zoom", async ({ tabelo }) => {
	const csv = cases[1];
	if (!csv) throw new Error("missing CSV case");
	const pane = await fillSource(tabelo, csv);
	await scrollTo(pane, 800);
	await expectPinned(pane, true);
	const height = () =>
		pinned(pane).evaluate((element) => element.getBoundingClientRect().height);
	const unzoomed = await height();

	const menu = await tabelo.openPaneMenu("csv");
	await menu
		.getByRole("menuitemcheckbox", { name: copy.workspace.wrapSource })
		.click();
	await tabelo.paneMenuTrigger("csv").click();
	await scrollTo(pane, 800);
	await expectPinned(pane, true);
	await expect(pinned(pane).locator(".cm-content")).toHaveCSS(
		"white-space",
		"break-spaces",
	);

	for (let step = 0; step < 3; step += 1) {
		await tabelo.runPaneCommand("csv", "zoomIn");
	}
	await tabelo.paneMenuTrigger("csv").click();
	await scrollTo(pane, 800);
	// A larger scale draws a taller header; the copy measured the new one rather
	// than keeping the height it had.
	await expect.poll(height).toBeGreaterThan(unzoomed);
	expect(await pinnedText(pane)).toBe(csv.header);
});

test("a header taller than half the pane is pinned no taller than that", async ({
	tabelo,
}) => {
	const lines = Array.from({ length: 40 }, (_, index) => `line ${index}`);
	const tall: Case = {
		view: "csv",
		header: `name,"${lines.join("\n")}",role`,
		body: bodyRows((cells) => cells.join(",")),
	};
	const pane = await fillSource(tabelo, tall);
	await scrollTo(pane, 2000);
	await expectPinned(pane, true);
	const sizes = await pane.evaluate((element, selector) => {
		const editor = element.querySelector(".cm-editor");
		const copyBox = element.querySelector(selector);
		return {
			editor: editor?.getBoundingClientRect().height ?? 0,
			copy: copyBox?.getBoundingClientRect().height ?? Number.POSITIVE_INFINITY,
		};
	}, PINNED);
	expect(sizes.copy).toBeLessThanOrEqual(sizes.editor / 2);
});

test("the pinned header never changes the text or what is copied", async ({
	page,
	tabelo,
}) => {
	await recordingClipboard(page);
	await page.reload();
	await tabelo.dismissWelcome();
	await expect(tabelo.workspace).toBeVisible();
	const markdown = cases[0];
	if (!markdown) throw new Error("missing Markdown case");
	const pane = await fillSource(tabelo, markdown);

	await tabelo.runPaneCommand("markdown", "copySource");
	const unpinned = (await lastCopied(page))?.text;

	await scrollTo(pane, 800, 120);
	await expectPinned(pane, true);
	await tabelo.runPaneCommand("markdown", "copySource");
	const whilePinned = (await lastCopied(page))?.text;

	expect(unpinned?.startsWith(markdown.header.split("\n")[0] ?? "")).toBe(true);
	expect(whilePinned).toBe(unpinned);
	await expect(tabelo.source("markdown")).not.toHaveAttribute(
		"aria-invalid",
		"true",
	);
});

test("a press on the pinned header edits the real header", async ({
	tabelo,
}) => {
	const tsv = cases[2];
	if (!tsv) throw new Error("missing TSV case");
	const pane = await fillSource(tabelo, tsv);
	await scrollTo(pane, 800);
	await expectPinned(pane, true);

	// Just inside the copy's text, at the start of its first line.
	const line = pinned(pane).locator(".cm-line").first();
	const box = await line.boundingBox();
	if (!box) throw new Error("the pinned header has no box");
	await tabelo.page.mouse.click(box.x + 1, box.y + box.height / 2);

	// The caret went to the real header, which scrolled back into place.
	await expect(tabelo.source("tsv")).toBeFocused();
	await expectPinned(pane, false);
	await tabelo.page.keyboard.type("X");
	await expect(tabelo.header(1)).toHaveText("Xname");
});

test("a caret moving up is revealed below the pinned header, not under it", async ({
	tabelo,
}) => {
	const tsv = cases[2];
	if (!tsv) throw new Error("missing TSV case");
	const pane = await fillSource(tabelo, tsv);
	await scrollTo(pane, 800);
	await expectPinned(pane, true);

	// A line just below the copy, then three lines up: the caret passes into
	// the rows the copy covers, so revealing it has to leave room for the copy.
	const overlay = await pinned(pane).boundingBox();
	if (!overlay) throw new Error("the pinned header has no box");
	await tabelo.page.mouse.click(
		overlay.x + overlay.width / 2,
		overlay.y + overlay.height + 40,
	);
	await expect(tabelo.source("tsv")).toBeFocused();
	const caretLine = pane.locator(".cm-content .cm-activeLine");
	const startedOn = await caretLine.textContent();
	for (let step = 0; step < 3; step += 1) {
		await tabelo.page.keyboard.press("ArrowUp");
	}
	await expect(caretLine).not.toHaveText(startedOn ?? "");

	const caret = pane.locator(".cm-tabeloCaret-primary");
	await expect
		.poll(async () => {
			const caretBox = await caret.boundingBox();
			const copyBox = await pinned(pane).boundingBox();
			if (!caretBox) return false;
			return !copyBox || caretBox.y >= copyBox.y + copyBox.height;
		})
		.toBe(true);
});

test("the pinned header follows edits and hides while the draft does not parse", async ({
	tabelo,
}) => {
	const markdown = cases[0];
	if (!markdown) throw new Error("missing Markdown case");
	const pane = await fillSource(tabelo, markdown);
	await scrollTo(pane, 800);
	await expectPinned(pane, true);

	// An edit from the grid reaches the copy through the document.
	await tabelo.editHeader(1, "person", "name");
	await scrollTo(pane, 800);
	await expect.poll(() => pinnedText(pane)).toMatch(/^\| person /);

	// A draft that does not parse maps no rows, so no header is claimed.
	await tabelo
		.source("markdown")
		.fill(["| name |", ...markdown.body].join("\n"));
	await expect(tabelo.source("markdown")).toHaveAttribute(
		"aria-invalid",
		"true",
	);
	await scrollTo(pane, 800);
	await expectPinned(pane, false);

	await tabelo
		.source("markdown")
		.fill([markdown.header, ...markdown.body].join("\n"));
	await scrollTo(pane, 800);
	await expectPinned(pane, true);
});

test("the pinned header stays opaque and bounded in forced colours", async ({
	page,
	tabelo,
}) => {
	const jira = cases[3];
	if (!jira) throw new Error("missing Jira case");
	await page.emulateMedia({ forcedColors: "active" });
	const pane = await fillSource(tabelo, jira);
	await scrollTo(pane, 800);
	await expectPinned(pane, true);
	const style = await pinned(pane).evaluate((element) => {
		const computed = getComputedStyle(element);
		return {
			background: computed.backgroundColor,
			border: computed.borderBottomStyle,
		};
	});
	expect(style.background).not.toBe("rgba(0, 0, 0, 0)");
	expect(style.border).toBe("solid");
	expect(await pinnedText(pane)).toBe(jira.header);
});
