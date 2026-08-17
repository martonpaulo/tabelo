import type { Locator } from "@playwright/test";
import {
	CURRENT_VERSION,
	type PersistedState,
	STORAGE_KEY,
} from "@/persistence/schema";
import { expect, test } from "./fixtures";
import type { TabeloPage } from "./helpers";

const invalidMarkdown =
	"| Name | Role |\n| not a divider |\n| Ingrid | Designer |";
const validMarkdown =
	"| Name | Role |\n| --- | --- |\n| Immediate | Designer |";

const typedSourceState = {
	version: CURRENT_VERSION,
	document: {
		columns: [
			{
				id: "c-name",
				header: "Name",
				align: "left",
				expectedType: "text",
			},
			{
				id: "c-age",
				header: "Age",
				align: "right",
				expectedType: "number",
			},
			{
				id: "c-active",
				header: "Active",
				align: "center",
				expectedType: "boolean",
			},
			{
				id: "c-notes",
				header: "Notes",
				align: "default",
				expectedType: "text",
			},
		],
		rows: [
			{
				id: "r-ingrid",
				cells: {
					"c-name": "Ingrid",
					"c-age": 34,
					"c-active": true,
					"c-notes": null,
				},
			},
			{
				id: "r-paulo",
				cells: {
					"c-name": "Paulo",
					"c-age": 29,
					"c-active": false,
					"c-notes": "",
				},
			},
		],
	},
	workspace: {
		layout: "columns",
		panes: [
			{
				id: "ac",
				view: "grid",
				slots: ["a", "c"],
				zoom: 1,
				wrap: false,
			},
			{
				id: "bd",
				view: "markdown",
				slots: ["b", "d"],
				zoom: 1,
				wrap: false,
			},
		],
		wrappedColumns: [],
		columnWidths: {},
		columnRatio: 0.5,
		rowRatio: 0.5,
		activePaneId: "bd",
	},
	draft: null,
} satisfies PersistedState;

async function seedTypedSource(tabelo: TabeloPage): Promise<void> {
	await tabelo.page.addInitScript(
		({ key, value }) => {
			localStorage.setItem(key, JSON.stringify(value));
		},
		{ key: STORAGE_KEY, value: typedSourceState },
	);
	await tabelo.page.reload();
	await tabelo.workspace.waitFor({ state: "visible" });
}

async function sourceText(editor: Locator): Promise<string> {
	return editor.evaluate((element) =>
		Array.from(
			element.querySelectorAll(".cm-line"),
			(line) => line.textContent ?? "",
		).join("\n"),
	);
}

async function expectTypedCellsPersisted(tabelo: TabeloPage): Promise<void> {
	await expect
		.poll(() =>
			tabelo.page.evaluate((key) => {
				const saved = JSON.parse(localStorage.getItem(key) ?? "null");
				return {
					values: saved?.document?.rows?.[0]?.cells,
					expectedTypes: saved?.document?.columns?.map(
						(column: { expectedType?: string }) => column.expectedType,
					),
					alignments: saved?.document?.columns?.map(
						(column: { align?: string }) => column.align,
					),
				};
			}, STORAGE_KEY),
		)
		.toEqual({
			values: {
				"c-name": "Mabel",
				"c-age": 34,
				"c-active": true,
				"c-notes": null,
			},
			expectedTypes: ["text", "number", "boolean", "text"],
			alignments: ["left", "right", "center", "default"],
		});
}

async function editUnrelatedTextCell(
	tabelo: TabeloPage,
	view: "markdown" | "csv",
): Promise<void> {
	const editor = tabelo.source(view);
	const before = await sourceText(editor);
	await editor.fill(before.replace("Ingrid", "Mabel"));
	await expect(tabelo.cell(1, 1)).toHaveText("Mabel");
	await expectTypedCellsPersisted(tabelo);
}

async function editorSnapshot(editor: Locator) {
	return editor.evaluate((element) => {
		const selection = element.ownerDocument.getSelection();
		if (!selection?.anchorNode) return null;
		const range = element.ownerDocument.createRange();
		range.selectNodeContents(element);
		range.setEnd(selection.anchorNode, selection.anchorOffset);
		const scroller = element
			.closest(".cm-editor")
			?.querySelector<HTMLElement>(".cm-scroller");
		return {
			offset: range.toString().length,
			scrollTop: scroller?.scrollTop ?? 0,
		};
	});
}

test("valid source edits synchronize without a pending healthy status", async ({
	tabelo,
}) => {
	await tabelo.source("markdown").fill(validMarkdown);

	await expect(tabelo.cell(1, 1)).toHaveText("Immediate");
	await expect(tabelo.pane("markdown").getByRole("status")).toHaveCount(1);
});

test("transient invalid source stays quiet and keeps the last valid table", async ({
	tabelo,
}) => {
	await tabelo.source("markdown").fill(invalidMarkdown);
	await expect(tabelo.pane("markdown").getByRole("status")).toHaveCount(1);
	await expect(tabelo.cell(1, 1)).toHaveText("");

	await tabelo.source("markdown").fill(validMarkdown);
	await expect(tabelo.cell(1, 1)).toHaveText("Immediate");
	await expect(tabelo.pane("markdown").getByRole("status")).toHaveCount(1);
});

test("persistent invalid source is underlined while the grid stays valid", async ({
	tabelo,
}) => {
	await tabelo.source("markdown").fill(invalidMarkdown);

	await expect(
		tabelo.pane("markdown").locator(".cm-diagnosticError"),
	).toHaveCount(1);
	await expect(tabelo.cell(1, 1)).toHaveText("");
});

test("source cursor and local undo survive a 200-row synchronization", async ({
	tabelo,
}) => {
	const source = [
		"| Name |",
		"| --- |",
		...Array.from({ length: 200 }, (_, index) => `| Value ${index} |`),
	].join("\n");
	const editor = tabelo.source("markdown");

	await editor.fill(source);
	await expect(tabelo.grid()).toHaveAttribute("aria-rowcount", "201");
	await expect(editor).toBeFocused();

	await editor.press("End");
	await editor.press("ArrowLeft");
	await editor.press("ArrowLeft");
	const beforeInsert = await editorSnapshot(editor);
	await editor.press("X");
	await expect(tabelo.cell(200, 1)).toHaveText("Value 199X");
	await expect(editor).toBeFocused();
	const afterInsert = await editorSnapshot(editor);
	expect(afterInsert?.offset).toBe((beforeInsert?.offset ?? 0) + 1);
	expect(afterInsert?.scrollTop).toBe(beforeInsert?.scrollTop);

	await editor.press("ControlOrMeta+z");
	await expect(tabelo.cell(200, 1)).toHaveText("Value 199");
	await expect(editor).toBeFocused();
	const afterUndo = await editorSnapshot(editor);
	expect(afterUndo).toEqual(beforeInsert);
});

test("Markdown edits preserve unrelated native values and column metadata", async ({
	tabelo,
}) => {
	await seedTypedSource(tabelo);
	await editUnrelatedTextCell(tabelo, "markdown");
});

test("CSV edits preserve unrelated native values and column metadata", async ({
	tabelo,
}) => {
	await seedTypedSource(tabelo);
	await tabelo.choosePaneView("markdown", "csv");
	await editUnrelatedTextCell(tabelo, "csv");
});
