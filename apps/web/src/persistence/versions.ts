import { z } from "zod";
import { MAX_TABLE_NAME_CODE_POINTS } from "@/copy/product";
import { EXPECTED_COLUMN_TYPES } from "@/core/cell-value";
import { workspacePanesTileLayout } from "@/workspace/layout";
import { MAX_PANE_ZOOM, MIN_PANE_ZOOM } from "@/workspace/zoom";

export const PERSISTED_VERSION = 8 as const;

// These schemas mirror the payloads shipped by the commits that introduced
// versions 1 through 5. Keep them beside their stored fixtures: a migration
// must validate what that release wrote, not what the current model resembles.

const alignmentSchema = z.enum(["default", "left", "center", "right"]);

const historicalColumnSchema = z.object({
	id: z.string().min(1),
	header: z.string(),
	align: alignmentSchema,
	width: z.number().positive().optional(),
});

const rowSchema = z.object({
	id: z.string().min(1),
	cells: z.record(z.string(), z.string()),
});

const historicalDocumentSchema = z.object({
	columns: z.array(historicalColumnSchema).min(1),
	rows: z.array(rowSchema),
});

const columnWithoutWidthSchema = historicalColumnSchema.omit({ width: true });
const persistedDocumentV5Schema = z.object({
	columns: z.array(columnWithoutWidthSchema).min(1),
	rows: z.array(rowSchema),
});

// A number that JSON cannot round-trip is not a cell value: `JSON.stringify`
// writes `NaN` and `Infinity` as `null`, which would silently turn a number
// into a different type on the next load. Refusing the payload sends it down
// the recovery path with its bytes intact instead.
const cellValueSchema = z.union([
	z.string(),
	z.number().finite(),
	z.boolean(),
	z.null(),
]);

const currentColumnSchema = columnWithoutWidthSchema.extend({
	expectedType: z.enum(EXPECTED_COLUMN_TYPES),
});
const currentRowSchema = z.object({
	id: z.string().min(1),
	cells: z.record(z.string(), cellValueSchema),
});
const currentDocumentSchema = z.object({
	columns: z.array(currentColumnSchema).min(1),
	rows: z.array(currentRowSchema),
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
	document: historicalDocumentSchema,
	textFormat: z.enum(["markdown", "csv"]),
	textPanelVisible: z.boolean().default(true),
});

export const persistedStateV2Schema = z.object({
	version: z.literal(2),
	document: historicalDocumentSchema,
	workspace: historicalWorkspaceSchema,
});

export const persistedStateV3Schema = z
	.object({
		version: z.literal(3),
		document: historicalDocumentSchema,
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

const persistedWorkspaceV4Schema = z.object({
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

export const persistedStateV4Schema = z
	.object({
		version: z.literal(4),
		document: historicalDocumentSchema,
		workspace: persistedWorkspaceV4Schema,
		draft: currentDraftSchema.nullable(),
	})
	.superRefine((state, context) => refineCurrentRelationships(state, context));

// The workspace shape versions 5 through 7 all wrote. Versions 6 and 7 changed
// the document and added the table name, so all three share it; version 8 adds
// the two pinned-axis preferences and therefore takes its own copy below, which
// is what the note on this schema has always asked the next change to do.
const persistedWorkspaceV5Schema = persistedWorkspaceV4Schema.extend({
	columnWidths: z.record(z.string().min(1), z.number().positive()),
});

export const persistedStateV5Schema = z
	.object({
		version: z.literal(5),
		document: persistedDocumentV5Schema,
		workspace: persistedWorkspaceV5Schema,
		draft: currentDraftSchema.nullable(),
	})
	.superRefine((state, context) => refineCurrentRelationships(state, context));

const persistedStateV6Shape = {
	document: currentDocumentSchema,
	workspace: persistedWorkspaceV5Schema,
	draft: currentDraftSchema.nullable(),
};

export const persistedStateV6Schema = z
	.object({ version: z.literal(6), ...persistedStateV6Shape })
	.superRefine((state, context) => {
		refineCurrentRelationships(state, context);
	});

const tableNameSchema = z
	.string()
	.min(1)
	.refine((name) => name === name.trim())
	.refine((name) => [...name].length <= MAX_TABLE_NAME_CODE_POINTS);

export const persistedStateV7Schema = z
	.object({
		version: z.literal(7),
		name: tableNameSchema,
		...persistedStateV6Shape,
	})
	.superRefine((state, context) => {
		refineCurrentRelationships(state, context);
	});

// Version 8 records whether the grid pins its first data row and first data
// column. Both are presentation, so they sit beside per-column wrapping in the
// workspace rather than anywhere the document can reach.
const currentWorkspaceSchema = persistedWorkspaceV5Schema.extend({
	pinFirstDataRow: z.boolean(),
	pinFirstDataColumn: z.boolean(),
});

export const persistedStateSchema = z
	.object({
		version: z.literal(PERSISTED_VERSION),
		name: tableNameSchema,
		document: currentDocumentSchema,
		workspace: currentWorkspaceSchema,
		draft: currentDraftSchema.nullable(),
	})
	.superRefine((state, context) => {
		refineCurrentRelationships(state, context);
	});

function refineCurrentRelationships(
	state: {
		readonly workspace: z.infer<typeof persistedWorkspaceV4Schema>;
		readonly draft: z.infer<typeof currentDraftSchema> | null;
	},
	context: z.RefinementCtx,
): void {
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
}

export type PersistedState = z.infer<typeof persistedStateSchema>;
export type PersistedDraft = PersistedState["draft"];
