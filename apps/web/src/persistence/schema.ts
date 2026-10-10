import { z } from "zod";
import { TABLE_MARKS, type TableMark } from "@/core/table-library";
import {
	PERSISTED_VERSION,
	type PersistedState,
	persistedStateSchema,
} from "./state-schema";

// One key per table, plus one index naming them. A save then writes the
// table being edited rather than the whole library, so the cost of a
// keystroke does not grow with the number of tables kept (#403).
export const LIBRARY_KEY = "tabelo.library";
export const LIBRARY_RECOVERY_KEY = `${LIBRARY_KEY}.recovery`;
export const CURRENT_VERSION = PERSISTED_VERSION;

export function tableKey(id: string): string {
	return `tabelo.table.${id}`;
}

export function tableRecoveryKey(id: string): string {
	return `${tableKey(id)}.recovery`;
}

// The index. It carries identity, order, and each table's mark colour: a
// table's name, document, workspace, and draft live in that table's own
// payload, so nothing here can drift from what the table itself says. The
// mark lives here because the list owns it, the way it owns order (#465).
// Version 3 lets the library hold no table: deleting the last one leaves an
// empty list and nothing active (#466).
export const LIBRARY_VERSION = 3 as const;

const tableMarkSchema = z.union(
	TABLE_MARKS.map((mark) => z.literal(mark)) as [
		z.ZodLiteral<TableMark>,
		...z.ZodLiteral<TableMark>[],
	],
);

const indexEntrySchema = z.object({
	id: z.string().min(1),
	mark: tableMarkSchema,
});

const libraryIndexSchema = z.object({
	version: z.literal(LIBRARY_VERSION),
	tables: z.array(indexEntrySchema),
	activeId: z.string().min(1).nullable(),
});

// The six marks versions 1 and 2 knew, pinned here rather than read from the
// live `TABLE_MARKS`, so a later change to the marks cannot change how an old
// index reads or migrates (#434).
const HISTORICAL_TABLE_MARKS = [1, 2, 3, 4, 5, 6] as const;

// Version 2 always held at least one table, one of them active.
const libraryIndexV2Schema = z.object({
	version: z.literal(2),
	tables: z
		.array(
			z.object({
				id: z.string().min(1),
				mark: z.literal(HISTORICAL_TABLE_MARKS),
			}),
		)
		.min(1),
	activeId: z.string().min(1),
});

// Version 1 listed ids alone and painted each table by its place in the list.
const libraryIndexV1Schema = z.object({
	version: z.literal(1),
	tables: z.array(z.string().min(1)).min(1),
	activeId: z.string().min(1),
});

export type LibraryIndex = z.infer<typeof libraryIndexSchema>;

// The forward step from version 2: every version 2 index is a valid version 3
// index, so only the version changes.
function migrateLibraryIndexV2(raw: unknown): unknown {
	const parsed = libraryIndexV2Schema.safeParse(raw);
	if (!parsed.success) return raw;
	return { ...parsed.data, version: LIBRARY_VERSION };
}

// The forward step from version 1: every table keeps the colour it showed,
// which was the one its place gave it, cycling through the six marks. It
// lands on version 2, and the next step carries it on. Each result is
// validated like any stored index, so a step that produced something invalid
// is reported rather than trusted.
function migrateLibraryIndexV1(raw: unknown): unknown {
	const parsed = libraryIndexV1Schema.safeParse(raw);
	if (!parsed.success) return raw;
	return {
		version: 2,
		tables: parsed.data.tables.map((id, position) => ({
			id,
			mark: HISTORICAL_TABLE_MARKS[position % HISTORICAL_TABLE_MARKS.length],
		})),
		activeId: parsed.data.activeId,
	};
}

export function validateLibraryIndex(raw: unknown):
	| { readonly status: "ok"; readonly index: LibraryIndex }
	| {
			readonly status: "unreadable";
			readonly reason: Exclude<PersistenceFailureReason, "invalid-json">;
	  } {
	const version = persistedVersion(raw);
	if (version !== null && version > LIBRARY_VERSION)
		return { status: "unreadable", reason: "future-version" };
	const atV2 = version === 1 ? migrateLibraryIndexV1(raw) : raw;
	const parsed = libraryIndexSchema.safeParse(
		version === 1 || version === 2 ? migrateLibraryIndexV2(atV2) : raw,
	);
	const ids = parsed.success ? parsed.data.tables.map((table) => table.id) : [];
	const activeId = parsed.success ? parsed.data.activeId : null;
	if (
		!parsed.success ||
		(activeId === null ? ids.length > 0 : !ids.includes(activeId)) ||
		new Set(ids).size !== ids.length
	)
		return { status: "unreadable", reason: "current-schema-invalid" };
	return { status: "ok", index: parsed.data };
}

export type { PersistedDraft, PersistedState } from "./state-schema";

export type PersistenceFailureReason =
	| "invalid-json"
	| "current-schema-invalid"
	| "future-version";

export type LoadOutcome =
	| { readonly status: "empty" }
	| { readonly status: "ok"; readonly state: PersistedState }
	| {
			readonly status: "unreadable";
			readonly reason: Exclude<PersistenceFailureReason, "invalid-json">;
	  };

function persistedVersion(raw: unknown): number | null {
	if (typeof raw !== "object" || raw === null || !("version" in raw)) {
		return null;
	}
	const version = (raw as { version: unknown }).version;
	return typeof version === "number" && Number.isInteger(version)
		? version
		: null;
}

export function validatePersistedState(raw: unknown): LoadOutcome {
	if (raw === null || raw === undefined) return { status: "empty" };

	const version = persistedVersion(raw);
	if (version === null) {
		return { status: "unreadable", reason: "current-schema-invalid" };
	}
	if (version > CURRENT_VERSION) {
		return { status: "unreadable", reason: "future-version" };
	}

	const parsed = persistedStateSchema.safeParse(raw);
	if (!parsed.success) {
		return { status: "unreadable", reason: "current-schema-invalid" };
	}

	return { status: "ok", state: parsed.data };
}
