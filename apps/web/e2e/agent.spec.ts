import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { type AgentResult, resultSchema } from "@tabelo/agent-protocol";
import { copy } from "@/copy/copy";
import { test as base, expect } from "./fixtures";
import { lastCopied, recordingClipboard, TabeloPage } from "./helpers";

type Snapshot = {
	sessionId: string;
	tableId: string;
	documentRevision: number;
	workspaceRevision: number;
	paused: boolean;
	columns: { id: string; header: string }[];
	rows: { id: string; values: unknown[] }[];
	workspace: { panes: { id: string; view: string }[] };
	splits: { paneId: string; layout: string }[];
	views: { id: string; available: boolean }[];
};
type Agent = {
	call: (name: string, args?: Record<string, unknown>) => Promise<AgentResult>;
	read: () => Promise<Snapshot>;
	sessionId: string;
};

const test = base.extend<{ agent: Agent }>({
	agent: async ({ page, tabelo }, use) => {
		const executable = fileURLToPath(
			new URL("./index.ts", import.meta.resolve("@tabelo/agent-bridge/bridge")),
		);
		const transport = new StdioClientTransport({
			command: process.execPath,
			args: [executable, "--origin", new URL(page.url()).origin],
			stderr: "pipe",
		});
		const client = new Client({
			name: "tabelo-browser-test",
			version: "0.0.0",
		});
		const call = async (name: string, args: Record<string, unknown> = {}) => {
			const response = await client.callTool({ name, arguments: args });
			expect(response.structuredContent).toBeUndefined();
			const content = response.content as { type: string; text?: string }[];
			const text = content.find((item) => item.type === "text")?.text;
			return resultSchema.parse(JSON.parse(required(text)));
		};
		try {
			await client.connect(transport);
			const tools = await client.listTools();
			expect(
				tools.tools.some((tool) => tool.name === "tabelo_edit_table"),
			).toBe(true);
			const pairing = await call("tabelo_connect");
			await (await tabelo.openAppMenu())
				.getByRole("menuitem", { name: copy.agent.connect, exact: true })
				.click();
			const dialog = page.getByRole("dialog", { name: copy.agent.connect });
			await dialog
				.getByRole("textbox", { name: copy.agent.descriptor })
				.fill(String(pairing.data?.descriptor));
			await dialog
				.getByRole("button", { name: copy.agent.connect, exact: true })
				.click();
			await expect(dialog).toBeHidden();
			const connected = await call("tabelo_connect");
			expect(connected.code).toBe("connected");
			const sessionId = String(connected.data?.sessionId);
			const read = async () => {
				const outcome = await call("tabelo_read", {
					sessionId,
					includeWorkspace: true,
				});
				expect(outcome.ok).toBe(true);
				return outcome.data as Snapshot;
			};
			await expect
				.poll(
					async () =>
						((await read()) as Snapshot & { busy: string | null }).busy,
				)
				.toBeNull();
			await use({ call, read, sessionId });
		} finally {
			await client.close();
			await transport.close();
		}
	},
});

function tableArgs(state: Snapshot, operations: unknown[]) {
	return {
		sessionId: state.sessionId,
		tableId: state.tableId,
		requestId: randomUUID(),
		expectedDocumentRevision: state.documentRevision,
		operations,
	};
}

test("a real MCP client creates and fills one undoable column, then respects human edits", async ({
	page,
	tabelo,
	agent,
}) => {
	const before = await agent.read();
	const args = tableArgs(before, [
		{
			kind: "insert_columns",
			anchor: { edge: "end" },
			columns: [{ ref: "$category", header: "Category" }],
		},
		{
			kind: "set_cells",
			cells: [
				{
					rowId: required(before.rows[0]).id,
					columnId: "$category",
					value: "Design",
				},
			],
		},
	]);
	const applied = await agent.call("tabelo_edit_table", args);
	expect(applied, JSON.stringify(applied)).toMatchObject({ code: "applied" });
	expect(applied.data?.persistence).toBe("saved");
	await expect(tabelo.header(before.columns.length + 1)).toHaveText("Category");
	await expect(tabelo.cell(1, before.columns.length + 1)).toHaveText("Design");
	expect((await agent.call("tabelo_edit_table", args)).code).toBe("applied");
	expect((await agent.read()).columns).toHaveLength(before.columns.length + 1);

	const stale = await agent.read();
	await tabelo.editCell(1, 1, "Ingrid");
	expect(
		(
			await agent.call(
				"tabelo_edit_table",
				tableArgs(stale, [
					{
						kind: "set_cells",
						cells: [
							{
								rowId: required(stale.rows[0]).id,
								columnId: required(stale.columns[0]).id,
								value: "Paulo",
							},
						],
					},
				]),
			)
		).code,
	).toBe("revision_conflict");
	await expect(tabelo.cell(1, 1)).toHaveText("Ingrid");

	await tabelo.cell(1, 1).click();
	await page.keyboard.press("ControlOrMeta+z");
	await expect(tabelo.cell(1, 1)).toHaveText("");
	expect((await agent.read()).paused).toBe(true);
	await page.keyboard.press("ControlOrMeta+z");
	expect((await agent.read()).columns).toHaveLength(before.columns.length);
	await page.keyboard.press("ControlOrMeta+Shift+z");
	await expect(tabelo.header(before.columns.length + 1)).toHaveText("Category");
});

test("unfinished source and cell input remain untouched by agent commands", async ({
	page,
	tabelo,
	agent,
}) => {
	const state = await agent.read();
	await page.evaluate(() =>
		document.dispatchEvent(
			new CompositionEvent("compositionstart", { bubbles: true }),
		),
	);
	const composing = await agent.call(
		"tabelo_edit_table",
		tableArgs(state, [
			{ kind: "delete_rows", ids: [required(state.rows[0]).id] },
		]),
	);
	expect(composing).toMatchObject({
		code: "user_busy",
		data: { reason: "composition" },
	});
	expect((await agent.read()).rows).toEqual(state.rows);
	await page.evaluate(() =>
		document.dispatchEvent(
			new CompositionEvent("compositionend", { bubbles: true }),
		),
	);
	await tabelo.cell(1, 1).dblclick();
	expect(
		(
			await agent.call(
				"tabelo_edit_table",
				tableArgs(state, [
					{ kind: "delete_rows", ids: [required(state.rows[0]).id] },
				]),
			)
		).code,
	).toBe("user_busy");
	await page.keyboard.press("Escape");
	const source = tabelo.source("markdown");
	await source.fill("| unfinished |");
	const fresh = await agent.read();
	expect(
		(
			await agent.call(
				"tabelo_edit_table",
				tableArgs(fresh, [
					{
						kind: "insert_columns",
						anchor: { edge: "end" },
						columns: [{ ref: "$extra", header: "Extra" }],
					},
				]),
			)
		).code,
	).toBe("user_busy");
	await expect(source).toContainText("| unfinished |");
	expect((await agent.read()).columns).toHaveLength(state.columns.length);
});

test("the agent manages registry views and loses access after a reload", async ({
	page,
	tabelo,
	agent,
}) => {
	let state = await agent.read();
	const sourcePane = required(
		state.workspace.panes.find((pane) => pane.view !== "grid"),
	);
	const edit = async (action: unknown) =>
		agent.call("tabelo_edit_workspace", {
			sessionId: state.sessionId,
			tableId: state.tableId,
			requestId: randomUUID(),
			expectedDocumentRevision: state.documentRevision,
			expectedWorkspaceRevision: state.workspaceRevision,
			action,
		});
	expect((await edit({ kind: "close_view", paneId: sourcePane.id })).code).toBe(
		"applied",
	);
	await expect(tabelo.pane("markdown")).toHaveCount(0);
	state = await agent.read();
	expect(
		(
			await edit({
				kind: "close_view",
				paneId: required(state.workspace.panes[0]).id,
			})
		).code,
	).toBe("last_pane");
	const split = required(state.splits[0]);
	const available = required(state.views.find((view) => view.available));
	expect(
		(
			await edit({
				kind: "add_view",
				paneId: split.paneId,
				layoutId: split.layout,
				viewId: available.id,
			})
		).code,
	).toBe("applied");
	expect((await agent.read()).workspace.panes).toHaveLength(2);
	await page.reload();
	await expect
		.poll(
			async () =>
				(await agent.call("tabelo_read", { sessionId: agent.sessionId })).code,
		)
		.toBe("not_connected");
});

function required<T>(value: T | undefined): T {
	if (value === undefined) throw new Error("Expected fixture value.");
	return value;
}

test("human deletion makes a prepared agent request stale without recreating the row", async ({
	page,
	tabelo,
	agent,
}) => {
	await tabelo.editCell(1, 1, "Ingrid");
	await tabelo.editCell(2, 1, "Paulo");
	const before = await agent.read();
	await tabelo.rowIndex(2).getByRole("button").first().click();
	await tabelo.cell(1, 1).focus();
	await page.keyboard.press("ControlOrMeta+Backspace");
	await expect(tabelo.cell(1, 1)).toHaveText("Paulo");
	const response = await agent.call(
		"tabelo_edit_table",
		tableArgs(before, [
			{
				kind: "set_cells",
				cells: [
					{
						rowId: required(before.rows[0]).id,
						columnId: required(before.columns[0]).id,
						value: "Mabel",
					},
				],
			},
		]),
	);
	expect(response.code).toBe("revision_conflict");
	const after = await agent.read();
	expect(after.rows.some((row) => row.id === required(before.rows[0]).id)).toBe(
		false,
	);
	await expect(tabelo.cell(1, 1)).toHaveText("Paulo");
});

test("pause, resume and disconnect remain under user control", async ({
	page,
	tabelo,
	agent,
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	const state = await agent.read();
	await (await tabelo.openAppMenu())
		.getByRole("menuitem", { name: copy.agent.connected, exact: true })
		.click();
	await page
		.getByRole("dialog")
		.getByRole("button", { name: copy.agent.pause, exact: true })
		.press("Enter");
	await expect(page.getByRole("dialog")).toBeHidden();
	const operations = [
		{
			kind: "set_header",
			columnId: required(state.columns[0]).id,
			value: "Name",
		},
	];
	expect(
		(await agent.call("tabelo_edit_table", tableArgs(state, operations))).code,
	).toBe("session_paused");
	await (await tabelo.openAppMenu())
		.getByRole("menuitem", { name: copy.agent.paused, exact: true })
		.click();
	await page
		.getByRole("dialog")
		.getByRole("button", { name: copy.agent.resume, exact: true })
		.press("Enter");
	await expect(page.getByRole("dialog")).toHaveCount(0);
	expect(
		(
			await agent.call(
				"tabelo_edit_table",
				tableArgs(await agent.read(), operations),
			)
		).code,
	).toBe("applied");
	await expect(tabelo.header(1)).toHaveText("Name");
	await (await tabelo.openAppMenu())
		.getByRole("menuitem", { name: copy.agent.connected, exact: true })
		.click();
	await page
		.getByRole("dialog")
		.getByRole("button", { name: copy.agent.disconnect, exact: true })
		.press("Enter");
	await expect
		.poll(
			async () =>
				(await agent.call("tabelo_read", { sessionId: agent.sessionId })).code,
		)
		.toBe("not_connected");
	await tabelo.editCell(1, 1, "Ingrid");
	await expect(tabelo.cell(1, 1)).toHaveText("Ingrid");
});

test("a failed browser save reports the applied edit and preserves it on retry", async ({
	page,
	tabelo,
	agent,
}) => {
	await page.evaluate(() => {
		const write = Storage.prototype.setItem;
		Storage.prototype.setItem = function (key: string, value: string) {
			if (key.startsWith("tabelo.table."))
				throw new DOMException("Full", "QuotaExceededError");
			write.call(this, key, value);
		};
	});
	const state = await agent.read();
	const args = tableArgs(state, [
		{
			kind: "set_cells",
			cells: [
				{
					rowId: required(state.rows[0]).id,
					columnId: required(state.columns[0]).id,
					value: "Ingrid",
				},
			],
		},
	]);
	const response = await agent.call("tabelo_edit_table", args);
	expect(response.data).toMatchObject({ applied: true, persistence: "quota" });
	await expect(tabelo.cell(1, 1)).toHaveText("Ingrid");
	expect(await agent.call("tabelo_edit_table", args)).toEqual(response);
	await expect(page.getByRole("alert")).toBeVisible();
});

test("first-time MCP setup stays in the dialog and its commands can be copied", async ({
	page,
	tabelo,
}) => {
	await recordingClipboard(page);
	await page.reload();
	await tabelo.dismissWelcome();
	await (await tabelo.openAppMenu())
		.getByRole("menuitem", { name: copy.agent.connect, exact: true })
		.click();
	const dialog = page.getByRole("dialog", { name: copy.agent.connect });
	await expect(dialog.getByRole("link")).toHaveCount(0);
	const command = await dialog
		.getByRole("textbox", { name: copy.agent.setupTitle })
		.inputValue();
	expect(command).toContain("codex mcp add tabelo --");
	await dialog
		.getByRole("button", { name: copy.agent.copyCommands, exact: true })
		.click();
	expect((await lastCopied(page))?.text).toBe(command);
	await dialog.getByRole("button", { name: copy.actions.cancel }).click();
	await expect(
		page.getByRole("button", { name: copy.actions.openAppMenu }),
	).toBeFocused();
});

test("a write from another tab revokes the paired session", async ({
	page,
	agent,
}) => {
	const other = await page.context().newPage();
	try {
		const second = new TabeloPage(other);
		await second.open();
		await second.editCell(1, 1, "Other tab");
		await expect
			.poll(
				async () =>
					(await agent.call("tabelo_read", { sessionId: agent.sessionId }))
						.code,
			)
			.toBe("not_connected");
		await expect(second.cell(1, 1)).toHaveText("Other tab");
	} finally {
		await other.close();
	}
});
