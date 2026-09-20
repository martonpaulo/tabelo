// @vitest-environment happy-dom

import { bench, describe } from "vitest";
import { useTabeloStore } from "@/state/store";
import {
	benchDocument,
	benchOptions,
	consumeDocument,
} from "@/testing/bench-fixtures";
import { AgentSession } from "./session";
import { prepareTable } from "./table-commands";

const document = benchDocument(200, "plain");
const options = benchOptions(200);
useTabeloStore.setState({ document });
const session = new AgentSession({ id: "benchmark" });
const read = {
	tool: "tabelo_read",
	args: { sessionId: session.id, rowLimit: 100 },
};
const column = document.columns[0];
if (!column) throw new Error("Missing benchmark column.");
const cells = document.rows.map((row) => ({
	rowId: row.id,
	columnId: column.id,
	value: "updated",
}));
let consumed = 0;

describe("agent, 200 rows", () => {
	bench(
		"read 100 typed rows",
		() => {
			const outcome = session.execute(read, 1, Date.now() + 1000);
			if (!outcome.ok || !Array.isArray(outcome.data?.rows))
				throw new Error(outcome.code);
			consumed += outcome.data.rows.length;
			if (consumed > Number.MAX_SAFE_INTEGER / 2) consumed = 0;
		},
		options,
	);
	bench(
		"prepare 200 cell writes",
		() => {
			const outcome = prepareTable(document, [{ kind: "set_cells", cells }]);
			if (!outcome.ok) throw new Error(outcome.code);
			consumeDocument(outcome.document);
		},
		options,
	);
});
