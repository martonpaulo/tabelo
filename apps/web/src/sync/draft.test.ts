// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import { createEmptyDocument } from "@/core/document";
import { createDefaultWorkspace } from "@/workspace/layout";
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
