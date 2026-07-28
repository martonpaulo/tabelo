import { z } from "zod";
import { MAX_PANE_ZOOM, MIN_PANE_ZOOM } from "@/workspace/zoom";

// Browser storage accepts only the current schema. During this pre-user phase,
// stale local payloads are preserved for recovery but never migrated forward.

export const STORAGE_KEY = "tabelo.document";
export const RECOVERY_KEY = "tabelo.document.recovery";
export const CURRENT_VERSION = 4;

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
	// Bounded like the split ratios: a value outside the ladder means the
	// payload was not written by Tabelo, so it is reported rather than coerced.
	zoom: z.number().min(MIN_PANE_ZOOM).max(MAX_PANE_ZOOM),
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
		const views = state.workspace.panes.map((pane) => pane.view);
		if (new Set(views).size !== views.length) {
			context.addIssue({
				code: "custom",
				path: ["workspace", "panes"],
				message: "A workspace cannot show the same view more than once.",
			});
		}

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

export type LoadOutcome =
	| { readonly status: "empty" }
	| { readonly status: "ok"; readonly state: PersistedState }
	| { readonly status: "unreadable"; readonly reason: string };

export function validatePersistedState(raw: unknown): LoadOutcome {
	if (raw === null || raw === undefined) return { status: "empty" };

	const version =
		typeof raw === "object" && raw !== null && "version" in raw
			? Number((raw as { version: unknown }).version)
			: Number.NaN;

	if (!Number.isFinite(version)) {
		return { status: "unreadable", reason: "The saved table has no version." };
	}

	if (version !== CURRENT_VERSION) {
		return {
			status: "unreadable",
			reason: "The saved table uses an unsupported version.",
		};
	}

	const parsed = persistedStateSchema.safeParse(raw);
	if (!parsed.success) {
		return {
			status: "unreadable",
			reason: "The saved table does not match the expected shape.",
		};
	}

	return { status: "ok", state: parsed.data };
}
