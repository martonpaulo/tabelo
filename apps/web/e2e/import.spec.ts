import { copy } from "@/copy/copy";
import { IMPORT_LIMITS } from "@/import/prepare";
import { getView } from "@/views/registry";
import type { ViewId } from "@/views/types";
import { expect, test } from "./fixtures";
import type { TabeloPage } from "./helpers";

test("a malformed named file preserves the current table", async ({
	tabelo,
}) => {
	await tabelo.editCell(1, 1, "keep me");
	await tabelo.importFile(
		"broken.csv",
		'Name,Note\nIngrid,"unterminated',
		"text/csv",
	);

	await expect(tabelo.cell(1, 1)).toHaveText("keep me");
	// The refusal is reported as a failure. Its wording is editorial and is
	// deliberately not asserted here.
	await expect(tabelo.notice("error")).toBeVisible();
});

test("a typed JSON import preserves native scalars through an edit and projection", async ({
	tabelo,
}) => {
	await tabelo.importFile(
		"typed.json",
		'[{"qty":1,"ok":true,"note":null,"name":"x","code":"007"}]',
		"application/json",
	);

	await expect(tabelo.cell(1, 1).locator("[data-cell-value]")).toContainText(
		"1",
	);
	await expect(tabelo.cell(1, 2).locator("[data-cell-value]")).toContainText(
		"true",
	);
	await expect(tabelo.cell(1, 3)).toHaveAccessibleName(/null/i);
	await expect(tabelo.cell(1, 5)).toHaveText("007");
	await tabelo.editCell(1, 4, "edited");
	// The import already opened JSON beside the grid, so the pane is in place.
	await expect(tabelo.pane("json")).toBeVisible();

	const source = tabelo.source("json");
	await expect(source).toContainText('"qty":1');
	await expect(source).toContainText('"ok":true');
	await expect(source).toContainText('"note":null');
	await expect(source).toContainText('"name":"edited"');
	await expect(source).toContainText('"code":"007"');
});

test("a JSON file with nested cells preserves the current table", async ({
	tabelo,
}) => {
	await tabelo.editCell(1, 1, "keep me");
	await tabelo.importFile(
		"nested.json",
		'[{"person":{"name":"Ingrid"}}]',
		"application/json",
	);

	await expect(tabelo.cell(1, 1)).toHaveText("keep me");
	await expect(tabelo.notice("error")).toBeVisible();
});

test("an oversized paste is rejected without changing the table", async ({
	tabelo,
}) => {
	await tabelo.editCell(1, 1, "keep me");
	const oversized = Array.from({ length: 501 }, (_, index) => `${index}`).join(
		"\n",
	);
	await tabelo.paste(oversized);

	await expect(tabelo.cell(1, 1)).toHaveText("keep me");
	await expect(tabelo.notice("error")).toBeVisible();
});

test("an oversized named file uses the same rejection policy", async ({
	tabelo,
}) => {
	await tabelo.editCell(1, 1, "keep me");
	const oversized = Array.from(
		{ length: 501 },
		(_, index) => `${index},value`,
	).join("\n");
	await tabelo.importFile("oversized.csv", oversized, "text/csv");

	await expect(tabelo.cell(1, 1)).toHaveText("keep me");
	await expect(tabelo.notice("error")).toBeVisible();
});

test("an oversized file is rejected before its contents are read", async ({
	page,
	tabelo,
}) => {
	await page.addInitScript(() => {
		Object.defineProperty(window, "__fileTextReads", {
			value: 0,
			writable: true,
		});
		const original = File.prototype.text;
		File.prototype.text = function () {
			(window as unknown as { __fileTextReads: number }).__fileTextReads += 1;
			return original.call(this);
		};
	});
	await page.reload();
	await tabelo.dismissWelcome();
	await tabelo.editCell(1, 1, "keep me");

	await tabelo.importFile(
		"oversized.csv",
		"x".repeat(IMPORT_LIMITS.payloadBytes + 1),
		"text/csv",
	);

	await expect(tabelo.cell(1, 1)).toHaveText("keep me");
	await expect(tabelo.notice("error")).toBeVisible();
	expect(
		await page.evaluate(
			() => (window as unknown as { __fileTextReads: number }).__fileTextReads,
		),
	).toBe(0);
});

test("repeated paste is rejected when the resulting table exceeds the limit", async ({
	tabelo,
}) => {
	const atLimit = Array.from({ length: IMPORT_LIMITS.rows }, (_, index) =>
		String(index),
	).join("\n");
	await tabelo.paste(atLimit, undefined, false);
	await tabelo.cell(IMPORT_LIMITS.rows, 1).click();

	await tabelo.paste("keep\nrefuse");

	await expect(tabelo.cell(IMPORT_LIMITS.rows, 1)).toHaveText(
		String(IMPORT_LIMITS.rows - 1),
	);
	await expect(tabelo.notice("error")).toBeVisible();
	await expect(tabelo.cell(IMPORT_LIMITS.rows + 1, 1)).toHaveCount(0);
});

test("cancelling the file picker leaves the current table unchanged", async ({
	tabelo,
}) => {
	await tabelo.editCell(1, 1, "keep me");
	await tabelo.cancelFileImport();

	await expect(tabelo.cell(1, 1)).toHaveText("keep me");
});

// The first content a session receives decides what the workspace opens as:
// the format it arrived in, beside the visual table it became. Reading order
// is the assertion rather than geometry, so it holds at every width.

async function paneLabels(tabelo: TabeloPage): Promise<(string | null)[]> {
	return tabelo
		.panes()
		.evaluateAll((panes) =>
			panes.map((pane) => pane.getAttribute("aria-label")),
		);
}

function paneLabel(view: ViewId): string {
	return copy.a11y.pane(getView(view).label);
}

test("a first Jira paste opens the Jira source before the grid", async ({
	tabelo,
}) => {
	await tabelo.paste("||Name||City||\n|Ingrid|Rio|");

	expect(await paneLabels(tabelo)).toEqual([
		paneLabel("jira"),
		paneLabel("grid"),
	]);
	await expect(tabelo.source("jira")).toContainText("Ingrid");
	await expect(tabelo.cell(1, 1)).toHaveText("Ingrid");
});

test("a first CSV import opens the CSV source once the header is answered", async ({
	page,
	tabelo,
}) => {
	await tabelo.importFile("people.csv", "Name,City\nIngrid,Rio", "text/csv");

	// Nothing moves while the question is open, which the store contract covers:
	// the document does not exist until it is answered.
	await page
		.getByRole("dialog", { name: copy.headerImport.title })
		.getByRole("button", { name: copy.headerImport.asHeaders })
		.click();

	expect(await paneLabels(tabelo)).toEqual([
		paneLabel("csv"),
		paneLabel("grid"),
	]);
	await expect(tabelo.header(1)).toHaveText("Name");
});

test("a spreadsheet paste opens the TSV source and focuses the table", async ({
	page,
	tabelo,
}) => {
	// A genuine first visit, where the welcome surface owns focus.
	await tabelo.runAppCommand("newTable");
	const welcome = page.getByRole("region", { name: copy.empty.title });
	await expect(welcome).toBeVisible();

	await page.evaluate(() => {
		const data = new DataTransfer();
		data.setData("text/plain", "Name\tCity\nIngrid\tRio");
		const event = new Event("paste", { bubbles: true, cancelable: true });
		Object.defineProperty(event, "clipboardData", { value: data });
		window.dispatchEvent(event);
	});
	await page
		.getByRole("dialog", { name: copy.headerImport.title })
		.getByRole("button", { name: copy.headerImport.asHeaders })
		.click();

	expect(await paneLabels(tabelo)).toEqual([
		paneLabel("tsv"),
		paneLabel("grid"),
	]);
	// The surface that owned focus is gone, so focus is placed rather than lost.
	await expect(tabelo.pane("grid")).toBeFocused();
});

test("plain text keeps the default arrangement", async ({ tabelo }) => {
	// No format claims it, so there is no source view to open beside the table.
	await tabelo.paste("Ingrid\nPaulo", undefined, false);

	expect(await paneLabels(tabelo)).toEqual([
		paneLabel("grid"),
		paneLabel("markdown"),
	]);
	await expect(tabelo.cell(1, 1)).toHaveText("Ingrid");
});

test("a paste into an existing table leaves the arrangement alone", async ({
	tabelo,
}) => {
	await tabelo.editCell(1, 1, "keep me");
	await tabelo.cell(1, 1).click();

	await tabelo.paste("||Name||City||\n|Ingrid|Rio|");

	expect(await paneLabels(tabelo)).toEqual([
		paneLabel("grid"),
		paneLabel("markdown"),
	]);
});

test("the opening arrangement is saved like any other", async ({
	page,
	tabelo,
}) => {
	await tabelo.paste("||Name||City||\n|Ingrid|Rio|");
	expect(await paneLabels(tabelo)).toEqual([
		paneLabel("jira"),
		paneLabel("grid"),
	]);

	await page.reload();
	await tabelo.workspace.waitFor({ state: "visible" });

	expect(await paneLabels(tabelo)).toEqual([
		paneLabel("jira"),
		paneLabel("grid"),
	]);
});
