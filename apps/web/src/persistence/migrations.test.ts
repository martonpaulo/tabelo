import { describe, expect, it } from "vitest";
import { z } from "zod";
import v1 from "./fixtures/v1.json";
import v2 from "./fixtures/v2.json";
import v3 from "./fixtures/v3.json";
import v4 from "./fixtures/v4.json";
import v5 from "./fixtures/v5.json";
import v6 from "./fixtures/v6.json";
import v7 from "./fixtures/v7.json";
import {
	type MigrationRegistry,
	migrationRegistry,
	runMigrationChain,
} from "./migrations";

describe("adjacent persistence migrations", () => {
	it("maps the v1 source preference into a v2 workspace", () => {
		const result = runMigrationChain(v1, 1, 2, migrationRegistry);

		expect(result).toMatchObject({
			ok: true,
			value: {
				version: 2,
				workspace: {
					layout: "columns",
					activePaneId: "ac",
					panes: [{ view: "grid" }, { view: "csv" }],
				},
			},
		});
	});

	it("maps a hidden v1 source panel into the single-grid workspace", () => {
		const result = runMigrationChain(
			{ ...v1, textPanelVisible: false },
			1,
			2,
			migrationRegistry,
		);

		expect(result).toMatchObject({
			ok: true,
			value: {
				version: 2,
				workspace: {
					layout: "single",
					activePaneId: "abcd",
					panes: [{ view: "grid", slots: ["a", "b", "c", "d"] }],
				},
			},
		});
	});

	it("adds the v3 draft contract without changing the v2 workspace", () => {
		const result = runMigrationChain(v2, 2, 3, migrationRegistry);

		expect(result).toMatchObject({
			ok: true,
			value: {
				version: 3,
				draft: null,
				workspace: { columnRatio: 0.4, activePaneId: "bd" },
			},
		});
	});

	it("adds default zoom while preserving the v3 draft and workspace", () => {
		const result = runMigrationChain(v3, 3, 4, migrationRegistry);

		expect(result).toMatchObject({
			ok: true,
			value: {
				version: 4,
				draft: { paneId: "bd", viewId: "markdown" },
				workspace: {
					columnRatio: 0.4,
					activePaneId: "bd",
					panes: [{ zoom: 1 }, { zoom: 1 }],
				},
			},
		});
	});

	it("moves v4 document widths into workspace preferences", () => {
		const result = runMigrationChain(v4, 4, 5, migrationRegistry);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const value = result.value as {
			version: number;
			document: { columns: Record<string, unknown>[] };
			workspace: { columnWidths: Record<string, number> };
		};
		expect(value.version).toBe(5);
		expect(value.workspace.columnWidths).toEqual({ "c-name": 18 });
		expect(value.document.columns.every((column) => !("width" in column))).toBe(
			true,
		);
	});

	it("gives every v5 column the text expectation without touching its values", () => {
		const result = runMigrationChain(v5, 5, 6, migrationRegistry);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const value = result.value as {
			version: number;
			document: {
				columns: { id: string; expectedType: string }[];
				rows: { cells: Record<string, unknown> }[];
			};
		};
		expect(value.version).toBe(6);
		expect(value.document.columns.map((column) => column.expectedType)).toEqual(
			["text", "text"],
		);
		// Byte-identical values in their original column order. A migration that
		// read a value to guess a type is the failure this pins down.
		expect(value.document.columns.map((column) => column.id)).toEqual(
			v5.document.columns.map((column) => column.id),
		);
		expect(value.document.rows.map((row) => row.cells)).toEqual(
			v5.document.rows.map((row) => row.cells),
		);
		expect(
			value.document.rows.every((row) =>
				Object.values(row.cells).every((cell) => typeof cell === "string"),
			),
		).toBe(true);
	});

	it("gives every v6 table the product-owned default name", () => {
		const result = runMigrationChain(v6, 6, 7, migrationRegistry);

		expect(result).toMatchObject({
			ok: true,
			value: { version: 7, name: "Untitled table" },
		});
	});

	it("leaves every v7 table unpinned without touching its workspace", () => {
		const result = runMigrationChain(v7, 7, 8, migrationRegistry);

		expect(result).toMatchObject({
			ok: true,
			value: {
				version: 8,
				name: v7.name,
				workspace: {
					pinFirstDataRow: false,
					pinFirstDataColumn: false,
					columnWidths: v7.workspace.columnWidths,
					activePaneId: v7.workspace.activePaneId,
				},
			},
		});
	});

	it("runs the oldest fixture through the complete chain", () => {
		const result = runMigrationChain(v1, 1, 8, migrationRegistry);

		expect(result).toMatchObject({
			ok: true,
			value: {
				version: 8,
				name: "Untitled table",
				draft: null,
				workspace: { pinFirstDataRow: false, pinFirstDataColumn: false },
			},
		});
	});
});

describe("migration runner failures", () => {
	const source = z.object({ version: z.literal(1), value: z.string() });
	const target = z.object({ version: z.literal(2), value: z.string() });

	it.each([
		{
			name: "invalid source",
			input: { version: 1, value: 4 },
			migrate: (input: unknown) => input,
			reason: "source-invalid",
		},
		{
			name: "thrown transform",
			input: { version: 1, value: "kept" },
			migrate: () => {
				throw new Error("broken migration");
			},
			reason: "transform-failed",
		},
		{
			name: "invalid target",
			input: { version: 1, value: "kept" },
			migrate: () => ({ version: 2, value: 4 }),
			reason: "target-invalid",
		},
	] as const)("reports $name", ({ input, migrate, reason }) => {
		const registry: MigrationRegistry = {
			1: { source, target, migrate },
		};

		expect(runMigrationChain(input, 1, 2, registry)).toEqual({
			ok: false,
			reason,
			version: 1,
		});
	});

	it("refuses a missing adjacent step", () => {
		expect(runMigrationChain({ version: 1 }, 1, 2, {})).toEqual({
			ok: false,
			reason: "missing-step",
			version: 1,
		});
	});
});
