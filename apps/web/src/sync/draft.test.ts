// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import { createEmptyDocument, documentFromMatrix } from "@/core/document";
import { TABLE_LIMITS } from "@/core/table-limits";
import { listViews } from "@/views/registry";
import { canParse } from "@/views/types";
import { createDefaultWorkspace, type Workspace } from "@/workspace/layout";
import { type Draft, deriveDraft, readDraft, revealInvalid } from "./draft";

const workspace = createDefaultWorkspace();
const document = createEmptyDocument();
const invalidMarkdown = "| Name |\n| not a divider |\n| Ingrid |";
const validMarkdown = "| Name |\n| --- |\n| Ingrid |";

function markdownOwner(): Pick<Draft, "paneId" | "viewId"> {
	const pane = workspace.panes.find(
		(candidate) => candidate.view === "markdown",
	);
	if (!pane) throw new Error("the default workspace has no Markdown pane");
	return { paneId: pane.id, viewId: "markdown" };
}

function draftFor(
	owner: Pick<Draft, "paneId" | "viewId">,
	status: Draft["status"],
): Draft {
	return {
		...owner,
		text: invalidMarkdown,
		status,
		issues: [],
		warnings: [],
		rows: [],
	};
}

describe("draft buffer", () => {
	it("holds no draft for a pane that does not show the view", () => {
		const owner = { paneId: "missing", viewId: "markdown" } as const;
		expect(
			readDraft(null, document, workspace, owner, validMarkdown),
		).toBeNull();
	});

	it("starts, keeps, or skips the grace period by what came before", () => {
		const owner = markdownOwner();
		const read = (previous: Draft | null) =>
			readDraft(previous, document, workspace, owner, invalidMarkdown);

		const fresh = read(null);
		expect(fresh?.ok === false && fresh.grace).toBe("start");
		expect(fresh?.draft.status).toBe("invalid-grace");

		const inGrace = read(draftFor(owner, "invalid-grace"));
		expect(inGrace?.ok === false && inGrace.grace).toBe("keep");

		const visible = read(draftFor(owner, "invalid"));
		expect(visible?.ok === false && visible.grace).toBe("none");
		expect(visible?.draft.status).toBe("invalid");
	});

	it("names another pane's uncommitted draft as displaced", () => {
		const owner = markdownOwner();
		const other = draftFor({ paneId: "other", viewId: "csv" }, "invalid");
		const read = readDraft(other, document, workspace, owner, validMarkdown);
		expect(read?.ok).toBe(true);
		expect(read?.displacesInvalid).toBe(true);
		const clean = { ...other, status: "clean" as const };
		expect(
			readDraft(clean, document, workspace, owner, validMarkdown)
				?.displacesInvalid,
		).toBe(false);
	});

	it("reveals an error only for the draft whose grace period ran out", () => {
		const owner = markdownOwner();
		expect(revealInvalid(draftFor(owner, "invalid-grace"), owner)?.status).toBe(
			"invalid",
		);
		expect(revealInvalid(draftFor(owner, "clean"), owner)).toBeNull();
		expect(
			revealInvalid(draftFor(owner, "invalid-grace"), {
				paneId: "other",
				viewId: "markdown",
			}),
		).toBeNull();
	});

	it("recomputes a restored draft's status from its text", () => {
		const owner = markdownOwner();
		const restored = deriveDraft(
			{ ...owner, text: invalidMarkdown },
			workspace,
		);
		expect(restored?.status).toBe("invalid");
		expect(
			deriveDraft({ ...owner, paneId: "missing", text: "" }, workspace),
		).toBeNull();
	});
});

// Every source view parses its own pane's text through the same limited read,
// so the size limits are judged once for all of them (#418). Driven from the
// registry, so a format added later is covered because it was registered.
// #484: a pane's text is read in the spelling it is written in, and the
// reconciliation it returns is the one the timeline compares with.
describe("reading a draft in the pane's spelling", () => {
	const team = documentFromMatrix(
		[
			["name", "remote"],
			["Ingrid", true],
		],
		{ headerRow: true },
	);
	const cellOf = (read: ReturnType<typeof readDraft>) => {
		if (!read?.ok) throw new Error("the draft must parse");
		const [row] = read.document.rows;
		const column = read.document.columns[1];
		if (!row || !column) throw new Error("the cell must exist");
		return row.cells[column.id];
	};

	it("keeps a boolean whose token did not change", () => {
		const text = "| name   | remote |\n| --- | --- |\n| Ingrid | [x] |";
		const read = readDraft(null, team, workspace, markdownOwner(), text, {
			booleanMarks: true,
		});
		expect(read?.ok && read.document).toBe(team);
		expect(read?.ok && read.reconciliation.spelledBooleans).toBeTruthy();
	});

	it("keeps an edited token, and every token read without the spelling, as text", () => {
		const edited = "| name   | remote |\n| --- | --- |\n| Ingrid | [ ] |";
		expect(
			cellOf(
				readDraft(null, team, workspace, markdownOwner(), edited, {
					booleanMarks: true,
				}),
			),
		).toBe("[ ]");
		const unchanged = "| name   | remote |\n| --- | --- |\n| Ingrid | [x] |";
		const plain = readDraft(null, team, workspace, markdownOwner(), unchanged);
		expect(cellOf(plain)).toBe("[x]");
		expect(plain?.ok && plain.reconciliation.spelledBooleans).toBeUndefined();
	});
});

describe("draft size limits", () => {
	// A table of `rows` data rows and `columns` columns, header included, in
	// the format the view writes. Values are positions, not people.
	function sourceText(
		codec: NonNullable<ReturnType<typeof listViews>[number]["codec"]>,
		rows: number,
		columns: number,
	): string {
		const header = Array.from({ length: columns }, (_, column) => `c${column}`);
		const body = Array.from({ length: rows }, (_, row) =>
			Array.from({ length: columns }, (_, column) => `${row}.${column}`),
		);
		return codec.serialize(
			documentFromMatrix([header, ...body], { headerRow: true }),
		);
	}

	function soleView(viewId: Workspace["panes"][number]["view"]): Workspace {
		const [pane] = workspace.panes;
		if (!pane) throw new Error("the default workspace has no pane");
		return { ...workspace, panes: [{ ...pane, view: viewId }] };
	}

	const sources = listViews().filter(canParse);

	it.each(sources.map((view) => [view.id, view] as const))(
		"%s accepts the limits and holds a draft one step past them",
		(_, view) => {
			const codec = view.codec;
			if (!codec) throw new Error(`${view.id} parses without a codec`);
			const owner = { paneId: workspace.panes[0]?.id ?? "", viewId: view.id };
			const space = soleView(view.id);
			const read = (text: string) =>
				readDraft(null, document, space, owner, text);

			const atRows = read(sourceText(codec, TABLE_LIMITS.rows, 2));
			expect(atRows?.ok && atRows.document.rows).toHaveLength(
				TABLE_LIMITS.rows,
			);

			const pastRows = sourceText(codec, TABLE_LIMITS.rows + 1, 2);
			const refused = read(pastRows);
			expect(refused?.ok).toBe(false);
			// The text stays the draft, so the user can edit it back under the
			// limit, and the document every other pane shows is not replaced.
			expect(refused?.draft.text).toBe(pastRows);
			expect(refused?.draft.issues).toEqual([
				{
					code: "table-too-large",
					exceeded: {
						code: "too-many-rows",
						actual: TABLE_LIMITS.rows + 1,
						limit: TABLE_LIMITS.rows,
					},
				},
			]);
			expect(deriveDraft({ ...owner, text: pastRows }, space)?.status).toBe(
				"invalid",
			);

			const pastColumns = read(sourceText(codec, 1, TABLE_LIMITS.columns + 1));
			expect(pastColumns?.ok === false && pastColumns.draft.issues).toEqual([
				{
					code: "table-too-large",
					exceeded: {
						code: "too-many-columns",
						actual: TABLE_LIMITS.columns + 1,
						limit: TABLE_LIMITS.columns,
					},
				},
			]);
		},
	);

	// The widest row is the column count, read before any row is padded, so
	// one long row in a short table is enough to refuse it.
	it("judges a ragged draft by its widest row", () => {
		const owner = markdownOwner();
		const wide = Array.from(
			{ length: TABLE_LIMITS.columns + 1 },
			(_, column) => `${column}`,
		).join(" | ");
		const text = `| a |\n| --- |\n| ${wide} |`;
		const result = readDraft(null, document, workspace, owner, text);
		expect(result?.ok === false && result.draft.issues[0]?.code).toBe(
			"table-too-large",
		);
	});
});
