import { migratePersistedState } from "./migrations";
import {
	PERSISTED_VERSION,
	type PersistedState,
	persistedStateSchema,
} from "./versions";

export const STORAGE_KEY = "tabelo.document";
export const RECOVERY_KEY = "tabelo.document.recovery";
export const CURRENT_VERSION = PERSISTED_VERSION;

export type { PersistedDraft, PersistedState } from "./versions";

export type PersistenceFailureReason =
	| "invalid-json"
	| "current-schema-invalid"
	| "migration-failed"
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

	let candidate: unknown = raw;
	const migrated = version < CURRENT_VERSION;
	if (migrated) {
		const result = migratePersistedState(raw, version);
		if (!result.ok) {
			return { status: "unreadable", reason: "migration-failed" };
		}
		candidate = result.value;
	}

	const parsed = persistedStateSchema.safeParse(candidate);
	if (!parsed.success) {
		return {
			status: "unreadable",
			reason: migrated ? "migration-failed" : "current-schema-invalid",
		};
	}

	return { status: "ok", state: parsed.data };
}
