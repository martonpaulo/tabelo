import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
	callSchema,
	resultSchema,
	serverInstructions,
	type ToolName,
	toolDescriptions,
	toolSchemas,
} from "@tabelo/agent-protocol";
import { LocalBridge } from "./bridge.ts";

const origins = ["https://tabelo.martonpaulo.com"];
for (let index = 2; index < process.argv.length; index += 2) {
	const option = process.argv[index];
	const origin = process.argv[index + 1];
	if (
		option !== "--origin" ||
		!origin ||
		!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin)
	) {
		process.stderr.write(
			"Usage: node src/index.ts [--origin http://127.0.0.1:<dev-port>]\n",
		);
		process.exit(1);
	}
	origins.push(new URL(origin).origin);
}

const bridge = new LocalBridge({ origins });
// This is an internal protocol identity, not a product release number.
const server = new McpServer(
	{ name: "tabelo", version: "0.0.0" },
	{ instructions: serverInstructions },
);
for (const name of Object.keys(toolSchemas) as ToolName[]) {
	const edit =
		name === "tabelo_edit_table" ||
		name === "tabelo_edit_workspace" ||
		name === "tabelo_manage_tables";
	server.registerTool(
		name,
		{
			description: toolDescriptions[name],
			inputSchema: toolSchemas[name].shape,
			annotations: {
				readOnlyHint:
					name === "tabelo_read" ||
					name === "tabelo_list_tables" ||
					name === "tabelo_operation_status",
				destructiveHint: edit,
				idempotentHint: edit,
				openWorldHint: false,
			},
		},
		async (args: unknown) => {
			const outcome =
				name === "tabelo_connect"
					? await bridge.connect()
					: await bridge.call(callSchema.parse({ tool: name, args }));
			return {
				// One JSON representation works in text-only MCP hosts too. Do not
				// duplicate the entire table in structuredContent without measuring
				// how the selected host exposes both fields to its model.
				content: [
					{
						type: "text" as const,
						text: JSON.stringify(resultSchema.parse(outcome)),
					},
				],
				isError: !outcome.ok,
			};
		},
	);
}

let stopping = false;
async function shutdown(): Promise<void> {
	if (stopping) return;
	stopping = true;
	await bridge.close();
	await server.close();
}
process.once("SIGINT", () => {
	void shutdown();
});
process.once("SIGTERM", () => {
	void shutdown();
});
process.stdin.once("end", () => {
	void shutdown();
});
await server.connect(new StdioServerTransport());
