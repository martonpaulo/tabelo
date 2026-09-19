// @vitest-environment happy-dom

import { EditorSelection, EditorState } from "@codemirror/state";
import { beforeEach, describe, expect, it } from "vitest";
import { cellText } from "@/core/cell-value";
import { documentFromMatrix, documentToMatrix } from "@/core/document";
import { samplePeopleMatrix, samplePerson } from "@/core/sample-data";
import { markdownCodec } from "@/formats/markdown";
import { textForView, useTabeloStore } from "@/state/store";
import {
	caretOffset,
	resolveSourceCommand,
	resolveSourceRowMove,
	type SourceRowTarget,
	type SourceStructureCommand,
} from "./row-commands";

const initialState = useTabeloStore.getInitialState();

beforeEach(() => {
	useTabeloStore.getState().discardDraft();
	useTabeloStore.setState(initialState, true);
	useTabeloStore
		.getState()
		.applyDocument(
			documentFromMatrix(samplePeopleMatrix(3), { headerRow: true }),
		);
});

function markdownTarget(): SourceRowTarget {
	const pane = useTabeloStore
		.getState()
		.workspace.panes.find((candidate) => candidate.view === "markdown");
	if (!pane) throw new Error("the default workspace has a Markdown pane");
	return { paneId: pane.id, viewId: "markdown", codec: markdownCodec };
}

function projection(): string {
	const shown = textForView(useTabeloStore.getState().document, "markdown");
	if (!shown.ok) throw new Error("the sample table projects to Markdown");
	return shown.text;
}

// An editor holding `text` with its caret just inside the first `marker`.
function editorAt(text: string, marker: string): EditorState {
	const offset = text.indexOf(marker);
	if (offset === -1) throw new Error(`missing marker ${marker}`);
	return EditorState.create({
		doc: text,
		selection: EditorSelection.cursor(offset + 1),
	});
}

function names(): string[] {
	return documentToMatrix(useTabeloStore.getState().document).map((row) =>
		cellText(row[0] ?? ""),
	);
}

describe("source row commands", () => {
	it("names the data row under the caret and where the caret follows it", () => {
		const text = projection();
		const move = resolveSourceRowMove(
			editorAt(text, samplePerson(1).city),
			markdownTarget(),
			-1,
		);
		expect(move).toEqual({
			ok: true,
			row: 1,
			caret: { row: 1, column: 1, distance: expect.any(Number) },
		});
	});

	it("moves the row as one history step and lands the caret in the same cell", () => {
		const text = projection();
		const target = markdownTarget();
		const move = resolveSourceRowMove(
			editorAt(text, samplePerson(1).city),
			target,
			-1,
		);
		if (!move.ok) throw new Error("expected a move");
		const before = useTabeloStore.getState().past.length;

		expect(useTabeloStore.getState().moveRowAt(move.row, -1)).toBeNull();
		expect(useTabeloStore.getState().past).toHaveLength(before + 1);
		expect(names()).toEqual([
			"name",
			samplePerson(1).name,
			samplePerson(0).name,
			samplePerson(2).name,
		]);

		const moved = projection();
		const parsed = markdownCodec.parse(moved);
		if (!parsed.ok) throw new Error("the projection parses");
		const caret = caretOffset(parsed.rows ?? [], move.caret);
		expect(caret).not.toBeNull();
		expect(moved.slice((caret ?? 0) - 1)).toMatch(
			new RegExp(`^${samplePerson(1).city}`),
		);

		useTabeloStore.getState().undo();
		expect(names()).toEqual([
			"name",
			samplePerson(0).name,
			samplePerson(1).name,
			samplePerson(2).name,
		]);
	});

	it.each([
		["the header row", "name", -1, "header-row"],
		["the first row upward", samplePerson(0).name, -1, "first-row"],
		["the last row downward", samplePerson(2).name, 1, "last-row"],
	] as const)("refuses to move %s", (_, marker, offset, refusal) => {
		const text = projection();
		expect(
			resolveSourceRowMove(editorAt(text, marker), markdownTarget(), offset),
		).toEqual({ ok: false, refusal });
	});

	it("reads a clean draft the pane owns, formatting and all", () => {
		const target = markdownTarget();
		const draft = [
			"|name|city|role|age|",
			"|-|-|-|-|",
			`|${samplePerson(0).name}|${samplePerson(0).city}|x|1|`,
			`|${samplePerson(1).name}|${samplePerson(1).city}|x|2|`,
			"",
			"a note after the table",
		].join("\n");
		useTabeloStore.getState().setDraft(target.paneId, "markdown", draft);
		expect(useTabeloStore.getState().draft?.status).toBe("clean");

		expect(
			resolveSourceRowMove(editorAt(draft, samplePerson(1).name), target, -1),
		).toMatchObject({ ok: true, row: 1 });
		expect(resolveSourceRowMove(editorAt(draft, "a note"), target, -1)).toEqual(
			{ ok: false, refusal: "outside-table" },
		);
	});

	it("refuses while the pane's draft does not parse, never using the last valid table", () => {
		const target = markdownTarget();
		const draft = `| name |\n| not a divider |\n| ${samplePerson(0).name} |`;
		useTabeloStore.getState().setDraft(target.paneId, "markdown", draft);

		expect(
			resolveSourceRowMove(editorAt(draft, samplePerson(0).name), target, -1),
		).toEqual({ ok: false, refusal: "unparsed" });
	});

	it("refuses text the document has not read yet", () => {
		const text = `${projection()}\n| ${samplePerson(3).name} | x | x | 1 |`;
		expect(
			resolveSourceRowMove(
				editorAt(text, samplePerson(3).name),
				markdownTarget(),
				-1,
			),
		).toEqual({ ok: false, refusal: "unparsed" });
	});
});

function headers(): string[] {
	return useTabeloStore
		.getState()
		.document.columns.map((column) => cellText(column.header));
}

// Runs one structural command with the caret just inside `marker`, and returns
// the text of the cell the caret lands in once the text is regenerated.
function command(marker: string, name: SourceStructureCommand): string {
	const plan = resolveSourceCommand(
		editorAt(projection(), marker),
		markdownTarget(),
		name,
	);
	if (!plan.ok) throw new Error(`refused: ${plan.refusal}`);
	const caret = plan.run();
	if (!caret) throw new Error("the command changed nothing");
	const text = projection();
	const parsed = markdownCodec.parse(text);
	if (!parsed.ok) throw new Error("the projection parses");
	const rows = parsed.rows ?? [];
	const offset = caretOffset(rows, caret);
	const row = rows[caret.row];
	const cell = caret.column === null ? row : row?.cells[caret.column];
	if (offset === null || !cell) throw new Error("the caret has no cell");
	expect(offset).toBeGreaterThanOrEqual(cell.from);
	expect(offset).toBeLessThanOrEqual(cell.to);
	return text.slice(cell.from, cell.to).trim();
}

function refusal(marker: string, name: SourceStructureCommand) {
	const plan = resolveSourceCommand(
		editorAt(projection(), marker),
		markdownTarget(),
		name,
	);
	return plan.ok ? null : plan.refusal;
}

describe("source structural commands", () => {
	const ingrid = samplePerson(0);
	const paulo = samplePerson(1);
	const mabel = samplePerson(2);

	it("moves a column as one history step, the caret staying in its cell", () => {
		const before = useTabeloStore.getState().past.length;
		expect(command(ingrid.city, "move-column-right")).toBe(ingrid.city);
		expect(headers()).toEqual(["name", "role", "city", "age"]);
		expect(useTabeloStore.getState().past).toHaveLength(before + 1);
		useTabeloStore.getState().undo();
		expect(headers()).toEqual(["name", "city", "role", "age"]);
		expect(refusal("name", "move-column-left")).toBe("first-column");
		expect(refusal("age", "move-column-right")).toBe("last-column");
	});

	it("inserts rows and columns beside the caret and lands in the new cell", () => {
		expect(command(paulo.name, "insert-row-above")).toBe("");
		expect(names()).toEqual(["name", ingrid.name, "", paulo.name, mabel.name]);
		expect(command("name", "insert-row-below")).toBe("");
		expect(names()[1]).toBe("");
		expect(command(ingrid.city, "insert-column-left")).toBe("");
		expect(headers()).toEqual(["name", "", "city", "role", "age"]);
		expect(command(ingrid.city, "insert-column-right")).toBe("");
		expect(headers()).toEqual(["name", "", "city", "", "role", "age"]);
	});

	it("keeps exactly one header row", () => {
		expect(refusal("name", "insert-row-above")).toBe("header-row");
		// Deleting the header promotes the first data row into it, one step.
		expect(command("city", "delete-row")).toBe(ingrid.city);
		expect(headers()).toEqual([
			ingrid.name,
			ingrid.city,
			ingrid.role,
			String(ingrid.age),
		]);
		expect(names()).toEqual([ingrid.name, paulo.name, mabel.name]);
		useTabeloStore.getState().undo();
		expect(headers()).toEqual(["name", "city", "role", "age"]);
	});

	it("deletes the row or column under the caret, landing in the one that takes its place", () => {
		expect(command(paulo.name, "delete-row")).toBe(mabel.name);
		expect(names()).toEqual(["name", ingrid.name, mabel.name]);
		expect(command(mabel.name, "delete-row")).toBe(ingrid.name);
		expect(refusal(ingrid.name, "delete-row")).toBe("last-remaining-row");
		expect(command("age", "delete-column")).toBe("role");
		expect(headers()).toEqual(["name", "city", "role"]);
	});

	it("sorts by the caret's column, the caret following its row", () => {
		expect(command(paulo.name, "sort-descending")).toBe(paulo.name);
		expect(names()).toEqual(["name", paulo.name, mabel.name, ingrid.name]);
		expect(command(paulo.name, "sort-ascending")).toBe(paulo.name);
		expect(names()).toEqual(["name", ingrid.name, mabel.name, paulo.name]);
		// Already in that order: nothing changes, and no caret is spent.
		const plan = resolveSourceCommand(
			editorAt(projection(), paulo.name),
			markdownTarget(),
			"sort-ascending",
		);
		expect(plan.ok && plan.run()).toBeNull();
	});

	it("refuses a column command off a cell, and what the grid refuses", () => {
		expect(refusal("---", "sort-ascending")).toBe("outside-cell");
		useTabeloStore
			.getState()
			.applyDocument(
				documentFromMatrix([["name"], [ingrid.name]], { headerRow: true }),
			);
		expect(refusal(ingrid.name, "sort-ascending")).toBe("sort-single-row");
		expect(refusal(ingrid.name, "delete-column")).toBe("last-remaining-column");
	});
});
