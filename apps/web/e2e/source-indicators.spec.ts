import type { Locator, Page } from "@playwright/test";
import { copy } from "@/copy/copy";
import { samplePerson } from "@/core/sample-data";
import { STORAGE_KEY } from "@/persistence/schema";
import type { SpaceIndicators } from "@/preferences/contract";
import { expect, test } from "./fixtures";
import { lastCopied, recordingClipboard } from "./helpers";

// Whitespace and empty-value indicators are decorations and nothing else. What
// these tests protect is that promise: the same bytes reach the document, the
// clipboard, and storage whether the markers are drawn or not.

const first = samplePerson(0);

const marker = ".cm-tabeloEmptyValue";
const tab = ".cm-highlightTab";

// A space span always exists while anything is marked; what the reader can
// actually see is the glyph the theme generates, so that is what is counted.
async function paintedSpaces(pane: Locator): Promise<number> {
	return pane.evaluate(
		(element) =>
			Array.from(element.querySelectorAll(".cm-highlightSpace")).filter(
				(span) => getComputedStyle(span, "::before").content !== "none",
			).length,
	);
}

async function openSettings(page: Page) {
	const trigger = page.getByRole("button", { name: copy.actions.openAppMenu });
	await trigger.click();
	const menu = page.getByRole("menu", { name: copy.actions.openAppMenu });
	await menu.getByRole("menuitem", { name: copy.settings.title }).click();
	await menu.waitFor({ state: "hidden" });
	const dialog = page.getByRole("dialog", { name: copy.settings.title });
	await dialog.waitFor({ state: "visible" });
	return dialog;
}

interface IndicatorChoice {
	readonly spaces?: SpaceIndicators;
	readonly tabs?: boolean;
	readonly emptyValues?: boolean;
}

async function setIndicators(page: Page, choice: IndicatorChoice) {
	const dialog = await openSettings(page);
	if (choice.spaces !== undefined) {
		// Through its own group: a mode's label can also appear inside another
		// option's description, and the group is what makes the query mean
		// "the space mode" rather than "any radio saying this".
		await dialog
			.getByRole("radiogroup", { name: copy.settings.spaceIndicators.label })
			.getByRole("radio", {
				name: copy.settings.spaceIndicators.options[choice.spaces].label,
			})
			.click();
	}
	for (const [enabled, label] of [
		[choice.tabs, copy.settings.tabIndicators.label],
		[choice.emptyValues, copy.settings.emptyValueIndicators.label],
	] as const) {
		if (enabled === undefined) continue;
		const checkbox = dialog.getByRole("checkbox", { name: label });
		if (enabled) await checkbox.check();
		else await checkbox.uncheck();
	}
	await dialog.getByRole("button", { name: copy.settings.apply }).click();
	await expect(dialog).toBeHidden();
}

// The document as it is actually stored, which is the only text that matters.
// Reading the pane's DOM would measure the decorations rather than the source.
async function storedDocument(page: Page) {
	return page.evaluate((key) => {
		const saved = JSON.parse(localStorage.getItem(key) ?? "null");
		return JSON.stringify(saved?.document ?? null);
	}, STORAGE_KEY);
}

// The rendered text of a source pane, decorations excluded: every marker is
// generated content or a widget, so none of them is a text node and this is the
// source and nothing else.
async function renderedSource(pane: Locator) {
	return pane.evaluate((element) =>
		Array.from(
			element.querySelectorAll(".cm-line"),
			(line) => line.textContent ?? "",
		).join("\n"),
	);
}

test("markers are drawn by default and describe the empty fields a codec reads", async ({
	tabelo,
}) => {
	// Two rows where the middle field is empty in every delimited syntax.
	await tabelo.paste(
		[
			["Name", "City", "Role"].join("\t"),
			[first.name, "", first.role].join("\t"),
		].join("\n"),
	);

	await tabelo.choosePaneView("markdown", "csv");
	const csv = tabelo.pane("csv");
	await expect(csv.locator(marker)).toHaveCount(1);

	await tabelo.choosePaneView("csv", "tsv");
	const tsv = tabelo.pane("tsv");
	await expect(tsv.locator(marker)).toHaveCount(1);
	// TSV is tab-delimited, so its structure is invisible without the arrows.
	await expect(tsv.locator(tab).first()).toBeVisible();

	await tabelo.choosePaneView("tsv", "jira");
	await expect(tabelo.pane("jira").locator(marker)).toHaveCount(1);

	await tabelo.choosePaneView("jira", "markdown");
	await expect(tabelo.pane("markdown").locator(marker)).toHaveCount(1);

	// JSON spells an empty value out, so it needs no marker of its own.
	await tabelo.choosePaneView("markdown", "json");
	await expect(tabelo.pane("json").locator(marker)).toHaveCount(0);
});

test("each space mode marks a different set of spaces", async ({
	tabelo,
	page,
}) => {
	// Markdown pads every cell for alignment, and a trailing space is added to
	// the end of one line, so each mode has something of its own to find.
	await tabelo.paste(
		[["Name", "City"].join("\t"), [first.name, first.city].join("\t")].join(
			"\n",
		),
	);
	const pane = tabelo.pane("markdown");
	const editor = tabelo.source("markdown");
	await editor.click();
	await page.keyboard.press("ControlOrMeta+Home");
	await page.keyboard.press("End");
	await page.keyboard.type("  ");

	// Every mode is measured against the same text, so the counts can only
	// differ because the mode did.
	const count = async (mode: SpaceIndicators) => {
		await setIndicators(page, { spaces: mode });
		return paintedSpaces(pane);
	};

	expect(await count("none")).toBe(0);
	// Only the two spaces typed past the last pipe.
	const trailing = await count("trailing");
	expect(trailing).toBe(2);
	// Those, and the alignment padding around every cell.
	const boundary = await count("boundary");
	expect(boundary).toBeGreaterThan(trailing);
	// Plus the single spaces inside a value, which boundary leaves alone.
	expect(await count("all")).toBeGreaterThan(boundary);
});

test("a switch turns off exactly the marker it names", async ({
	tabelo,
	page,
}) => {
	await tabelo.paste(
		[
			["Name", "City", "Role"].join("\t"),
			[first.name, "", first.role].join("\t"),
		].join("\n"),
	);
	await tabelo.choosePaneView("markdown", "tsv");
	const pane = tabelo.pane("tsv");
	await expect(pane.locator(tab).first()).toBeVisible();
	await expect(pane.locator(marker)).toHaveCount(1);

	await setIndicators(page, { tabs: false });
	await expect
		.poll(() =>
			pane.evaluate(
				(element) =>
					getComputedStyle(
						element.querySelector(".cm-highlightTab") as Element,
						"::before",
					).content,
			),
		)
		.toBe("none");
	// The empty placeholder is a separate choice and is untouched by that one.
	await expect(pane.locator(marker)).toHaveCount(1);

	await setIndicators(page, { emptyValues: false });
	await expect(pane.locator(marker)).toHaveCount(0);
});

// The placeholder reads as text and takes width like text, but it is not text:
// nothing it draws reaches the document, and the caret steps over it rather
// than into it.
test("the placeholder is drawn beside the source without joining it", async ({
	tabelo,
	page,
}) => {
	await tabelo.paste(
		[["Name", "City"].join("\t"), [first.name, ""].join("\t")].join("\n"),
	);
	const pane = tabelo.pane("markdown");
	const editor = tabelo.source("markdown");
	await expect(pane.locator(marker)).toHaveCount(1);

	const stored = await storedDocument(page);
	const source = await renderedSource(pane);

	// Selecting the whole document and copying gives back the source, with no
	// sign of a word the user never typed.
	await editor.click();
	await page.keyboard.press("ControlOrMeta+a");
	await page.keyboard.press("ControlOrMeta+c");
	expect(source).not.toContain(copy.source.emptyValue);
	expect(stored).not.toContain(copy.source.emptyValue);

	// The caret cannot come to rest inside it: stepping from the start of the
	// empty cell's line lands on document positions only, so typing goes where
	// the source says it goes.
	await page.keyboard.press("ControlOrMeta+Home");
	await page.keyboard.press("ArrowDown");
	await page.keyboard.press("ArrowDown");
	await page.keyboard.press("End");
	await page.keyboard.type("x");
	await expect(pane.locator(marker)).toHaveCount(1);
	expect(await renderedSource(pane)).toBe(`${source}x`);
});

// What the reader actually sees is a glyph, not a class, so the glyphs are what
// these assert: the dot over a space, the arrow over a tab, and the word in an
// empty field, all three at once and all three from the same source text.
test("the space, tab, and empty glyphs are drawn together", async ({
	tabelo,
	page,
}) => {
	await tabelo.paste(
		[
			["Name", "City", "Role"].join("\t"),
			[first.name, "", `${first.role} `].join("\t"),
		].join("\n"),
	);
	await tabelo.choosePaneView("markdown", "tsv");
	const pane = tabelo.pane("tsv");
	await setIndicators(page, { spaces: "all", tabs: true, emptyValues: true });

	const drawn = async (selector: string) =>
		pane.evaluate(
			(element, css) =>
				Array.from(element.querySelectorAll(css))
					.map((span) => getComputedStyle(span, "::before").content)
					.filter((content) => content !== "none"),
			selector,
		);

	// A space carries a middle dot, a tab carries an arrow, and an empty field
	// carries the word. Quotation marks are how a computed `content` comes back.
	expect(await drawn(".cm-highlightSpace")).toContain('"·"');
	expect(await drawn(".cm-highlightTab")).toContain('"→"');
	expect(await drawn(marker)).toContain(`"${copy.source.emptyValue}"`);

	// None of the three reached the text they were drawn over.
	const source = await renderedSource(pane);
	expect(source).not.toContain(copy.source.emptyValue);
	expect(source).not.toContain("·");
	expect(source).not.toContain("→");
});

// The placeholder stands in for a value, so it has to get out of the way the
// moment there is one.
test("typing into an empty field replaces the placeholder with the value", async ({
	tabelo,
	page,
}) => {
	await tabelo.paste(
		[
			["Name", "City"].join("\t"),
			[first.name, ""].join("\t"),
			["Mabel", "Lisbon"].join("\t"),
		].join("\n"),
	);
	const pane = tabelo.pane("markdown");
	await expect(pane.locator(marker)).toHaveCount(1);

	// Clicking the placeholder puts the caret in the field it speaks for, and
	// what is typed there is an ordinary edit that reaches the table.
	await pane.locator(marker).click();
	await page.keyboard.type(first.city);

	await expect(pane.locator(marker)).toHaveCount(0);
	expect(await renderedSource(pane)).toContain(first.city);
	// The grid is the table itself, so this is the value arriving rather than
	// the pane merely redrawing.
	await expect(tabelo.cell(1, 2)).toHaveText(first.city);

	// And removing it again brings the placeholder back.
	for (let index = 0; index < first.city.length; index += 1) {
		await page.keyboard.press("Backspace");
	}
	await expect(pane.locator(marker)).toHaveCount(1);
});

test("turning indicators off changes what is drawn and nothing else", async ({
	tabelo,
	page,
}) => {
	await recordingClipboard(page);
	await page.reload();
	await tabelo.dismissWelcome();
	await expect(tabelo.workspace).toBeVisible();
	await tabelo.paste(
		[
			["Name", "City", "Role"].join("\t"),
			[first.name, "", first.role].join("\t"),
		].join("\n"),
	);
	await tabelo.choosePaneView("markdown", "csv");
	const pane = tabelo.pane("csv");
	await expect(pane.locator(marker)).toHaveCount(1);

	// Persistence is debounced, so the baseline is only meaningful once the
	// pasted table has actually reached storage.
	await expect.poll(() => storedDocument(page)).toContain(first.name);

	const withMarkers = {
		document: await storedDocument(page),
		source: await renderedSource(pane),
	};
	await tabelo.runPaneCommand("csv", "copySource");
	const copiedWithMarkers = await lastCopied(page);

	await setIndicators(page, {
		spaces: "none",
		tabs: false,
		emptyValues: false,
	});
	await expect(pane.locator(marker)).toHaveCount(0);
	expect(await paintedSpaces(pane)).toBe(0);

	expect(await storedDocument(page)).toBe(withMarkers.document);
	await tabelo.runPaneCommand("csv", "copySource");
	expect(await lastCopied(page)).toEqual(copiedWithMarkers);
	// With nothing drawn over it, the pane's own DOM is the source too, which
	// is what says the markers were the only difference.
	expect(await renderedSource(pane)).toBe(withMarkers.source);

	// And back on.
	await setIndicators(page, {
		spaces: "trailing",
		tabs: true,
		emptyValues: true,
	});
	await expect(pane.locator(marker)).toHaveCount(1);
	expect(await storedDocument(page)).toBe(withMarkers.document);
	await tabelo.runPaneCommand("csv", "copySource");
	expect(await lastCopied(page)).toEqual(copiedWithMarkers);
});

test("indicators leave the caret, the pane's wrapping, and editing alone", async ({
	tabelo,
	page,
}) => {
	await tabelo.paste(
		[["Name", "City"].join("\t"), [first.name, ""].join("\t")].join("\n"),
	);
	await tabelo.choosePaneView("markdown", "csv");
	const pane = tabelo.pane("csv");
	const editor = tabelo.source("csv");

	const menu = await tabelo.openPaneMenu("csv");
	await menu
		.getByRole("menuitemcheckbox", { name: copy.workspace.wrapSource })
		.click();
	await tabelo.paneMenuTrigger("csv").click();
	await expect(pane.locator(marker)).toHaveCount(1);

	await setIndicators(page, { emptyValues: false });
	await expect(pane.locator(marker)).toHaveCount(0);

	// The pane keeps the wrapping it was given: one global preference may not
	// reach a pane's own display state.
	const reopened = await tabelo.openPaneMenu("csv");
	await expect(
		reopened.getByRole("menuitemcheckbox", { name: copy.workspace.wrapSource }),
	).toBeChecked();
	await tabelo.paneMenuTrigger("csv").click();

	// A widget occupies no document position, so counting arrow presses from
	// the start of the line has to land a typed character in the same place
	// whether the marker beside it is drawn or not. The second row is the one
	// holding the empty field.
	const typeAtOffset = async () => {
		await editor.click();
		await page.keyboard.press("ControlOrMeta+Home");
		await page.keyboard.press("ArrowDown");
		for (let step = 0; step < 7; step += 1) {
			await page.keyboard.press("ArrowRight");
		}
		await page.keyboard.type("X");
		const text = await renderedSource(pane);
		await page.keyboard.press("ControlOrMeta+z");
		return text;
	};

	const withoutMarkers = await typeAtOffset();
	await setIndicators(page, { emptyValues: true });
	await expect(pane.locator(marker)).toHaveCount(1);
	expect(await typeAtOffset()).toBe(withoutMarkers);
});
