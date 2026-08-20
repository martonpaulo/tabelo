import type { Page } from "@playwright/test";
import { copy } from "@/copy/copy";
import type { ExpectedColumnType } from "@/core/types";
import { expect, test } from "./fixtures";
import { lastCopied, recordingClipboard, type TabeloPage } from "./helpers";

// Types survive between two Tabelo tabs because a private payload rides inside
// the HTML flavour, and they never appear from outside because that payload has
// to validate and match the visible table before it is believed. Both engines
// run these: Firefox refuses to write a custom clipboard format at all, which
// is why the payload travels this way rather than as its own MIME type.

const TYPED_ROWS =
	'[{"qty":1,"ok":true,"note":null,"code":"1"},{"qty":2,"ok":false,"note":"x","code":"2"}]';

async function importTypedRows(tabelo: TabeloPage): Promise<void> {
	await tabelo.importFile("typed.json", TYPED_ROWS, "application/json");
	await expect(tabelo.cell(1, 1)).toHaveAttribute("data-cell-type", "number");
}

async function selectRange(
	tabelo: TabeloPage,
	from: readonly [number, number],
	to: readonly [number, number],
): Promise<void> {
	await tabelo.cell(from[0], from[1]).click();
	await tabelo.cell(to[0], to[1]).click({ modifiers: ["Shift"] });
}

// The paste has to land in a table that does not exist yet, which is the only
// path where a column's expectation is created rather than already set.
async function startBlankTable(tabelo: TabeloPage): Promise<void> {
	await tabelo.runAppCommand("newTable");
	await tabelo.page
		.getByRole("dialog", { name: copy.newTable.title })
		.getByRole("button", { name: copy.newTable.confirm })
		.click();
	await tabelo.page
		.getByRole("region", { name: copy.empty.title })
		.getByRole("button", { name: copy.empty.emptyAction })
		.click();
}

async function setExpectedType(
	page: Page,
	tabelo: TabeloPage,
	column: number,
	type: ExpectedColumnType,
): Promise<void> {
	const name = /column actions: .*expected type/i;
	await tabelo.columnIndex(column).getByRole("button", { name }).click();
	const menu = page.getByRole("menu", { name });
	await menu
		.getByRole("group", { name: copy.actions.expectedType })
		.getByRole("menuitemradio", {
			name: copy.cellTypes.expected[type],
			exact: true,
		})
		.click();
	await menu.waitFor({ state: "hidden" });
}

test("a copied value pastes back as the same value, not as its text", async ({
	tabelo,
}) => {
	await importTypedRows(tabelo);
	await selectRange(tabelo, [1, 1], [1, 3]);

	const copied = await tabelo.copyFlavours();
	await tabelo.cell(2, 1).click();
	await tabelo.paste(copied.text, copied.html);

	// The public text says "1", "true" and "", which is all TSV can say. What
	// came back is a number, a boolean, and a null.
	expect(copied.text).toBe("1\ttrue\t");
	await expect(tabelo.cell(2, 1)).toHaveAttribute("data-cell-type", "number");
	await expect(tabelo.cell(2, 2)).toHaveAttribute("data-cell-type", "boolean");
	await expect(tabelo.cell(2, 3)).toHaveAttribute("data-cell-type", "null");
});

// The type belongs to the cell. Pasting values into existing columns writes
// values, and leaves what those columns expect to be typed into them alone.
test("a paste carries the value's type without restructuring the destination", async ({
	tabelo,
}) => {
	await importTypedRows(tabelo);
	await tabelo.cell(1, 1).click();

	const copied = await tabelo.copyFlavours();
	await tabelo.cell(1, 4).click();
	await tabelo.paste(copied.text, copied.html);

	await expect(tabelo.cell(1, 4)).toHaveAttribute("data-cell-type", "number");
	await expect(
		tabelo.columnIndex(4).getByRole("button", { name: /column actions/i }),
	).toHaveAttribute("data-expected-type", "text");
});

test("the expected column types travel with a copy into an empty table", async ({
	page,
	tabelo,
}) => {
	await importTypedRows(tabelo);
	await setExpectedType(page, tabelo, 1, "number");
	await setExpectedType(page, tabelo, 2, "boolean");
	await selectRange(tabelo, [1, 1], [2, 2]);
	const copied = await tabelo.copyFlavours();

	await startBlankTable(tabelo);
	await tabelo.cell(1, 1).click();
	await tabelo.paste(copied.text, copied.html);

	const expectedTypeOf = (column: number) =>
		tabelo.columnIndex(column).getByRole("button", { name: /column actions/i });
	await expect(expectedTypeOf(1)).toHaveAttribute(
		"data-expected-type",
		"number",
	);
	await expect(expectedTypeOf(2)).toHaveAttribute(
		"data-expected-type",
		"boolean",
	);
	await expect(tabelo.cell(1, 1)).toHaveAttribute("data-cell-type", "number");
});

// Without the payload the same bytes are ordinary HTML from an unknown
// application, and nothing in them says what a type is.
test("the same content pastes as text once the private payload is gone", async ({
	tabelo,
}) => {
	await importTypedRows(tabelo);
	await selectRange(tabelo, [1, 1], [1, 3]);
	const copied = await tabelo.copyFlavours();

	await tabelo.cell(2, 1).click();
	await tabelo.paste(
		copied.text,
		copied.html.replace(/<!--tabelo:[\s\S]*?-->/, ""),
	);

	await expect(tabelo.cell(2, 1)).toHaveAttribute("data-cell-type", "string");
	await expect(tabelo.cell(2, 2)).toHaveAttribute("data-cell-type", "string");
	await expect(tabelo.cell(2, 1)).toHaveText("1");
});

test("a payload that no longer describes the table beside it is not believed", async ({
	tabelo,
}) => {
	await importTypedRows(tabelo);
	await tabelo.cell(1, 1).click();
	const copied = await tabelo.copyFlavours();

	await tabelo.cell(2, 1).click();
	// Tabelo's own metadata, beside a table it never wrote.
	await tabelo.paste(
		"9",
		copied.html.replace(
			/<table[\s\S]*<\/table>/,
			"<table><tbody><tr><td>9</td></tr></tbody></table>",
		),
	);

	await expect(tabelo.cell(2, 1)).toHaveText("9");
	await expect(tabelo.cell(2, 1)).toHaveAttribute("data-cell-type", "string");
});

test("an external application receives a table with no metadata in it", async ({
	page,
	tabelo,
}) => {
	await recordingClipboard(page);
	await page.reload();
	await tabelo.dismissWelcome();
	await importTypedRows(tabelo);
	await selectRange(tabelo, [1, 1], [1, 3]);

	await page.getByRole("gridcell").first().click({ button: "right" });
	await page.getByRole("menuitem", { name: copy.actions.copy }).click();
	await expect(
		tabelo.notice().filter({ hasText: copy.notices.copied("selection") }),
	).toBeVisible();

	const written = await lastCopied(page);
	expect(written?.html).toContain("tabelo:");
	// What a rich-text target renders is the table and nothing else: the payload
	// is a comment, so it has no text of its own.
	const rendered = await page.evaluate((html) => {
		const host = document.createElement("div");
		host.innerHTML = html ?? "";
		return host.textContent ?? "";
	}, written?.html);
	expect(rendered).not.toContain("tabelo");
	expect(rendered).toBe("1true");
});
