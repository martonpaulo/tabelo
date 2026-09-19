import type { Locator, Page } from "@playwright/test";
import { Window } from "happy-dom";
import { copy } from "@/copy/copy";
import { cellValuesEqual, readCell } from "@/core/cell-value";
import type { CellValue, TableDocument } from "@/core/types";
import { getCodec, listCodecs } from "@/formats";
import type { TableCodec } from "@/formats/types";
import { conditionNoticeIds } from "@/state/notice-queue";
import { listViews } from "@/views/registry";
import { expect, test } from "./fixtures";
import {
	downloadConfirm,
	lastCopied,
	recordingClipboard,
	renderedSource,
	storedDocument,
	type TabeloPage,
} from "./helpers";

// #306, delivery slice 4: the whole product carries every approved inline
// feature. One table holds all of them, and each test takes it through one
// boundary: the structured source views and their parsers, the plain views,
// the clipboard in both directions, Copy as, download, import, a reload,
// forced colours, and the keyboard. Views are named through the registry and
// codecs are chosen by what they declare, never by a list written here.

// The HTML codec parses through the platform's DOMParser, which Node does not
// have; the same happy-dom the codec's unit tests use supplies one, so every
// format's output can be read back here as the product reads it.
const { DOMParser: HappyDomParser } = new Window();
if (typeof globalThis.DOMParser === "undefined") {
	globalThis.DOMParser = HappyDomParser as unknown as typeof DOMParser;
}

const RIO = "https://example.com/rio";
const MAILTO = "mailto:paulo@example.com";
// Answered locally: the contract is what the page asks for, not whether a
// remote host is up.
const IMAGE = "https://example.com/madrid.png";
const PIXEL = Buffer.from(
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
	"base64",
);

// Every approved feature, each once: a bold header and a bold cell beside an
// emoji, a web link, italic, underline, strikethrough and inline code with a
// line break after them, an email link, and an image; the columns carry all
// three alignments.
const fixture = [
	"| **Name** | City | Note |",
	"| :--- | :---: | ---: |",
	`| **Ingrid** 🙂 | [Rio](${RIO}) | _it_ <u>un</u> ~~st~~ \`code\`<br>two |`,
	`| Paulo | [Write](${MAILTO}) | ![Retiro](${IMAGE}) |`,
].join("\n");

// The codecs that spell inline structure, and those that show only its text.
const structured = listCodecs().filter(
	(codec) => codec.reconciliation.inlineContent === "carried",
);
const plainViews = listViews().filter(
	(view) =>
		view.kind === "source" &&
		view.capabilities.editable &&
		view.codec?.reconciliation.inlineContent === "unexpressed",
);

// A table's header and cell values as the document holds them, structure
// included, so two reads compare formatting and not only visible text.
function values(document: TableDocument): CellValue[][] {
	return [
		document.columns.map((column) => column.header),
		...document.rows.map((row) =>
			document.columns.map((column) => readCell(row, column.id)),
		),
	];
}

function read(codec: TableCodec, text: string): CellValue[][] {
	const parsed = codec.parse(text);
	if (!parsed.ok) throw new Error(`${codec.id} could not read its own text.`);
	return values(parsed.document);
}

function sameValues(left: CellValue[][], right: CellValue[][]): boolean {
	return (
		left.length === right.length &&
		left.every(
			(row, index) =>
				row.length === right[index]?.length &&
				row.every((value, column) =>
					cellValuesEqual(value, right[index]?.[column] ?? null),
				),
		)
	);
}

const expected = read(getCodec("markdown"), fixture);

async function loadFixture(tabelo: TabeloPage): Promise<void> {
	await tabelo.page.route(IMAGE, (route) =>
		route.fulfill({ contentType: "image/png", body: PIXEL }),
	);
	await tabelo.importFile("roster.md", fixture, "text/markdown");
	await expect(tabelo.cell(1, 1)).toContainText("Ingrid");
	await tabelo.showInSourcePane("markdown");
}

function markdown(tabelo: TabeloPage): Promise<string> {
	return renderedSource(tabelo.pane("markdown"));
}

// What a surface draws for every feature, whichever surface it is: the grid's
// cells or the preview's. Located by semantics, so the check is the same
// contract for both.
async function expectEveryFeature(
	header: Locator,
	cell: (row: number, column: number) => Locator,
): Promise<void> {
	await expect(header.locator("strong")).toHaveText("Name");
	await expect(cell(1, 1).locator("strong")).toHaveText("Ingrid");
	await expect(cell(1, 1)).toContainText("🙂");
	await expect(cell(1, 2).getByRole("link", { name: "Rio" })).toHaveAttribute(
		"href",
		RIO,
	);
	await expect(cell(1, 3).locator("em")).toHaveText("it");
	await expect(cell(1, 3).locator("u")).toHaveText("un");
	await expect(cell(1, 3).locator("s")).toHaveText("st");
	await expect(cell(1, 3).locator("code")).toHaveText("code");
	// The line break stays a character of the text, as it was before #306.
	expect(await cell(1, 3).textContent()).toContain("code\ntwo");
	await expect(cell(2, 2).getByRole("link", { name: "Write" })).toHaveAttribute(
		"href",
		MAILTO,
	);
	await expect(cell(2, 3).getByRole("img", { name: "Retiro" })).toBeVisible();
}

test("the grid and the preview draw every approved feature", async ({
	tabelo,
}) => {
	await loadFixture(tabelo);
	await expectEveryFeature(tabelo.header(1), (row, column) =>
		tabelo.cell(row, column),
	);

	await tabelo.showInSourcePane("html-preview");
	const table = tabelo
		.pane("html-preview")
		.getByRole("table", { name: copy.a11y.preview });
	const rows = table.getByRole("row");
	await expectEveryFeature(
		table.getByRole("columnheader").first(),
		(row, column) =>
			rows
				.nth(row)
				.getByRole("cell")
				.nth(column - 1),
	);
});

for (const codec of structured) {
	test(`a draft in ${codec.id} reads every feature back without accumulating changes`, async ({
		page,
		tabelo,
	}) => {
		await loadFixture(tabelo);
		const before = await markdown(tabelo);

		await tabelo.showInSourcePane(codec.id);
		const editor = tabelo.source(codec.id);

		// A keystroke and its deletion: two parses, the last of the view's own
		// unchanged text, so the document is read back from this format.
		await editor.click();
		await page.keyboard.press("ControlOrMeta+End");
		await page.keyboard.type(" ");
		await page.keyboard.press("Backspace");
		await expectEveryFeature(tabelo.header(1), (row, column) =>
			tabelo.cell(row, column),
		);

		// Back to Markdown, byte for byte: nothing was normalized on the way.
		await tabelo.showInSourcePane("markdown");
		await expect.poll(() => markdown(tabelo)).toBe(before);
	});
}

test("a Jira edit reaches the grid as structure", async ({ page, tabelo }) => {
	await loadFixture(tabelo);
	await tabelo.showInSourcePane("jira");
	await tabelo.source("jira").click();
	// The end of the last row, inside its last cell, before the closing pipe.
	await page.keyboard.press("ControlOrMeta+End");
	await page.keyboard.press("ArrowLeft");
	await page.keyboard.type(" +new+");
	await expect(tabelo.cell(2, 3).locator("u")).toHaveText("new");
	await expect(
		tabelo.cell(2, 3).getByRole("img", { name: "Retiro" }),
	).toHaveCount(1);
});

test("a draft that does not parse keeps the formatted table everywhere else", async ({
	tabelo,
}) => {
	await loadFixture(tabelo);
	await tabelo.showInSourcePane("html");
	// An image without alternative text refuses the parse rather than losing
	// what the reader sees.
	await tabelo
		.source("html")
		.fill(
			'<table><thead><tr><th>Name</th></tr></thead><tbody><tr><td><img src="https://example.com/x.png"></td></tr></tbody></table>',
		);
	await expect(tabelo.pane("html").getByRole("status")).toHaveCount(1);
	await expectEveryFeature(tabelo.header(1), (row, column) =>
		tabelo.cell(row, column),
	);

	// The grid stays editable, and its edit wins over the draft.
	await tabelo.editCell(2, 1, "Paula");
	await expect
		.poll(() => renderedSource(tabelo.pane("html")))
		.toContain("<strong>Ingrid</strong>");
	expect(await renderedSource(tabelo.pane("html"))).toContain("Paula");
});

for (const view of plainViews) {
	test(`the ${view.id} view shows cell text and says what it cannot spell`, async ({
		page,
		tabelo,
	}) => {
		await loadFixture(tabelo);
		await tabelo.showInSourcePane(view.id);
		await expect(
			page.locator(`[data-notice-id="${conditionNoticeIds.projectionLoss}"]`),
		).toBeVisible();

		// The visible text, and none of the syntax or the addresses behind it.
		const source = await renderedSource(tabelo.pane(view.id));
		expect(source).toContain("Retiro");
		expect(source).toContain("Write");
		expect(source).not.toContain(IMAGE);
		expect(source).not.toContain(MAILTO);
		expect(source).not.toContain("**");

		// Untouched, the document keeps its structure.
		await expectEveryFeature(tabelo.header(1), (row, column) =>
			tabelo.cell(row, column),
		);
	});
}

test("formatting survives a reload", async ({ page, tabelo }) => {
	await loadFixture(tabelo);
	await tabelo.cell(2, 1).click();
	await page.keyboard.press("ControlOrMeta+B");
	await expect(tabelo.cell(2, 1).locator("strong")).toHaveText("Paulo");
	await expect.poll(() => storedDocument(page)).toContain('"kind":"inline"');

	await page.reload();
	await tabelo.grid().waitFor();
	await expectEveryFeature(tabelo.header(1), (row, column) =>
		tabelo.cell(row, column),
	);
	await expect(tabelo.cell(2, 1).locator("strong")).toHaveText("Paulo");
});

test("copied cells carry their semantics out and their exact structure back in", async ({
	page,
	tabelo,
}) => {
	await loadFixture(tabelo);
	const before = await markdown(tabelo);
	await tabelo.cell(1, 1).click();
	await tabelo.cell(2, 3).click({ modifiers: ["Shift"] });
	const flavours = await tabelo.copyFlavours();

	// Other applications receive the semantics as HTML and the text as TSV.
	expect(flavours.html).toContain("<strong>Ingrid</strong>");
	expect(flavours.html).toContain(`<a href="${RIO}">Rio</a>`);
	expect(flavours.html).toContain(`<a href="${MAILTO}">Write</a>`);
	expect(flavours.html).toContain(`alt="Retiro"`);
	expect(flavours.html).toContain("<code>code</code>");
	expect(flavours.text).toContain("Ingrid 🙂");
	expect(flavours.text).toContain("Retiro");
	expect(flavours.text).not.toContain("**");
	expect(flavours.text).not.toContain(IMAGE);

	// Emptied, then pasted back: Tabelo's own flavour restores the structure.
	await page.keyboard.press("Backspace");
	await expect(tabelo.cell(1, 1)).toHaveText("");
	await tabelo.cell(1, 1).click();
	await tabelo.paste(flavours.text, flavours.html);
	await expectEveryFeature(tabelo.header(1), (row, column) =>
		tabelo.cell(row, column),
	);
	await expect.poll(() => markdown(tabelo)).toBe(before);
});

test("formatting pasted from another application is read from its HTML", async ({
	tabelo,
}) => {
	await loadFixture(tabelo);
	await tabelo.cell(2, 1).click();
	await tabelo.paste(
		"Felix\tMexico City",
		'<table><tr><td><b>Felix</b></td><td><a href="https://example.com/mexico">Mexico City</a></td></tr></table>',
	);
	await expect(tabelo.cell(2, 1).locator("strong")).toHaveText("Felix");
	await expect(
		tabelo.cell(2, 2).getByRole("link", { name: "Mexico City" }),
	).toHaveAttribute("href", "https://example.com/mexico");
});

for (const codec of listCodecs()) {
	test(`Copy as ${codec.id} hands over what the format can spell`, async ({
		page,
		tabelo,
	}) => {
		await recordingClipboard(page);
		await page.reload();
		await tabelo.dismissWelcome();
		await expect(tabelo.workspace).toBeVisible();
		await loadFixture(tabelo);

		await tabelo.copyAs(codec.id);
		await expect.poll(async () => (await lastCopied(page))?.text).toBeTruthy();
		const text = (await lastCopied(page))?.text ?? "";
		const copied = read(codec, text);
		if (codec.reconciliation.inlineContent === "carried") {
			// The structure itself, read back exactly.
			expect(sameValues(copied, expected)).toBe(true);
		} else {
			// Only the visible text, the addresses left behind.
			expect(text).toContain("Retiro");
			expect(text).not.toContain(IMAGE);
		}
	});
}

// Captures a download without writing it to disk, so its bytes can be read.
async function savedFile(
	page: Page,
	act: () => Promise<void>,
): Promise<string> {
	const waiting = page.waitForEvent("download");
	await act();
	const download = await waiting;
	const stream = await download.createReadStream();
	const chunks: Buffer[] = [];
	for await (const chunk of stream) chunks.push(chunk as Buffer);
	return Buffer.concat(chunks).toString("utf8");
}

for (const codec of listCodecs()) {
	test(`downloading ${codec.id} writes what the format can spell`, async ({
		page,
		tabelo,
	}) => {
		await loadFixture(tabelo);
		await tabelo.openAppMenu();
		await page
			.getByRole("menuitem", { name: copy.actions.downloadTable })
			.click();
		const dialog = page.getByRole("dialog");
		await expect(dialog).toBeVisible();
		await dialog
			.getByRole("radio", { name: copy.views[codec.id].label })
			.click();

		const body = await savedFile(page, () => downloadConfirm(page).click());
		if (codec.reconciliation.inlineContent === "carried") {
			expect(sameValues(read(codec, body), expected)).toBe(true);
		} else {
			expect(body).toContain("Retiro");
			expect(body).not.toContain(IMAGE);
		}
	});
}

test("an imported HTML file keeps its formatting and names what it drops", async ({
	tabelo,
}) => {
	await tabelo.importFile(
		"roster.html",
		[
			"<table>",
			"<thead><tr><th><b>Name</b></th><th>City</th></tr></thead>",
			`<tbody><tr><td><i>Ingrid</i></td><td><a href="${RIO}">Rio</a></td></tr>`,
			"<tr><td><mark>Paulo</mark></td><td>Madrid</td></tr></tbody>",
			"</table>",
		].join(""),
		"text/html",
	);
	await expect(tabelo.header(1).locator("strong")).toHaveText("Name");
	await expect(tabelo.cell(1, 1).locator("em")).toHaveText("Ingrid");
	await expect(
		tabelo.cell(1, 2).getByRole("link", { name: "Rio" }),
	).toHaveAttribute("href", RIO);
	// A declined element keeps its text, and the import says so.
	await expect(tabelo.cell(2, 1)).toHaveText("Paulo");
	await expect(tabelo.cell(2, 1).locator("mark")).toHaveCount(0);
	await expect(tabelo.notice("warning")).toBeVisible();
});

test("an imported Jira file keeps its formatting", async ({ tabelo }) => {
	await tabelo.importFile(
		"roster.jira.txt",
		[
			"||*Name*||City||",
			`|-Ingrid-|[Rio|${RIO}]|`,
			`|{{Paulo}}|!${IMAGE}|alt=Retiro!|`,
		].join("\n"),
		"text/plain",
	);
	await expect(tabelo.header(1).locator("strong")).toHaveText("Name");
	await expect(tabelo.cell(1, 1).locator("s")).toHaveText("Ingrid");
	await expect(
		tabelo.cell(1, 2).getByRole("link", { name: "Rio" }),
	).toBeVisible();
	await expect(tabelo.cell(2, 1).locator("code")).toHaveText("Paulo");
	await expect(
		tabelo.cell(2, 2).getByRole("img", { name: "Retiro" }),
	).toHaveCount(1);
});

test("formatting stays discernible in forced colours", async ({
	page,
	tabelo,
}) => {
	await page.emulateMedia({ forcedColors: "active" });
	await loadFixture(tabelo);
	const note = tabelo.cell(1, 3);
	const style = (locator: Locator) =>
		locator.evaluate((element) => {
			const computed = getComputedStyle(element);
			return {
				weight: Number(computed.fontWeight),
				style: computed.fontStyle,
				decoration: computed.textDecorationLine,
				family: computed.fontFamily,
			};
		});

	// Each mark is carried by its element's own shape, never by colour alone.
	const plain = await style(tabelo.cell(2, 1));
	expect(
		(await style(tabelo.cell(1, 1).locator("strong"))).weight,
	).toBeGreaterThan(plain.weight);
	expect((await style(note.locator("em"))).style).toBe("italic");
	expect((await style(note.locator("u"))).decoration).toContain("underline");
	expect((await style(note.locator("s"))).decoration).toContain("line-through");
	expect((await style(note.locator("code"))).family).not.toBe(plain.family);
	expect(
		(await style(tabelo.cell(1, 2).getByRole("link"))).decoration,
	).toContain("underline");
});

test("the keyboard reaches every formatting command", async ({
	page,
	tabelo,
}) => {
	await loadFixture(tabelo);
	await tabelo.cell(1, 1).click();
	await page.keyboard.press("ArrowDown");
	const cell = tabelo.cell(2, 1);
	await expect(cell).toBeFocused();

	// A mark from its chord, read back from the cell menu the keyboard opens.
	await page.keyboard.press("ControlOrMeta+B");
	await expect(cell.locator("strong")).toHaveText("Paulo");
	await page.keyboard.press("Shift+F10");
	const menu = page.getByRole("menu");
	await expect(menu).toBeVisible();
	await expect(
		menu.getByRole("menuitemcheckbox", { name: copy.actions.bold }),
	).toHaveAttribute("aria-checked", "true");
	await page.keyboard.press("Escape");
	await expect(menu).toBeHidden();
	await expect(cell).toBeFocused();

	// A link through its dialog, field to field and submitted with Enter.
	await page.keyboard.press("ControlOrMeta+K");
	const dialog = page.getByRole("dialog");
	await expect(
		dialog.getByRole("textbox", { name: copy.link.text }),
	).toBeFocused();
	await page.keyboard.press("Tab");
	await expect(
		dialog.getByRole("textbox", { name: copy.link.address }),
	).toBeFocused();
	await page.keyboard.type(MAILTO);
	await page.keyboard.press("Enter");
	await expect(dialog).toBeHidden();
	await expect(cell).toBeFocused();
	await expect(cell.getByRole("link", { name: "Paulo" })).toHaveAttribute(
		"href",
		MAILTO,
	);

	// The rich editor opens on Enter and commits on Enter; the grid's undo then
	// takes the commit back as one step.
	await page.keyboard.press("Enter");
	const editor = tabelo.grid().getByRole("textbox", {
		name: copy.a11y.cellEditor(1, 0),
	});
	await expect(editor).toBeFocused();
	await page.keyboard.type("!");
	await page.keyboard.press("Enter");
	await expect(cell).toHaveText("Paulo!");
	await page.keyboard.press("ControlOrMeta+Z");
	await expect(cell).toHaveText("Paulo");
	await expect(cell.getByRole("link", { name: "Paulo" })).toBeVisible();
});
