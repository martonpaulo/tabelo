// @vitest-environment happy-dom

import { AGENT_LIMITS, encodedBytes } from "@tabelo/agent-protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { documentFromMatrix } from "@/core/document";
import { useTabeloStore } from "@/state/store";
import { listViews } from "@/views/registry";
import { AgentSession } from "./session";

let session: AgentSession;
const initial = useTabeloStore.getInitialState();
beforeEach(() => {
	localStorage.clear();
	useTabeloStore.setState(
		{
			...initial,
			document: documentFromMatrix([["Name"], ["Ingrid"], ["Paulo"]], {
				headerRow: true,
			}),
		},
		true,
	);
	session = new AgentSession({ id: "test-session" });
});
afterEach(() => {
	session.close();
	vi.restoreAllMocks();
});
function read(includeWorkspace = false) {
	const outcome = session.execute(
		{ tool: "tabelo_read", args: { sessionId: session.id, includeWorkspace } },
		1,
		Date.now() + 1000,
	);
	if (!outcome.ok || !outcome.data) throw new Error("read failed");
	return outcome.data;
}
function command(requestId = "first") {
	return {
		tool: "tabelo_edit_table" as const,
		args: {
			sessionId: session.id,
			tableId: session.tableId,
			requestId,
			expectedDocumentRevision: Number(read().documentRevision),
			operations: [
				{
					kind: "insert_columns" as const,
					anchor: { edge: "end" as const },
					columns: [{ ref: "$new", header: "Category" }],
				},
			],
		},
	};
}
const execute = (value: unknown, sequence = 2) =>
	session.execute(value, sequence, Date.now() + 1000);

describe("agent command admission", () => {
	it("returns a compact typed matrix with explicit column order and optional workspace context", () => {
		const document = documentFromMatrix(
			[
				["Name", "Age", "Code", "Enabled", "Empty"],
				["Ingrid", 35, "35", true, null],
			],
			{ headerRow: true },
		);
		useTabeloStore.getState().applyDocument(document);
		const compact = read();
		expect(compact).not.toHaveProperty("workspace");
		expect(compact).not.toHaveProperty("views");
		expect(compact.rows).toEqual([
			{
				id: required(document.rows[0]).id,
				values: ["Ingrid", 35, "35", true, null],
			},
		]);
		const outcome = execute({
			tool: "tabelo_read",
			args: {
				sessionId: session.id,
				columnIds: [
					required(document.columns[2]).id,
					required(document.columns[1]).id,
				],
			},
		});
		expect(outcome.data?.rows).toEqual([
			{ id: required(document.rows[0]).id, values: ["35", 35] },
		]);
		expect(
			(required(outcome.data).columns as { id: string }[]).map(
				(column) => column.id,
			),
		).toEqual([
			required(document.columns[2]).id,
			required(document.columns[1]).id,
		]);
		expect(read(true)).toHaveProperty("workspace");
		expect(
			execute({
				tool: "tabelo_read",
				args: { sessionId: session.id, columnIds: ["missing"] },
			}).code,
		).toBe("target_missing");
		expect(
			execute({
				tool: "tabelo_read",
				args: {
					sessionId: session.id,
					columnIds: [
						required(document.columns[0]).id,
						required(document.columns[0]).id,
					],
				},
			}).code,
		).toBe("duplicate_column");
	});
	it("pages by encoded bytes without truncating multibyte or escaped cell values", () => {
		const value = '😀"\\\n'.repeat(40_000);
		useTabeloStore.getState().applyDocument(
			documentFromMatrix([["Note"], [value], [value], [value]], {
				headerRow: true,
			}),
		);
		const first = read();
		expect(first.rows).toHaveLength(2);
		expect(first.nextRowOffset).toBe(2);
		expect(encodedBytes(first)).toBeLessThan(AGENT_LIMITS.bytes - 1024);
		const next = execute({
			tool: "tabelo_read",
			args: {
				sessionId: session.id,
				rowOffset: first.nextRowOffset,
				expectedDocumentRevision: first.documentRevision,
			},
		});
		expect(next.data?.nextRowOffset).toBeNull();
		expect(next.data?.rows).toMatchObject([{ values: [value] }]);
		useTabeloStore.getState().editCell(0, 0, value.repeat(4));
		expect(
			execute({ tool: "tabelo_read", args: { sessionId: session.id } }).code,
		).toBe("value_too_large");
	});

	it("reports a committed edit separately from a quota failure and does not repeat it", () => {
		vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
			throw new DOMException("Full", "QuotaExceededError");
		});
		const request = command();
		const response = execute(request);
		expect(response.data).toMatchObject({
			applied: true,
			persistence: "quota",
		});
		expect(execute(request)).toEqual(response);
		expect(useTabeloStore.getState().document.columns).toHaveLength(2);
		expect(useTabeloStore.getState().storageIssue?.kind).toBe("quota");
	});

	it("refuses unknown or duplicate views and exposes every registered view", () => {
		const state = useTabeloStore.getState();
		const pane = required(state.workspace.panes[0]);
		const other = required(state.workspace.panes[1]);
		const action = (viewId: string, requestId: string) =>
			execute(
				{
					tool: "tabelo_edit_workspace",
					args: {
						sessionId: session.id,
						tableId: session.tableId,
						requestId,
						expectedDocumentRevision: 0,
						expectedWorkspaceRevision: 0,
						action: { kind: "change_view", paneId: pane.id, viewId },
					},
				},
				requestId === "unknown" ? 2 : 3,
			);
		expect(action("does-not-exist", "unknown").code).toBe("unknown_view");
		expect(action(other.view, "duplicate").code).toBe("duplicate_view");
		expect(useTabeloStore.getState().workspace).toBe(state.workspace);
		const views = read(true).views as { id: string }[];
		expect(views.map((view) => view.id)).toEqual(
			listViews().map((view) => view.id),
		);
	});

	it("a view command that changes nothing creates no revision or history step", () => {
		const state = useTabeloStore.getState();
		const pane = required(state.workspace.panes[0]);
		const response = execute({
			tool: "tabelo_edit_workspace",
			args: {
				sessionId: session.id,
				tableId: session.tableId,
				requestId: "same",
				expectedDocumentRevision: 0,
				expectedWorkspaceRevision: 0,
				action: { kind: "change_view", paneId: pane.id, viewId: pane.view },
			},
		});
		expect(response.code).toBe("no_change");
		expect(read().workspaceRevision).toBe(0);
		expect(useTabeloStore.getState().past).toHaveLength(0);
	});
	it("rejects stale work after a human edit, including when undo returns the old content", () => {
		const request = command();
		useTabeloStore.getState().editCell(0, 0, "Mabel");
		expect(execute(request).code).toBe("revision_conflict");
		expect(useTabeloStore.getState().document.columns).toHaveLength(1);
		useTabeloStore.getState().undo();
		expect(read().paused).toBe(true);
		session.pause(false);
		expect(
			execute(
				{ ...request, args: { ...request.args, requestId: "after-undo" } },
				3,
			).code,
		).toBe("revision_conflict");
		expect(read().documentRevision).toBe(2);
	});

	it("commits one history step, returns duplicate receipts, and refuses changed request IDs", () => {
		const request = command();
		expect(execute(request).data?.applied).toBe(true);
		expect(execute(request).code).toBe("applied");
		expect(useTabeloStore.getState().document.columns).toHaveLength(2);
		expect(useTabeloStore.getState().past).toHaveLength(1);
		expect(
			execute({
				...request,
				args: { ...request.args, expectedDocumentRevision: 1 },
			}).code,
		).toBe("request_id_reused");
		useTabeloStore.getState().undo();
		expect(useTabeloStore.getState().document.columns).toHaveLength(1);
		expect(read().paused).toBe(true);
	});

	it("preserves invalid drafts and ongoing cell edits without partial changes", () => {
		const request = command();
		useTabeloStore.getState().setEditing({ row: 0, column: 0 });
		expect(execute(request).code).toBe("user_busy");
		useTabeloStore.getState().setEditing(null);
		const pane = required(
			useTabeloStore
				.getState()
				.workspace.panes.find((pane) => pane.view === "markdown"),
		);
		useTabeloStore.getState().setDraft(pane.id, pane.view, "| unfinished |");
		expect(execute(command("draft"), 3).code).toBe("user_busy");
		expect(useTabeloStore.getState().draft?.text).toBe("| unfinished |");
		expect(useTabeloStore.getState().document.columns).toHaveLength(1);
	});

	it("invalidates the session on document replacement and rejects expired mutations", () => {
		expect(session.execute(command(), 2, Date.now() - 1).code).toBe(
			"request_expired",
		);
		const request = command("replace");
		useTabeloStore.getState().resetDocument();
		expect(execute(request, 3).code).toBe("session_changed");
	});

	it("evicts receipts without allowing an old sequence to execute again", () => {
		const first = command();
		execute(first);
		for (let index = 0; index < AGENT_LIMITS.receipts; index++) {
			execute(
				{ ...first, args: { ...first.args, requestId: `stale-${index}` } },
				index + 3,
			);
		}
		expect(execute(first).code).toBe("receipt_expired");
		expect(useTabeloStore.getState().document.columns).toHaveLength(2);
	});

	it("requires one revision across paged reads and never uploads an invalid draft", () => {
		const first = session.execute(
			{ tool: "tabelo_read", args: { sessionId: session.id, rowLimit: 1 } },
			1,
			Date.now() + 1000,
		);
		expect(first.data?.nextRowOffset).toBe(1);
		useTabeloStore.getState().editCell(1, 0, "Mabel");
		expect(
			execute({
				tool: "tabelo_read",
				args: {
					sessionId: session.id,
					rowOffset: 1,
					expectedDocumentRevision: 0,
				},
			}).code,
		).toBe("revision_conflict");
		expect(first.data).not.toHaveProperty("draft");
	});
});

function required<T>(value: T | undefined): T {
	if (value === undefined) throw new Error("Expected fixture value.");
	return value;
}
