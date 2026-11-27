import { z } from "zod";
import type { TableMark } from "@/core/table-library";
import {
	CURRENT_VERSION,
	type PersistedState,
	tableMarkSchema,
	validatePersistedState,
} from "./schema";
import type { SavePayload } from "./storage";

// A library backup: every table this browser holds, in one file the user
// keeps outside the browser (#430). Each table travels as the payload storage
// writes for it, its own version included, so restoring reads it through the
// same validation and forward migrations a stored table goes through, and a
// cell keeps the type and inline content it carried. The backup is not an
// interchange format and no view reads it. Preferences, which tables were
// active, and agent sessions stay out: restoring only adds tables, so there is
// nothing for them to restore into.

export const BACKUP_FORMAT = "tabelo-library-backup";
export const BACKUP_VERSION = 1;

// A backup larger than this could not be stored by the browser it is restored
// into anyway: localStorage keeps a few megabytes per site.
export const BACKUP_MAX_BYTES = 10 * 1024 * 1024;

export interface BackupTable {
	readonly mark: TableMark;
	readonly state: SavePayload;
}

export function serializeBackup(tables: readonly BackupTable[]): string {
	return JSON.stringify({
		format: BACKUP_FORMAT,
		version: BACKUP_VERSION,
		tables: tables.map(({ mark, state }) => ({
			mark,
			table: { ...state, version: CURRENT_VERSION },
		})),
	});
}

const backupHeaderSchema = z.object({
	format: z.literal(BACKUP_FORMAT),
	version: z.number().int(),
});

const backupSchema = z.object({
	format: z.literal(BACKUP_FORMAT),
	version: z.literal(BACKUP_VERSION),
	tables: z.array(z.object({ mark: tableMarkSchema, table: z.unknown() })),
});

export type BackupFailureReason =
	| "invalid-json"
	| "not-a-backup"
	| "future-version"
	| "invalid-table"
	| "empty";

export type BackupParseOutcome =
	| {
			readonly status: "ok";
			readonly tables: readonly {
				readonly mark: TableMark;
				readonly state: PersistedState;
			}[];
	  }
	| { readonly status: "invalid"; readonly reason: BackupFailureReason };

// All or nothing: one table that does not validate refuses the whole backup,
// so a restore never adds part of a library and leaves the rest unexplained.
export function parseBackup(text: string): BackupParseOutcome {
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		return { status: "invalid", reason: "invalid-json" };
	}
	const header = backupHeaderSchema.safeParse(raw);
	if (!header.success) return { status: "invalid", reason: "not-a-backup" };
	if (header.data.version > BACKUP_VERSION)
		return { status: "invalid", reason: "future-version" };
	const parsed = backupSchema.safeParse(raw);
	if (!parsed.success) return { status: "invalid", reason: "not-a-backup" };
	if (parsed.data.tables.length === 0)
		return { status: "invalid", reason: "empty" };
	const tables: { mark: TableMark; state: PersistedState }[] = [];
	for (const entry of parsed.data.tables) {
		const outcome = validatePersistedState(entry.table);
		if (outcome.status !== "ok") {
			return {
				status: "invalid",
				reason:
					outcome.status === "unreadable" && outcome.reason === "future-version"
						? "future-version"
						: "invalid-table",
			};
		}
		tables.push({ mark: entry.mark, state: outcome.state });
	}
	return { status: "ok", tables };
}
