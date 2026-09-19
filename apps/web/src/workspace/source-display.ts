import type { SourceDisplay } from "@/preferences/contract";

// The settings a source pane may override, named exactly as the global default
// names them so one key addresses both halves.
export type SourceDisplayKey = keyof SourceDisplay;

// A pane's own answer for each setting: a value it chose, or `null` to follow
// the global default. The override is stored as that choice and never as the
// value it resolved to at the time, so a pane that has not overridden a
// setting moves with the default whenever the default changes (#276).
export type SourceDisplayOverrides = {
	readonly [Key in SourceDisplayKey]: SourceDisplay[Key] | null;
};

// What a pane that has chosen nothing carries.
export const INHERIT_SOURCE_DISPLAY: SourceDisplayOverrides = {
	wrap: null,
	spaceIndicators: null,
	tabIndicators: null,
	emptyValueIndicators: null,
	lineBreakIndicators: null,
	alignColumns: null,
};

// The one rule that decides what a source pane shows: its own choice where it
// made one, the global default everywhere else. Every consumer reads through
// this; nothing picks between a preference and an override itself.
export function resolveSourceDisplay(
	defaults: SourceDisplay,
	overrides: SourceDisplayOverrides,
): SourceDisplay {
	return {
		wrap: overrides.wrap ?? defaults.wrap,
		spaceIndicators: overrides.spaceIndicators ?? defaults.spaceIndicators,
		tabIndicators: overrides.tabIndicators ?? defaults.tabIndicators,
		emptyValueIndicators:
			overrides.emptyValueIndicators ?? defaults.emptyValueIndicators,
		lineBreakIndicators:
			overrides.lineBreakIndicators ?? defaults.lineBreakIndicators,
		alignColumns: overrides.alignColumns ?? defaults.alignColumns,
	};
}
