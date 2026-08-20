import type { Locator, Page } from "@playwright/test";
import { copy } from "@/copy/copy";
import { samplePerson } from "@/core/sample-data";
import { STORAGE_KEY } from "@/persistence/schema";
import { expect, test } from "./fixtures";
import { lastCopied, recordingClipboard } from "./helpers";

// Whitespace and empty-value indicators are decorations and nothing else. What
// these tests protect is that promise: the same bytes reach the document, the
// clipboard, and storage whether the markers are drawn or not.

const first = samplePerson(0);

const marker = ".cm-tabeloEmptyValue";
const space = ".cm-highlightSpace";
const tab = ".cm-highlightTab";

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

async function setIndicators(page: Page, show: boolean) {
	const dialog = await openSettings(page);
	const checkbox = dialog.getByRole("checkbox", {
		name: copy.settings.whitespaceIndicators.label,
	});
	if (show) await checkbox.check();
	else await checkbox.uncheck();
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

// The rendered text of a source pane, decorations excluded: a widget carries no
// text node, so this is the source and nothing else.
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
	const markdown = tabelo.pane("markdown");
	await expect(markdown.locator(marker)).toHaveCount(1);
	// Markdown pads its cells for alignment, which is exactly the whitespace a
	// user cannot otherwise see.
	await expect(markdown.locator(space).first()).toBeVisible();

	// JSON spells an empty value out, so it needs no marker of its own.
	await tabelo.choosePaneView("markdown", "json");
	await expect(tabelo.pane("json").locator(marker)).toHaveCount(0);
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

	await setIndicators(page, false);
	await expect(pane.locator(marker)).toHaveCount(0);
	await expect(pane.locator(space)).toHaveCount(0);
	await expect(pane.locator(tab)).toHaveCount(0);

	expect(await storedDocument(page)).toBe(withMarkers.document);
	expect(await renderedSource(pane)).toBe(withMarkers.source);
	await tabelo.runPaneCommand("csv", "copySource");
	expect(await lastCopied(page)).toEqual(copiedWithMarkers);

	// And back on, from the same one preference.
	await setIndicators(page, true);
	await expect(pane.locator(marker)).toHaveCount(1);
	expect(await storedDocument(page)).toBe(withMarkers.document);
	expect(await renderedSource(pane)).toBe(withMarkers.source);
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

	await setIndicators(page, false);
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
	await setIndicators(page, true);
	await expect(pane.locator(marker)).toHaveCount(1);
	expect(await typeAtOffset()).toBe(withoutMarkers);
});
