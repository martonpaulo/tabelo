import { copy } from "@/copy/copy";
import { STORAGE_KEY } from "@/persistence/schema";
import { PERSISTED_VERSION } from "@/persistence/versions";
import { expect, test } from "./fixtures";
import { TabeloPage } from "./helpers";

async function importTypedRow(tabelo: TabeloPage) {
	await tabelo.importFile(
		"typed.json",
		'[{"qty":1,"ok":true,"note":null,"code":"1"}]',
		"application/json",
	);
}

test("the grid exposes real and expected types without replacing cell names", async ({
	page,
	tabelo,
}) => {
	await importTypedRow(tabelo);

	const numberCell = tabelo.cell(1, 1);
	const booleanCell = tabelo.cell(1, 2);
	const nullCell = tabelo.cell(1, 3);
	const stringCell = tabelo.cell(1, 4);

	await expect(numberCell).toHaveAttribute("data-cell-type", "number");
	await expect(booleanCell).toHaveAttribute("data-cell-type", "boolean");
	await expect(nullCell).toHaveAttribute("data-cell-type", "null");
	await expect(stringCell).toHaveAttribute("data-cell-type", "string");
	await expect(numberCell).toHaveAttribute("data-cell-type-divergent", "true");
	await expect(stringCell).not.toHaveAttribute("data-cell-type-divergent");

	for (const [cell, type] of [
		[numberCell, "number"],
		[booleanCell, "boolean"],
		[nullCell, "null"],
	] as const) {
		await expect(
			cell.locator(`[data-cell-type-mark="${type}"] svg`),
		).toBeVisible();
	}
	await expect(
		stringCell.locator('[data-cell-type-mark-context="cell"]'),
	).toHaveCount(0);

	for (const cell of [numberCell, booleanCell, nullCell]) {
		await expect(cell).not.toHaveAttribute("aria-label");
	}
	await expect(numberCell).toHaveAccessibleName(/number/i);
	await expect(booleanCell).toHaveAccessibleName(/boolean/i);
	await expect(nullCell).toHaveAccessibleName(/null/i);
	await expect(stringCell).toHaveAccessibleName("1");

	const [numberFont, booleanFont, nullFont, stringFont] = await Promise.all([
		numberCell
			.locator("[data-cell-value]")
			.evaluate((element) => getComputedStyle(element).fontFamily),
		booleanCell
			.locator("[data-cell-value]")
			.evaluate((element) => getComputedStyle(element).fontFamily),
		nullCell
			.locator("[data-cell-value]")
			.evaluate((element) => getComputedStyle(element).fontFamily),
		stringCell
			.locator("[data-cell-value]")
			.evaluate((element) => getComputedStyle(element).fontFamily),
	]);
	expect(booleanFont).toBe(numberFont);
	expect(nullFont).toBe(numberFont);
	expect(numberFont).not.toBe(stringFont);
	await expect(numberCell).toHaveCSS("text-align", "left");

	const presentationOf = (cell: typeof numberCell) =>
		cell.locator("[data-cell-value]").evaluate((element) => {
			const style = getComputedStyle(element);
			return {
				color: style.color,
				fontStyle: style.fontStyle,
				fontWeight: Number.parseInt(style.fontWeight, 10),
			};
		});
	const presentations = await Promise.all([
		presentationOf(numberCell),
		presentationOf(booleanCell),
		presentationOf(nullCell),
		presentationOf(stringCell),
	]);
	const headerColor = await tabelo
		.header(1)
		.locator("[data-column-content]")
		.evaluate((element) => getComputedStyle(element).color);
	const [
		numberPresentation,
		booleanPresentation,
		nullPresentation,
		stringPresentation,
	] = presentations;
	expect(stringPresentation.color).toBe(headerColor);
	expect(new Set(presentations.map(({ color }) => color)).size).toBe(4);
	// Weight is kept for the header and a selected axis label: a typed value
	// is told apart by its colour and typeface, at the string weight
	// (owner, 2026-09-19).
	expect(numberPresentation.fontWeight).toBe(stringPresentation.fontWeight);
	expect(booleanPresentation.fontWeight).toBe(stringPresentation.fontWeight);
	expect(booleanPresentation.fontStyle).toBe("normal");
	expect(nullPresentation.fontStyle).toBe("italic");

	await numberCell.click();
	await expect(numberCell).toHaveAttribute("aria-selected", "true");
	// Focus is drawn as a mark on the cell's edges (#365), whatever its type.
	await expect(numberCell.locator("[data-focus-mark]")).toHaveCount(1);

	const columnIndex = tabelo.columnIndex(1);
	await expect(columnIndex).toHaveAttribute("data-expected-type", "text");
	await expect(
		columnIndex.locator('[data-cell-type-mark="string"] svg'),
	).toBeVisible();
	const selectColumn = columnIndex.getByRole("button", {
		name: /select column: qty, expected type text/i,
	});
	await selectColumn.focus();
	await expect(selectColumn).toBeFocused();

	// The column's menu from the keyboard, on the letter that holds focus.
	await page.keyboard.press("Shift+F10");
	await expect(
		page.getByRole("menu", {
			name: /column actions: qty, expected type text/i,
		}),
	).toBeVisible();
	await page.keyboard.press("Escape");

	await numberCell.dblclick();
	const editor = tabelo.grid().getByRole("textbox");
	await expect(editor).toHaveAccessibleName(/number/i);
	expect(
		await editor.evaluate((element) => getComputedStyle(element).fontFamily),
	).toBe(numberFont);
	await page.keyboard.press("Escape");
	await expect(numberCell).toHaveAttribute("data-cell-type", "number");
});

test("a mixed column distinguishes real type from its number expectation", async ({
	page,
}) => {
	await page.addInitScript(
		({ key, state }) => localStorage.setItem(key, JSON.stringify(state)),
		{
			key: STORAGE_KEY,
			state: {
				version: PERSISTED_VERSION,
				name: "Typed values",
				document: {
					columns: [
						{
							id: "c-value",
							header: "value",
							align: "center",
							expectedType: "number",
						},
					],
					rows: [
						{ id: "r-number", cells: { "c-value": 7 } },
						{ id: "r-string", cells: { "c-value": "7" } },
					],
				},
				workspace: {
					layout: "single",
					pinFirstDataRow: false,
					pinFirstDataColumn: false,
					panes: [
						{
							id: "abcd",
							view: "grid",
							slots: ["a", "b", "c", "d"],
							zoom: 1,
							wrap: false,
						},
					],
					wrappedColumns: [],
					columnWidths: {},
					columnRatio: 0.5,
					rowRatio: 0.5,
					activePaneId: "abcd",
				},
				draft: null,
			},
		},
	);

	const tabelo = new TabeloPage(page);
	await page.goto("/");
	await tabelo.workspace.waitFor({ state: "visible" });

	const numberCell = tabelo.cell(1, 1);
	const stringCell = tabelo.cell(2, 1);
	await expect(numberCell).not.toHaveAttribute("data-cell-type-divergent");
	await expect(
		numberCell.locator('[data-cell-type-mark-context="cell"]'),
	).toHaveCount(0);
	await expect(stringCell).toHaveAttribute("data-cell-type-divergent", "true");
	await expect(
		stringCell.locator('[data-cell-type-mark="string"] svg'),
	).toBeVisible();
	await expect(numberCell).toHaveCSS("text-align", "center");
	await expect(stringCell).toHaveCSS("text-align", "center");
	await expect(numberCell).toHaveAccessibleName(/number/i);
	await expect(stringCell).toHaveAccessibleName(/string/i);

	const columnIndex = tabelo.columnIndex(1);
	await expect(columnIndex).toHaveAttribute("data-expected-type", "number");
	await expect(
		columnIndex.locator('[data-cell-type-mark="number"] svg'),
	).toBeVisible();
	await expect(
		columnIndex.getByRole("button", {
			name: /select column: value, expected type number/i,
		}),
	).toBeVisible();
});

test("type marks remain legible under forced colours, zoom, and wrapping", async ({
	browserName,
	page,
	tabelo,
}) => {
	await importTypedRow(tabelo);
	const cell = tabelo.cell(1, 1);
	const mark = cell.locator('[data-cell-type-mark="number"]');
	await expect(mark).toBeVisible();
	expect(
		await mark.evaluate((element) => getComputedStyle(element).color),
	).not.toBe("rgba(0, 0, 0, 0)");

	// The symbol follows the pane's zoom: a direction, never a size.
	const symbolWidth = () =>
		mark
			.locator("svg")
			.evaluate((element) => element.getBoundingClientRect().width);
	const sizeBeforeZoom = await symbolWidth();
	await cell.click();
	const paneMenu = page.getByRole("menu", {
		name: `${copy.workspace.paneActions}: ${copy.views.grid.label}`,
	});
	await tabelo.runPaneCommand("grid", "zoomIn");
	await page.keyboard.press("Escape");
	await paneMenu.waitFor({ state: "hidden" });
	await expect.poll(symbolWidth).toBeGreaterThan(sizeBeforeZoom);

	await tabelo.columnIndex(1).click({ button: "right" });
	const menu = page.getByRole("menu", {
		name: /column actions: qty, expected type text/i,
	});
	await menu.getByRole("menuitemcheckbox", { name: /wrap text/i }).click();
	await page.keyboard.press("Escape");
	await menu.waitFor({ state: "hidden" });
	await expect(mark).toBeVisible();
	await expect(cell).toHaveAccessibleName(/number/i);

	if (browserName === "chromium") {
		await page.emulateMedia({ forcedColors: "active" });
		await expect(mark).toBeVisible();
		await expect(cell).toHaveAccessibleName(/number/i);
		expect(
			await mark.evaluate((element) => getComputedStyle(element).color),
		).not.toBe("rgba(0, 0, 0, 0)");
	}
});
