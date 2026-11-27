import { describe, expect, it } from "vitest";
import { documentFromMatrix } from "@/core/document";
import { samplePeopleMatrix } from "@/core/sample-data";
import { CURRENT_VERSION } from "@/persistence/schema";
import { createDefaultWorkspace } from "@/workspace/layout";
import {
	BACKUP_FORMAT,
	BACKUP_VERSION,
	parseBackup,
	serializeBackup,
} from "./backup";

// The roster carries typed numbers in its age column, and a null and a
// boolean are added beside them, so a round trip that read text would show.
function payload(name: string) {
	const matrix = samplePeopleMatrix(2);
	matrix.push(["Mabel", null, true, 0]);
	return {
		name,
		document: documentFromMatrix(matrix, { headerRow: true }),
		workspace: createDefaultWorkspace(),
		draft: null,
	};
}

describe("library backup (#430)", () => {
	it("round-trips every table with its types and mark", () => {
		const tables = [
			{ mark: 1 as const, state: payload("Roster") },
			{ mark: 4 as const, state: payload("Cities") },
		];

		const parsed = parseBackup(serializeBackup(tables));

		expect(parsed).toEqual({
			status: "ok",
			tables: tables.map(({ mark, state }) => ({
				mark,
				state: { ...state, version: CURRENT_VERSION },
			})),
		});
	});

	it("refuses text that is not a backup", () => {
		expect(parseBackup("{")).toEqual({
			status: "invalid",
			reason: "invalid-json",
		});
		expect(parseBackup('[{"name":"Ingrid"}]')).toEqual({
			status: "invalid",
			reason: "not-a-backup",
		});
	});

	it("refuses a newer backup version rather than guessing at it", () => {
		const text = JSON.stringify({
			format: BACKUP_FORMAT,
			version: BACKUP_VERSION + 1,
			tables: [],
		});
		expect(parseBackup(text)).toEqual({
			status: "invalid",
			reason: "future-version",
		});
	});

	it("refuses the whole backup when one table does not validate", () => {
		const good = JSON.parse(
			serializeBackup([{ mark: 1, state: payload("Roster") }]),
		);
		good.tables.push({ mark: 2, table: { version: 1, name: "" } });

		expect(parseBackup(JSON.stringify(good))).toEqual({
			status: "invalid",
			reason: "invalid-table",
		});
	});

	it("refuses a backup with no table", () => {
		expect(parseBackup(serializeBackup([]))).toEqual({
			status: "invalid",
			reason: "empty",
		});
	});
});
