import { z } from "zod";
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

// The index. It carries identity and order only: a table's name, document,
// workspace, and draft live in that table's own payload, so nothing here can
// drift from what the table itself says.
export const LIBRARY_VERSION = 1 as const;

const libraryIndexSchema = z.object({
	version: z.literal(LIBRARY_VERSION),
	tables: z.array(z.string().min(1)).min(1),
	activeId: z.string().min(1),
});

export type LibraryIndex = z.infer<typeof libraryIndexSchema>;

export function validateLibraryIndex(raw: unknown):
	| { readonly status: "ok"; readonly index: LibraryIndex }
	| {
			readonly status: "unreadable";
			readonly reason: Exclude<PersistenceFailureReason, "invalid-json">;
	  } {
	const version = persistedVersion(raw);
	if (version !== null && version > LIBRARY_VERSION)
		return { status: "unreadable", reason: "future-version" };
	const parsed = libraryIndexSchema.safeParse(raw);
	if (
		!parsed.success ||
		!parsed.data.tables.includes(parsed.data.activeId) ||
		new Set(parsed.data.tables).size !== parsed.data.tables.length
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
