import { Window } from "happy-dom";
import { copy } from "@/copy/copy";
import { documentToMatrix } from "@/core/document";
import { listCodecs } from "@/formats";
import type { TableCodec } from "@/formats/types";
import { expect, test } from "./fixtures";
import { lastCopied, recordingClipboard, type TabeloPage } from "./helpers";

// Copy as answers a different question from the pane menu's Copy source: it
// hands over the document as a chosen format, whatever the workspace happens to
// be showing. The assertion that matters is a round trip, so what reaches the
// clipboard is text that reads back as this table rather than text that merely
// looks like the format.

// The HTML codec parses through the platform's DOMParser, which Node does not
// have. The same happy-dom the codec's own unit tests run under supplies one,
// so every format can be read back here in the same way.
const { DOMParser: HappyDomParser } = new Window();
if (typeof globalThis.DOMParser === "undefined") {
	globalThis.DOMParser = HappyDomParser as unknown as typeof DOMParser;
}

const table = [
	["Name", "City"],
	["Ingrid", "Rio"],
	["Paulo", "Madrid"],
];

// Markdown states that its first row is the header, so importing it replaces
// the document outright without the header question a delimited file has to
// ask. Every column is named, which is what JSON needs to represent the table
// at all.
const fixture = [
	"| Name | City |",
	"| --- | --- |",
	"| Ingrid | Rio |",
	"| Paulo | Madrid |",
].join("\n");

async function loadFixture(tabelo: TabeloPage): Promise<void> {
	await tabelo.importFile("table.md", fixture, "text/markdown");
	await expect(tabelo.cell(2, 2)).toHaveText("Madrid");
}

function readBack(codec: TableCodec, text: string): string[][] {
	const parsed = codec.parse(text);
	if (!parsed.ok) throw new Error(`${codec.id} could not read its own output.`);
	return documentToMatrix(parsed.document).map((row) => [...row]);
}

test("offers every registered format and nothing enumerated by hand", async ({
	tabelo,
}) => {
	await loadFixture(tabelo);
	const submenu = await tabelo.openCopyAsSubmenu();

	// The count is the contract: a codec added to the registry has to appear
	// here without an edit, and none may appear that the registry does not know.
	await expect(submenu.getByRole("menuitem")).toHaveCount(listCodecs().length);
	for (const codec of listCodecs()) {
		await expect(
			submenu.getByRole("menuitem", { name: copy.views[codec.id].label }),
		).toBeVisible();
	}
});

for (const codec of listCodecs()) {
	test(`copying as ${codec.id} writes text that reads back as the same table`, async ({
		page,
		tabelo,
	}) => {
		await recordingClipboard(page);
		await page.reload();
		await tabelo.dismissWelcome();
		await expect(tabelo.workspace).toBeVisible();
		await loadFixture(tabelo);

		await tabelo.copyAs(codec.id);

		await expect(
			tabelo.notice().filter({ hasText: copy.notices.copied("format") }),
		).toBeVisible();
		const copied = await lastCopied(page);
		expect(copied).toBeDefined();
		// Plain text only. The rich-text table is the preview pane's own command
		// and carries the text/html flavour; two commands must not write one
		// payload.
		expect(copied?.html).toBeUndefined();
		expect(readBack(codec, copied?.text ?? "")).toEqual(table);
	});
}

test("copies a format no pane is showing", async ({ page, tabelo }) => {
	await recordingClipboard(page);
	await page.reload();
	await tabelo.dismissWelcome();
	await expect(tabelo.workspace).toBeVisible();
	await loadFixture(tabelo);

	// The workspace opens on the grid and Markdown, so Jira is reachable only
	// because this command is document-level rather than pane-level.
	await expect(tabelo.pane("jira")).toHaveCount(0);
	await tabelo.copyAs("jira");

	expect((await lastCopied(page))?.text).toContain("Ingrid");
	await expect(tabelo.pane("jira")).toHaveCount(0);
});

test("refuses a format that cannot represent the table, in the same words", async ({
	tabelo,
}) => {
	await loadFixture(tabelo);
	await tabelo.editHeader(2, "Name", "City");
	await tabelo.dismissNotices();

	const submenu = await tabelo.openCopyAsSubmenu();
	const json = submenu.getByRole("menuitem", {
		name: copy.views.json.label,
		exact: true,
	});
	await expect(json).toBeDisabled();

	// The correction is a separate command beside the refused row, never the
	// row answering to a click it reports itself unable to take.
	const fix = submenu.getByRole("menuitem", {
		name: copy.a11y.fixTableFor(copy.views.json.label),
	});
	await expect(fix).toBeEnabled();

	await fix.click();
	await expect(submenu).toBeHidden();
	await expect(tabelo.header(1)).toHaveAttribute("aria-selected", "true");
	await expect(tabelo.header(1)).toBeFocused();
	await expect(tabelo.notice("warning")).toBeVisible();
});

test("a blocked clipboard says where the format can be found", async ({
	page,
	tabelo,
}) => {
	await page.addInitScript(() => {
		Object.defineProperty(navigator, "clipboard", {
			value: {
				writeText: () => {
					const error = new Error("denied");
					error.name = "NotAllowedError";
					return Promise.reject(error);
				},
			},
			configurable: true,
		});
	});
	await page.reload();
	await tabelo.dismissWelcome();
	await expect(tabelo.workspace).toBeVisible();

	await tabelo.copyAs("jira");

	await expect(
		tabelo
			.notice("error")
			.filter({ hasText: copy.notices.clipboardWriteFailed("format") }),
	).toBeVisible();
});
