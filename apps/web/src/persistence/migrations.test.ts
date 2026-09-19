import { describe, expect, it } from "vitest";
import { z } from "zod";
import v1 from "./fixtures/v1.json";
import v2 from "./fixtures/v2.json";
import v3 from "./fixtures/v3.json";
import v4 from "./fixtures/v4.json";
import v5 from "./fixtures/v5.json";
import v6 from "./fixtures/v6.json";
import v7 from "./fixtures/v7.json";
import v8 from "./fixtures/v8.json";
import v9 from "./fixtures/v9.json";
import v10 from "./fixtures/v10.json";
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

	// #276. Every pane starts following the three indicator defaults, which
	// were never pane state. Wrapping is the asymmetric case: `true` was a
	// deliberate choice and stays an explicit override, while `false` was the
	// old default and becomes `null`, so the new global default can reach it.
	it("turns v8 pane wrapping into an override only where it was on", () => {
		const [grid, markdown] = v8.workspace.panes;
		const source = {
			...v8,
			workspace: {
				...v8.workspace,
				panes: [
					{ ...grid, wrap: false },
					{ ...markdown, wrap: true },
				],
			},
		};

		const result = runMigrationChain(source, 8, 9, migrationRegistry);

		expect(result).toMatchObject({
			ok: true,
			value: {
				version: 9,
				name: v8.name,
				workspace: {
					pinFirstDataRow: true,
					columnWidths: v8.workspace.columnWidths,
					panes: [
						{
							id: grid?.id,
							zoom: grid?.zoom,
							wrap: null,
							spaceIndicators: null,
							tabIndicators: null,
							emptyValueIndicators: null,
						},
						{
							id: markdown?.id,
							zoom: markdown?.zoom,
							wrap: true,
							spaceIndicators: null,
							tabIndicators: null,
							emptyValueIndicators: null,
						},
					],
				},
			},
		});
	});

	it("leaves a v8 pane that never stored wrapping following the default", () => {
		const [grid, markdown] = v8.workspace.panes;
		const { wrap: _omitted, ...unwrapped } = markdown ?? {};
		const source = {
			...v8,
			workspace: { ...v8.workspace, panes: [grid, unwrapped] },
		};

		const result = runMigrationChain(source, 8, 9, migrationRegistry);

		expect(result).toMatchObject({
			ok: true,
			value: { workspace: { panes: [{ wrap: null }, { wrap: null }] } },
		});
	});

	// #306. Plain text stays a plain string in the inline content model, so the
	// step carries the whole v9 payload across untouched: the same bytes, save
	// the version, and no value read to guess at structure.
	it("copies every v9 value into v10 byte for byte", () => {
		const result = runMigrationChain(v9, 9, 10, migrationRegistry);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const { version, ...rest } = result.value as {
			version: number;
			document: unknown;
		};
		const { version: _source, ...expected } = v9;
		expect(version).toBe(10);
		expect(rest).toEqual(expected);
		expect(JSON.stringify(rest.document)).toBe(JSON.stringify(v9.document));
	});

	it("carries native scalars and empty values into v10 unchanged", () => {
		const [first, second] = v9.document.rows;
		const source = {
			...v9,
			document: {
				...v9.document,
				rows: [
					{ ...first, cells: { "c-name": "", "c-role": 35 } },
					{ ...second, cells: { "c-name": null, "c-role": false } },
				],
			},
		};

		const result = runMigrationChain(source, 9, 10, migrationRegistry);

		expect(result).toMatchObject({
			ok: true,
			value: { version: 10, document: source.document },
		});
	});

	// The line-break mark becomes something a pane may override, and every pane
	// starts by following the default. Nothing else in the payload moves.
	it("adds a following line-break override to every v10 pane", () => {
		const result = runMigrationChain(v10, 10, 11, migrationRegistry);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const migrated = result.value as typeof v10 & { version: number };
		expect(migrated.version).toBe(11);
		expect(migrated.document).toEqual(v10.document);
		expect(migrated.workspace.panes).toEqual(
			v10.workspace.panes.map((pane) => ({
				...pane,
				lineBreakIndicators: null,
			})),
		);
	});

	it("runs the oldest fixture through the complete chain", () => {
		const result = runMigrationChain(v1, 1, 11, migrationRegistry);

		expect(result).toMatchObject({
			ok: true,
			value: {
				version: 11,
				name: "Untitled table",
				draft: null,
				workspace: {
					pinFirstDataRow: false,
					pinFirstDataColumn: false,
					panes: [
						{ wrap: null, spaceIndicators: null, lineBreakIndicators: null },
						{ wrap: null, spaceIndicators: null, lineBreakIndicators: null },
					],
				},
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
