import type { Locator, Page } from "@playwright/test";
import { copy } from "@/copy/copy";
import { samplePerson } from "@/core/sample-data";
import { listViews } from "@/views/registry";
import { alignsColumns, type ViewId } from "@/views/types";
import { expect, test } from "./fixtures";
import {
	editorScroller,
	lastCopied,
	recordingClipboard,
	renderedSource,
	storedDocument,
	type TabeloPage,
} from "./helpers";

// Column alignment in the source views whose format does not pad its own text
// (#396): padding drawn after each field so every column starts at the same
// place on every row, on screen only. The padding is a widget with no text and
// no role, so its class is the technical contract; positions are never compared
// for equality, only whether padding is drawn and whether the text around it
// stays byte-identical.

const PAD = ".cm-tabeloAlignPadding";
const first = samplePerson(0);
const second = samplePerson(1);

// Names of different lengths, so every column needs padding somewhere.
const table = [
	["Name", "City", "Role"].join("\t"),
	[first.name, first.city, first.role].join("\t"),
	[second.name, second.city, second.role].join("\t"),
].join("\n");

const aligning = listViews()
	.filter(alignsColumns)
	.map((view) => view.id);

async function openSettings(page: Page): Promise<Locator> {
	await page.getByRole("button", { name: copy.actions.openAppMenu }).click();
	const menu = page.getByRole("menu", { name: copy.actions.openAppMenu });
	await menu.getByRole("menuitem", { name: copy.settings.title }).click();
	await menu.waitFor({ state: "hidden" });
	const dialog = page.getByRole("dialog", { name: copy.settings.title });
	await dialog.waitFor({ state: "visible" });
	return dialog;
}

async function setAlignment(page: Page, on: boolean): Promise<void> {
	const dialog = await openSettings(page);
	const toggle = dialog.getByRole("switch", {
		name: copy.settings.alignColumns.label,
	});
	if (on) await toggle.check();
	else await toggle.uncheck();
	await dialog.getByRole("button", { name: copy.settings.done }).click();
	await expect(dialog).toBeHidden();
}

async function openDisplay(tabelo: TabeloPage, view: ViewId): Promise<Locator> {
	const menu = await tabelo.openPaneMenu(view);
	await menu.getByRole("menuitem", { name: copy.paneDisplay.command }).click();
	await menu.waitFor({ state: "hidden" });
	const dialog = tabelo.page.getByRole("dialog", {
		name: copy.paneDisplay.title,
	});
	await dialog.waitFor({ state: "visible" });
	return dialog;
}

// A pasted table opens its own arrangement, with the pasted format beside the
// grid; each test then puts the view it is about into that pane.
async function seed(tabelo: TabeloPage, view: ViewId): Promise<Locator> {
	await tabelo.paste(table);
	await tabelo.showInSourcePane(view);
	await expect(tabelo.source(view)).toBeVisible();
	return tabelo.pane(view);
}

test("every format that aligns on screen does so by default, and no other", async ({
	tabelo,
}) => {
	await tabelo.paste(table);
	for (const view of listViews()) {
		if (view.kind !== "source") continue;
		await tabelo.showInSourcePane(view.id);
		await expect(tabelo.source(view.id)).toBeVisible();
		const pads = editorScroller(tabelo.pane(view.id)).locator(PAD);
		if (aligning.includes(view.id)) {
			await expect(pads.first()).toBeAttached();
		} else {
			await expect(pads).toHaveCount(0);
		}
	}
});

test("the text, a copy, and the stored table are the same with alignment on and off", async ({
	tabelo,
	page,
}) => {
	await recordingClipboard(page);
	await page.reload();
	await tabelo.dismissWelcome();
	await expect(tabelo.workspace).toBeVisible();
	await tabelo.paste(table);
	// Autosave writes after its debounce, so wait until the pasted table is the
	// stored one before capturing it (#400).
	await expect.poll(() => storedDocument(page)).toContain(second.name);
	for (const view of aligning) {
		await tabelo.showInSourcePane(view);
		const pane = tabelo.pane(view);
		await expect(editorScroller(pane).locator(PAD).first()).toBeAttached();
		const shown = await renderedSource(pane);
		const stored = await storedDocument(page);
		await tabelo.runPaneCommand(view, "copySource");
		const copied = (await lastCopied(page))?.text;
		expect(copied).toBe(shown);

		await setAlignment(page, false);
		await expect(editorScroller(pane).locator(PAD)).toHaveCount(0);
		expect(await renderedSource(pane)).toBe(shown);
		expect(await storedDocument(page)).toBe(stored);
		await tabelo.runPaneCommand(view, "copySource");
		expect((await lastCopied(page))?.text).toBe(copied);
		await setAlignment(page, true);
	}
});

test("a pane can override the default, and only aligning panes offer it", async ({
	tabelo,
	page,
}) => {
	await setAlignment(page, false);
	const pane = await seed(tabelo, "csv");
	await expect(editorScroller(pane).locator(PAD)).toHaveCount(0);

	const dialog = await openDisplay(tabelo, "csv");
	await dialog
		.getByRole("radiogroup", { name: copy.settings.alignColumns.label })
		.getByRole("radio", { name: copy.paneDisplay.on, exact: true })
		.click();
	await expect(editorScroller(pane).locator(PAD).first()).toBeAttached();
	await dialog.getByRole("button", { name: copy.paneDisplay.done }).click();
	await expect(dialog).toBeHidden();

	await tabelo.showInSourcePane("markdown");
	const markdown = await openDisplay(tabelo, "markdown");
	await expect(
		markdown.getByRole("radiogroup", {
			name: copy.settings.alignColumns.label,
		}),
	).toHaveCount(0);
	await markdown.getByRole("button", { name: copy.paneDisplay.done }).click();
});

test("the caret steps over the padding and typing reflows it", async ({
	tabelo,
	page,
}) => {
	const pane = await seed(tabelo, "csv");
	const editor = tabelo.source("csv");
	await expect(editorScroller(pane).locator(PAD).first()).toBeAttached();

	// From the start of the header, past "Name" and its delimiter: one step per
	// character, none inside the padding drawn after the field.
	await editor.click();
	await page.keyboard.press("ControlOrMeta+Home");
	for (let step = 0; step < "Name,".length; step += 1) {
		await page.keyboard.press("ArrowRight");
	}
	await page.keyboard.type("Home ");
	await expect(tabelo.header(2)).toHaveText("Home City");

	// A header wider than every value below it takes the padding from them.
	await page.keyboard.press("ControlOrMeta+Home");
	await page.keyboard.press("End");
	await page.keyboard.type(" and team");
	await expect(tabelo.header(3)).toHaveText("Role and team");
	await expect(editorScroller(pane).locator(PAD).first()).toBeAttached();
});

test("a draft that does not parse is shown as typed, without padding", async ({
	tabelo,
	page,
}) => {
	const pane = await seed(tabelo, "csv");
	await expect(editorScroller(pane).locator(PAD).first()).toBeAttached();

	// An opening quote with no closing one leaves the rest of the text inside
	// one field, which the codec refuses.
	await tabelo.source("csv").click();
	await page.keyboard.press("ControlOrMeta+Home");
	await page.keyboard.type('"');
	await expect(editorScroller(pane).locator(PAD)).toHaveCount(0);

	await page.keyboard.press("Backspace");
	await expect(editorScroller(pane).locator(PAD).first()).toBeAttached();
});
