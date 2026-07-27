import { z } from "zod";

// The stored shape is versioned so the internal document format can change
// without stranding somebody's table. A payload that fails validation is
// reported, never silently replaced.

export const STORAGE_KEY = "tabelo.document";
export const CURRENT_VERSION = 1;

const alignmentSchema = z.enum(["default", "left", "center", "right"]);

const columnSchema = z.object({
	id: z.string().min(1),
	header: z.string(),
	align: alignmentSchema,
	width: z.number().positive().optional(),
});

const rowSchema = z.object({
	id: z.string().min(1),
	cells: z.record(z.string(), z.string()),
});

const documentSchema = z.object({
	columns: z.array(columnSchema).min(1),
	rows: z.array(rowSchema),
});

export const persistedStateSchema = z.object({
	version: z.literal(CURRENT_VERSION),
	document: documentSchema,
	textFormat: z.enum(["markdown", "csv"]),
	// Presentation preference, not document content.
	textPanelVisible: z.boolean().default(true),
});

export type PersistedState = z.infer<typeof persistedStateSchema>;

// Migration chain. Each step takes the previous version's raw payload and
// returns the next one; a version we do not recognise stops here rather than
// being coerced into a shape it was never in.
type Migration = (input: unknown) => unknown;

const migrations: Record<number, Migration> = {
	// 0 -> 1 exists as the documented starting point of the chain. Payloads
	// written before versioning are not expected in the wild.
};

export type LoadOutcome =
	| { readonly status: "empty" }
	| { readonly status: "ok"; readonly state: PersistedState }
	| { readonly status: "unreadable"; readonly reason: string };

export function migrateAndValidate(raw: unknown): LoadOutcome {
	if (raw === null || raw === undefined) return { status: "empty" };

	// Explicitly unknown: narrowing above would otherwise fix this to `{}` and
	// reject the migration output.
	let candidate: unknown = raw;
	let version =
		typeof raw === "object" && raw !== null && "version" in raw
			? Number((raw as { version: unknown }).version)
			: Number.NaN;

	if (!Number.isFinite(version)) {
		return { status: "unreadable", reason: "The saved table has no version." };
	}

	while (version < CURRENT_VERSION) {
		const migration = migrations[version];
		if (!migration) {
			return {
				status: "unreadable",
				reason: `No migration from version ${version}.`,
			};
		}
		candidate = migration(candidate);
		version += 1;
	}

	if (version > CURRENT_VERSION) {
		return {
			status: "unreadable",
			reason: "The saved table was written by a newer version of Tabelo.",
		};
	}

	const parsed = persistedStateSchema.safeParse(candidate);
	if (!parsed.success) {
		return {
			status: "unreadable",
			reason: "The saved table does not match the expected shape.",
		};
	}

	return { status: "ok", state: parsed.data };
}
