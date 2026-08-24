import type { z } from "zod";
import { DEFAULT_TABLE_NAME } from "@/copy/product";
import { DEFAULT_EXPECTED_TYPE } from "@/core/cell-value";
import { DEFAULT_PANE_ZOOM } from "@/workspace/zoom";
import {
	PERSISTED_VERSION,
	persistedStateSchema,
	persistedStateV1Schema,
	persistedStateV2Schema,
	persistedStateV3Schema,
	persistedStateV4Schema,
	persistedStateV5Schema,
	persistedStateV6Schema,
	persistedStateV7Schema,
} from "./versions";

export interface MigrationStep {
	readonly source: z.ZodType;
	readonly target: z.ZodType;
	readonly migrate: (source: unknown) => unknown;
}

export type MigrationRegistry = Readonly<
	Partial<Record<number, MigrationStep>>
>;

export type MigrationFailureReason =
	| "missing-step"
	| "source-invalid"
	| "transform-failed"
	| "target-invalid";

export type MigrationResult =
	| { readonly ok: true; readonly value: unknown }
	| {
			readonly ok: false;
			readonly reason: MigrationFailureReason;
			readonly version: number;
	  };

// Version 1 stored one text format and whether its panel was visible. Version
// 2 expressed the same choice as a preset workspace beside the visual grid.
function migrateV1ToV2(input: unknown): unknown {
	const source = input as z.infer<typeof persistedStateV1Schema>;
	const view = source.textFormat === "csv" ? "csv" : "markdown";
	const showSource = source.textPanelVisible;

	return {
		version: 2,
		document: source.document,
		workspace: showSource
			? {
					layout: "columns",
					panes: [
						{ id: "ac", view: "grid", slots: ["a", "c"] },
						{ id: "bd", view, slots: ["b", "d"] },
					],
					columnRatio: 0.5,
					rowRatio: 0.5,
					activePaneId: "ac",
				}
			: {
					layout: "single",
					panes: [
						{
							id: "abcd",
							view: "grid",
							slots: ["a", "b", "c", "d"],
						},
					],
					columnRatio: 0.5,
					rowRatio: 0.5,
					activePaneId: "abcd",
				},
	};
}

// Version 3 added the one persisted draft owner without changing the existing
// document or workspace shapes.
function migrateV2ToV3(input: unknown): unknown {
	const source = input as z.infer<typeof persistedStateV2Schema>;
	return { ...source, version: 3, draft: null };
}

// Version 4 gave every pane its own content scale. Every older pane was at
// 100%, so the migration records that value without rebuilding the workspace.
function migrateV3ToV4(input: unknown): unknown {
	const source = input as z.infer<typeof persistedStateV3Schema>;
	return {
		...source,
		version: 4,
		workspace: {
			...source.workspace,
			panes: source.workspace.panes.map((pane) => ({
				...pane,
				zoom: DEFAULT_PANE_ZOOM,
			})),
		},
	};
}

// Version 5 makes column width a workspace preference keyed by stable id. The
// migration moves every shipped width without deriving it from column order.
function migrateV4ToV5(input: unknown): unknown {
	const source = input as z.infer<typeof persistedStateV4Schema>;
	const columnWidths = Object.fromEntries(
		source.document.columns.flatMap((column) =>
			column.width === undefined ? [] : [[column.id, column.width]],
		),
	);
	return {
		...source,
		version: 5,
		document: {
			...source.document,
			columns: source.document.columns.map(({ id, header, align }) => ({
				id,
				header,
				align,
			})),
		},
		workspace: { ...source.workspace, columnWidths },
	};
}

// Version 6 lets a cell hold a native scalar and lets a column declare the
// type it expects. Every value a version-5 release wrote was a string, so the
// migration copies the rows through untouched and only records the expectation
// each existing column already had: text. Nothing here reads a value to guess
// a type, which is the rule ADR 0008 makes durable.
function migrateV5ToV6(input: unknown): unknown {
	const source = input as z.infer<typeof persistedStateV5Schema>;
	return {
		...source,
		version: 6,
		document: {
			...source.document,
			columns: source.document.columns.map((column) => ({
				...column,
				expectedType: DEFAULT_EXPECTED_TYPE,
			})),
		},
	};
}

// Version 7 gives the table an identity outside the document timeline. Every
// earlier table receives the product-owned default without inspecting content.
function migrateV6ToV7(input: unknown): unknown {
	const source = input as z.infer<typeof persistedStateV6Schema>;
	return { ...source, version: 7, name: DEFAULT_TABLE_NAME };
}

// Version 8 lets the grid pin its first data row and first data column. Both
// start off: pinning is something the user asks for, and turning it on for a
// table the user never pinned would change how their saved table looks on the
// next load.
function migrateV7ToV8(input: unknown): unknown {
	const source = input as z.infer<typeof persistedStateV7Schema>;
	return {
		...source,
		version: 8,
		workspace: {
			...source.workspace,
			pinFirstDataRow: false,
			pinFirstDataColumn: false,
		},
	};
}

export const migrationRegistry: MigrationRegistry = {
	1: {
		source: persistedStateV1Schema,
		target: persistedStateV2Schema,
		migrate: migrateV1ToV2,
	},
	2: {
		source: persistedStateV2Schema,
		target: persistedStateV3Schema,
		migrate: migrateV2ToV3,
	},
	3: {
		source: persistedStateV3Schema,
		target: persistedStateV4Schema,
		migrate: migrateV3ToV4,
	},
	4: {
		source: persistedStateV4Schema,
		target: persistedStateV5Schema,
		migrate: migrateV4ToV5,
	},
	5: {
		source: persistedStateV5Schema,
		target: persistedStateV6Schema,
		migrate: migrateV5ToV6,
	},
	6: {
		source: persistedStateV6Schema,
		target: persistedStateV7Schema,
		migrate: migrateV6ToV7,
	},
	7: {
		source: persistedStateV7Schema,
		target: persistedStateSchema,
		migrate: migrateV7ToV8,
	},
};

export function runMigrationChain(
	input: unknown,
	startVersion: number,
	targetVersion: number,
	registry: MigrationRegistry,
): MigrationResult {
	let candidate = input;
	let version = startVersion;

	while (version < targetVersion) {
		const step = registry[version];
		if (!step) return { ok: false, reason: "missing-step", version };

		const source = step.source.safeParse(candidate);
		if (!source.success) {
			return { ok: false, reason: "source-invalid", version };
		}

		let migrated: unknown;
		try {
			migrated = step.migrate(source.data);
		} catch {
			return { ok: false, reason: "transform-failed", version };
		}

		const target = step.target.safeParse(migrated);
		if (!target.success) {
			return { ok: false, reason: "target-invalid", version };
		}

		candidate = target.data;
		version += 1;
	}

	return { ok: true, value: candidate };
}

export function migratePersistedState(
	input: unknown,
	version: number,
): MigrationResult {
	return runMigrationChain(
		input,
		version,
		PERSISTED_VERSION,
		migrationRegistry,
	);
}
