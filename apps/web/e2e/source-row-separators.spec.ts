import { copy } from "@/copy/copy";
import { expect, test } from "./fixtures";

// Boundaries between semantic table rows in a source view (#296). What is
// counted is which text lines carry a boundary: a row's last line does, every
// other line does not, and the last row has none. The class is the technical
// contract; the stroke itself is painted by the theme.
const BOUNDARY = ".cm-line.cm-tabeloRowEnd";

test("Markdown draws one boundary per row gap, and the divider belongs to the header", async ({
	tabelo,
}) => {
	const source = tabelo.source("markdown");
	await source.fill(
		[
			"| name | city |",
			"| --- | --- |",
			"| Ingrid | Rio |",
			"| Paulo | Madrid |",
		].join("\n"),
	);
	await expect(tabelo.cell(2, 1)).toHaveText("Paulo");
	const boundaries = tabelo.pane("markdown").locator(BOUNDARY);
	// Header block and two body rows: two gaps.
	await expect(boundaries).toHaveCount(2);
	await expect(boundaries.first()).toContainText("---");
});

test("a CSV row with a quoted line break is one row, bounded after its last line", async ({
	tabelo,
}) => {
	await tabelo.choosePaneView("markdown", "csv");
	const source = tabelo.source("csv");
	await source.fill('name,note\nIngrid,"first line\nsecond line"\nPaulo,short');
	await expect(tabelo.cell(2, 1)).toHaveText("Paulo");
	const boundaries = tabelo.pane("csv").locator(BOUNDARY);
	await expect(boundaries).toHaveCount(2);
	await expect(boundaries.nth(1)).toContainText("second line");
	await expect(
		tabelo.pane("csv").locator(".cm-line", { hasText: "first line" }),
	).not.toHaveClass(/cm-tabeloRowEnd/);
});

test("an invalid draft shows no boundaries until it parses again", async ({
	tabelo,
}) => {
	const source = tabelo.source("markdown");
	const valid = ["| name |", "| --- |", "| Ingrid |", "| Paulo |"].join("\n");
	await source.fill(valid);
	const boundaries = tabelo.pane("markdown").locator(BOUNDARY);
	await expect(boundaries).toHaveCount(2);

	// No divider: not a table, so no structure is claimed at all.
	await source.fill(["| name |", "| Ingrid |", "| Paulo |"].join("\n"));
	await expect(boundaries).toHaveCount(0);

	await source.fill(valid);
	await expect(boundaries).toHaveCount(2);
});

test("wrapping a long row adds no boundary of its own", async ({
	page,
	tabelo,
}) => {
	const long =
		"A long note that certainly wraps across several visual lines in a narrow pane ".repeat(
			3,
		);
	const source = tabelo.source("markdown");
	await source.fill(
		["| note |", "| --- |", `| ${long} |`, "| short |"].join("\n"),
	);
	const menu = await tabelo.openPaneMenu("markdown");
	await menu
		.getByRole("menuitemcheckbox", { name: copy.workspace.wrapSource })
		.click();
	await page.keyboard.press("Escape");
	await expect(tabelo.pane("markdown").locator(BOUNDARY)).toHaveCount(2);
});

// HTML, Records, and JSON have no reliable row boundary, so they claim none.
test("a format that cannot map its rows draws no boundaries", async ({
	tabelo,
}) => {
	await tabelo.editCell(1, 1, "Ingrid");
	await tabelo.editCell(2, 1, "Paulo");
	await tabelo.choosePaneView("markdown", "json");
	await expect(tabelo.source("json")).toBeVisible();
	await expect(tabelo.pane("json").locator(BOUNDARY)).toHaveCount(0);
});
