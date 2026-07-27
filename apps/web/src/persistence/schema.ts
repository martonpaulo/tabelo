import { z } from "zod";

// The stored shape is versioned so the internal document format can change
// without stranding somebody's table. A payload that fails validation is
// reported, never silently replaced.

export const STORAGE_KEY = "tabelo.document";
export const RECOVERY_KEY = "tabelo.document.recovery";
export const CURRENT_VERSION = 3;

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

const viewIdSchema = z.enum([
	"grid",
	"markdown",
	"csv",
	"tsv",
	"html",
	"html-preview",
	"jira",
]);

const slotSchema = z.enum(["a", "b", "c", "d"]);

const paneSchema = z.object({
	id: z.string().min(1),
	view: viewIdSchema,
	slots: z.array(slotSchema).min(1).max(4),
});

const workspaceSchema = z.object({
	layout: z.enum([
		"single",
		"columns",
		"rows",
		"left-split",
		"right-split",
		"top-split",
		"bottom-split",
		"quad",
	]),
	panes: z.array(paneSchema).min(1).max(4),
	columnRatio: z.number().min(0.1).max(0.9),
	rowRatio: z.number().min(0.1).max(0.9),
	activePaneId: z.string().min(1),
});

const persistedDraftSchema = z.object({
	paneId: z.string().min(1),
	viewId: viewIdSchema,
	text: z.string(),
});

export const persistedStateSchema = z
	.object({
		version: z.literal(CURRENT_VERSION),
		document: documentSchema,
		workspace: workspaceSchema,
		draft: persistedDraftSchema.nullable(),
	})
	.superRefine((state, context) => {
		if (
			state.draft &&
			!state.workspace.panes.some(
				(pane) =>
					pane.id === state.draft?.paneId && pane.view === state.draft.viewId,
			)
		) {
			context.addIssue({
				code: "custom",
				path: ["draft"],
				message: "Draft owner is not present in the workspace.",
			});
		}
	});

export type PersistedState = z.infer<typeof persistedStateSchema>;
export type PersistedDraft = PersistedState["draft"];

// Migration chain. Each step takes the previous version's raw payload and
// returns the next one; a version we do not recognise stops here rather than
// being coerced into a shape it was never in.
type Migration = (input: unknown) => unknown;

// v1 stored a single text format and a boolean for whether the source panel was
// visible. That maps cleanly onto the workspace: visible becomes the two-column
// layout with the grid beside that format, hidden becomes the single layout.
function migrateV1ToV2(input: unknown): unknown {
	const source = input as {
		document?: unknown;
		textFormat?: string;
		textPanelVisible?: boolean;
	};

	const view = source.textFormat === "csv" ? "csv" : "markdown";
	const showSource = source.textPanelVisible !== false;

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
					panes: [{ id: "abcd", view: "grid", slots: ["a", "b", "c", "d"] }],
					columnRatio: 0.5,
					rowRatio: 0.5,
					activePaneId: "abcd",
				},
	};
}

function migrateV2ToV3(input: unknown): unknown {
	if (typeof input !== "object" || input === null) return input;
	return { ...input, version: 3, draft: null };
}

const migrations: Record<number, Migration> = {
	1: migrateV1ToV2,
	2: migrateV2ToV3,
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
