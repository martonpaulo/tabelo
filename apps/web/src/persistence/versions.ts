import { z } from "zod";
import { workspacePanesTileLayout } from "@/workspace/layout";
import { MAX_PANE_ZOOM, MIN_PANE_ZOOM } from "@/workspace/zoom";

export const PERSISTED_VERSION = 4 as const;

// These schemas mirror the payloads shipped by the commits that introduced
// versions 1 through 4. Keep them beside their stored fixtures: a migration
// must validate what that release wrote, not what the current model resembles.

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

const historicalViewIdSchema = z.enum([
	"grid",
	"markdown",
	"csv",
	"tsv",
	"html",
	"html-preview",
	"jira",
]);

const currentViewIdSchema = z.enum([
	"grid",
	"markdown",
	"csv",
	"tsv",
	"html",
	"html-preview",
	"jira",
	"json",
	"records",
]);

const slotSchema = z.enum(["a", "b", "c", "d"]);
const layoutSchema = z.enum([
	"single",
	"columns",
	"rows",
	"left-split",
	"right-split",
	"top-split",
	"bottom-split",
	"quad",
]);

const historicalPaneSchema = z.object({
	id: z.string().min(1),
	view: historicalViewIdSchema,
	slots: z.array(slotSchema).min(1).max(4),
});

const historicalWorkspaceSchema = z.object({
	layout: layoutSchema,
	panes: z.array(historicalPaneSchema).min(1).max(4),
	columnRatio: z.number().min(0.1).max(0.9),
	rowRatio: z.number().min(0.1).max(0.9),
	activePaneId: z.string().min(1),
});

const historicalDraftSchema = z.object({
	paneId: z.string().min(1),
	viewId: historicalViewIdSchema,
	text: z.string(),
});

export const persistedStateV1Schema = z.object({
	version: z.literal(1),
	document: documentSchema,
	textFormat: z.enum(["markdown", "csv"]),
	textPanelVisible: z.boolean().default(true),
});

export const persistedStateV2Schema = z.object({
	version: z.literal(2),
	document: documentSchema,
	workspace: historicalWorkspaceSchema,
});

export const persistedStateV3Schema = z
	.object({
		version: z.literal(3),
		document: documentSchema,
		workspace: historicalWorkspaceSchema,
		draft: historicalDraftSchema.nullable(),
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

const currentPaneSchema = z.object({
	id: z.string().min(1),
	view: currentViewIdSchema,
	slots: z.array(slotSchema).min(1).max(4),
	// Bounded like the split ratios: a value outside the ladder means the
	// payload was not written by Tabelo, so it is reported rather than coerced.
	zoom: z.number().min(MIN_PANE_ZOOM).max(MAX_PANE_ZOOM),
	// Version-4 payloads predate pane-owned source wrapping. Keep the current
	// version readable while making the runtime contract explicit.
	wrap: z.boolean().default(false),
});

const currentWorkspaceSchema = z.object({
	layout: layoutSchema,
	panes: z.array(currentPaneSchema).min(1).max(4),
	// Defaulting keeps version-4 payloads written before per-column wrapping
	// valid while making the in-memory workspace contract required.
	wrappedColumns: z.array(z.string().min(1)).default([]),
	columnRatio: z.number().min(0.1).max(0.9),
	rowRatio: z.number().min(0.1).max(0.9),
	activePaneId: z.string().min(1),
});

const currentDraftSchema = z.object({
	paneId: z.string().min(1),
	viewId: currentViewIdSchema,
	text: z.string(),
});

export const persistedStateSchema = z
	.object({
		version: z.literal(PERSISTED_VERSION),
		document: documentSchema,
		workspace: currentWorkspaceSchema,
		draft: currentDraftSchema.nullable(),
	})
	.superRefine((state, context) => {
		if (
			!workspacePanesTileLayout(state.workspace.layout, state.workspace.panes)
		) {
			context.addIssue({
				code: "custom",
				path: ["workspace", "panes"],
				message: "Workspace panes must tile the selected layout.",
			});
		}

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
