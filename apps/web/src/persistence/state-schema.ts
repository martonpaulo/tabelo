import { z } from "zod";
import { EXPECTED_COLUMN_TYPES } from "@/core/cell-value";
import { isValidInlineContent } from "@/core/inline-content";
import { MAX_TABLE_NAME_CODE_POINTS } from "@/core/table-name";
import type { InlineContent } from "@/core/types";
import { SPACE_INDICATOR_VALUES } from "@/preferences/contract";
import { workspacePanesTileLayout } from "@/workspace/layout";
import { MAX_PANE_ZOOM, MIN_PANE_ZOOM } from "@/workspace/zoom";

// One table's stored payload. There is one shape, the current one: the
// product is unreleased and has one user, so on 2026-09-20 the owner dropped
// every historical schema, its migration step, and its fixture rather than
// carrying twelve of them forward. A payload this file cannot validate is
// preserved raw and reported, as before.
//
// The rule this replaces still applies from here on: a change to this shape
// ships with the step that carries the previous one into it.
export const PERSISTED_VERSION = 1 as const;

// A number JSON cannot round-trip is not a cell value: `JSON.stringify`
// writes `NaN` and `Infinity` as `null`, which would silently turn a number
// into a different type on the next load. Refusing the payload sends it down
// the recovery path with its bytes intact instead.
const scalarCellValueSchema = z.union([
	z.string(),
	z.number().finite(),
	z.boolean(),
	z.null(),
]);

// Inline content is accepted only in the exact normalized form the core
// defines, so content Tabelo would never write is reported and preserved
// rather than repaired (#306).
const inlineContentSchema = z.custom<InlineContent>(isValidInlineContent);

const columnSchema = z.object({
	id: z.string().min(1),
	header: z.union([z.string(), inlineContentSchema]),
	align: z.enum(["default", "left", "center", "right"]),
	expectedType: z.enum(EXPECTED_COLUMN_TYPES),
});

const documentSchema = z.object({
	columns: z.array(columnSchema).min(1),
	rows: z.array(
		z.object({
			id: z.string().min(1),
			cells: z.record(
				z.string(),
				z.union([scalarCellValueSchema, inlineContentSchema]),
			),
		}),
	),
});

const viewIdSchema = z.enum([
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

// A pane's display keys are overrides of the global default in Settings
// (#276): `null` means the pane follows the default.
const paneSchema = z.object({
	id: z.string().min(1),
	view: viewIdSchema,
	slots: z.array(slotSchema).min(1).max(4),
	// Bounded like the split ratios: a value outside the ladder means the
	// payload was not written by Tabelo, so it is reported rather than coerced.
	zoom: z.number().min(MIN_PANE_ZOOM).max(MAX_PANE_ZOOM),
	wrap: z.boolean().nullable().default(null),
	spaceIndicators: z.enum(SPACE_INDICATOR_VALUES).nullable().default(null),
	tabIndicators: z.boolean().nullable().default(null),
	emptyValueIndicators: z.boolean().nullable().default(null),
	lineBreakIndicators: z.boolean().nullable().default(null),
	alignColumns: z.boolean().nullable().default(null),
	lineBreakTags: z.boolean().nullable().default(null),
});

const workspaceSchema = z.object({
	layout: layoutSchema,
	panes: z.array(paneSchema).min(1).max(4),
	wrappedColumns: z.array(z.string().min(1)).default([]),
	columnWidths: z.record(z.string().min(1), z.number().positive()),
	pinFirstDataRow: z.boolean(),
	pinFirstDataColumn: z.boolean(),
	columnRatio: z.number().min(0.1).max(0.9),
	rowRatio: z.number().min(0.1).max(0.9),
	activePaneId: z.string().min(1),
});

const draftSchema = z.object({
	paneId: z.string().min(1),
	viewId: viewIdSchema,
	text: z.string(),
});

const tableNameSchema = z
	.string()
	.min(1)
	.refine((name) => name === name.trim())
	.refine((name) => [...name].length <= MAX_TABLE_NAME_CODE_POINTS);

export const persistedStateSchema = z
	.object({
		version: z.literal(PERSISTED_VERSION),
		name: tableNameSchema,
		document: documentSchema,
		draft: draftSchema.nullable(),
		workspace: workspaceSchema,
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

		// A pane id is what the active pane, the draft owner, and the pane
		// commands all name, so two panes sharing one is a workspace where those
		// references mean two things at once.
		const paneIds = state.workspace.panes.map((pane) => pane.id);
		if (new Set(paneIds).size !== paneIds.length) {
			context.addIssue({
				code: "custom",
				path: ["workspace", "panes"],
				message: "A workspace cannot give two panes the same id.",
			});
		}

		// The active pane has to be one of them: an id naming no pane leaves the
		// workspace with no pane to focus, act on, or restore a draft into.
		if (!paneIds.includes(state.workspace.activePaneId)) {
			context.addIssue({
				code: "custom",
				path: ["workspace", "activePaneId"],
				message: "The active pane is not present in the workspace.",
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
