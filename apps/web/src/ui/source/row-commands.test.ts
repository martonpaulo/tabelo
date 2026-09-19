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
	resolveSourceRowMove,
	type SourceRowTarget,
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
