import type { Locator, Page } from "@playwright/test";
import { copy } from "@/copy/copy";
import { samplePerson } from "@/core/sample-data";
import { expect, test } from "./fixtures";
import {
	downloadConfirm,
	lastCopied,
	openDownloadChooser,
	recordingClipboard,
	renderedSource,
	type TabeloPage,
} from "./helpers";

// How Markdown spells a line break inside a cell (#397): the character
// reference `&#10;` by default, `<br>` when the reader chooses it. The pane and
// every Markdown output write the same spelling, and the parser reads both
// whatever is chosen.

const first = samplePerson(0);
const second = samplePerson(1);
const REFERENCE = `${first.city}&#10;${second.city}`;
const TAG = `${first.city}<br>${second.city}`;

async function seed(tabelo: TabeloPage): Promise<void> {
	// Typed with `<br>`, which the parser reads as a break like any spelling.
	await tabelo
		.source("markdown")
		.fill(`| Name | City |\n| --- | --- |\n| ${first.name} | ${TAG} |`);
	await expect
		.poll(() => tabelo.cell(1, 2).textContent())
		.toBe(`${first.city}\n${second.city}`);
	// Another view takes the draft, so the Markdown pane shows the projection.
	await tabelo.choosePaneView("markdown", "csv");
	await tabelo.choosePaneView("csv", "markdown");
}

async function setTags(page: Page, on: boolean): Promise<void> {
	await page.getByRole("button", { name: copy.actions.openAppMenu }).click();
	const menu = page.getByRole("menu", { name: copy.actions.openAppMenu });
	await menu.getByRole("menuitem", { name: copy.settings.title }).click();
	await menu.waitFor({ state: "hidden" });
	const dialog = page.getByRole("dialog", { name: copy.settings.title });
	const toggle = dialog.getByRole("switch", {
		name: copy.settings.lineBreakTags.label,
	});
	if (on) await toggle.check();
	else await toggle.uncheck();
	await dialog.getByRole("button", { name: copy.settings.done }).click();
	await expect(dialog).toBeHidden();
}

async function downloadedMarkdown(page: Page): Promise<string> {
	const waiting = page.waitForEvent("download");
	await openDownloadChooser(page);
	const dialog = page.getByRole("dialog");
	await dialog.getByRole("radio", { name: copy.views.markdown.label }).click();
	await downloadConfirm(page).click();
	const download = await waiting;
	const chunks: Buffer[] = [];
	for await (const chunk of await download.createReadStream()) {
		chunks.push(chunk as Buffer);
	}
	return Buffer.concat(chunks).toString("utf8");
}

function markdown(tabelo: TabeloPage): Locator {
	return tabelo.pane("markdown");
}

test("a line break is &#10; by default in the pane and in a download", async ({
	tabelo,
	page,
}) => {
	await seed(tabelo);
	await expect
		.poll(() => renderedSource(markdown(tabelo)))
		.toContain(REFERENCE);
	expect(await downloadedMarkdown(page)).toContain(REFERENCE);
});

test("choosing <br> rewrites the pane, the download, and Copy as", async ({
	tabelo,
	page,
}) => {
	await recordingClipboard(page);
	await page.reload();
	await tabelo.dismissWelcome();
	await expect(tabelo.workspace).toBeVisible();
	await seed(tabelo);

	await setTags(page, true);
	await expect.poll(() => renderedSource(markdown(tabelo))).toContain(TAG);
	expect(await downloadedMarkdown(page)).toContain(TAG);
	await tabelo.copyAs("markdown");
	expect((await lastCopied(page))?.text).toContain(TAG);
	// The table itself is the same either way.
	await expect
		.poll(() => tabelo.cell(1, 2).textContent())
		.toBe(`${first.city}\n${second.city}`);

	await setTags(page, false);
	await expect
		.poll(() => renderedSource(markdown(tabelo)))
		.toContain(REFERENCE);
});

test("a pane's own choice decides every Markdown output", async ({
	tabelo,
	page,
}) => {
	await seed(tabelo);
	const menu = await tabelo.openPaneMenu("markdown");
	await menu.getByRole("menuitem", { name: copy.paneDisplay.command }).click();
	await menu.waitFor({ state: "hidden" });
	const dialog = page.getByRole("dialog", { name: copy.paneDisplay.title });
	await dialog
		.getByRole("radiogroup", { name: copy.settings.lineBreakTags.label })
		.getByRole("radio", { name: copy.paneDisplay.on, exact: true })
		.click();
	await dialog.getByRole("button", { name: copy.paneDisplay.done }).click();
	await expect(dialog).toBeHidden();

	await expect.poll(() => renderedSource(markdown(tabelo))).toContain(TAG);
	expect(await downloadedMarkdown(page)).toContain(TAG);
});

test("a pending draft keeps the spelling it was typed in", async ({
	tabelo,
	page,
}) => {
	await tabelo
		.source("markdown")
		.fill(`| Name | City |\n| --- | --- |\n| ${first.name} | ${REFERENCE} |`);
	await expect
		.poll(() => tabelo.cell(1, 2).textContent())
		.toBe(`${first.city}\n${second.city}`);
	await setTags(page, true);
	expect(await renderedSource(markdown(tabelo))).toContain(REFERENCE);
});
