import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { resultSchema, toolSchemas } from "@tabelo/agent-protocol";

// Claude is the supported agent (#536). Claude Code's MCP client is built on
// the official MCP TypeScript SDK, so this client, started the way
// `claude mcp add` and Claude Desktop's `mcpServers` entry start the connector
// (the Node executable plus the absolute entrypoint path, outside the
// checkout), proves Claude can connect and call the connector's tools.
test("a Claude MCP client connects over stdio outside the checkout, calls tools and is refused unsupported input", async () => {
	const transport = new StdioClientTransport({
		command: process.execPath,
		args: [fileURLToPath(new URL("./index.ts", import.meta.url))],
		cwd: tmpdir(),
		stderr: "pipe",
	});
	const client = new Client({ name: "claude-code", version: "0.0.0" });
	try {
		await client.connect(transport);
		const listed = await client.listTools();
		assert.deepEqual(
			listed.tools.map((tool) => tool.name).sort(),
			Object.keys(toolSchemas).sort(),
		);
		const call = async (name: string, args: Record<string, unknown> = {}) => {
			const response = await client.callTool({ name, arguments: args });
			const text = (response.content as { type: string; text?: string }[]).find(
				(part) => part.type === "text",
			)?.text;
			assert.ok(text);
			return resultSchema.parse(JSON.parse(text));
		};
		assert.equal(
			(await call("tabelo_read", { sessionId: "unpaired" })).code,
			"not_connected",
		);
		const first = await call("tabelo_connect");
		assert.equal(first.code, "pairing");
		assert.deepEqual(await call("tabelo_connect"), first);
		const invalid = await client.callTool({
			name: "tabelo_manage_tables",
			arguments: {
				sessionId: "unpaired",
				tableId: "table",
				requestId: "delete",
				expectedDocumentRevision: 0,
				expectedLibraryRevision: 0,
				action: { kind: "delete", targetTableId: "table" },
			},
		});
		assert.equal(invalid.isError, true);
	} finally {
		await client.close();
		await transport.close();
	}
});
