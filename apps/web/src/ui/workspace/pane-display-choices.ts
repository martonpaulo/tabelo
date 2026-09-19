import {
	SPACE_INDICATOR_VALUES,
	type SpaceIndicators,
} from "@/preferences/contract";
import { alignsColumns, type ViewDefinition } from "@/views/types";
import {
	INHERIT_SOURCE_DISPLAY,
	type SourceDisplayKey,
	type SourceDisplayOverrides,
} from "@/workspace/source-display";

// A pane's display dialog offers each setting as one segmented choice: follow
// the default, or one of the setting's own values (#276). A radio value is a
// string, and "follow" is stored as `null`, so this module owns the one
// mapping between the two and nothing else translates them.

export const FOLLOW_DEFAULT = "default";

const ON = "on";
const OFF = "off";

type BooleanSegment = typeof ON | typeof OFF;
export type DisplaySegment =
	| typeof FOLLOW_DEFAULT
	| BooleanSegment
	| SpaceIndicators;

// Every setting a pane may override, in the order the defaults are stored.
const SOURCE_DISPLAY_KEYS = Object.keys(
	INHERIT_SOURCE_DISPLAY,
) as readonly SourceDisplayKey[];

// The explicit values a setting offers after its "follow" segment.
export function explicitSegments(
	key: SourceDisplayKey,
): readonly (BooleanSegment | SpaceIndicators)[] {
	return key === "spaceIndicators" ? SPACE_INDICATOR_VALUES : [ON, OFF];
}

// The segment that shows a resolved or overriding value.
export function segmentOf(
	value: SourceDisplayOverrides[SourceDisplayKey],
): DisplaySegment {
	if (value === null) return FOLLOW_DEFAULT;
	if (typeof value === "boolean") return value ? ON : OFF;
	return value;
}

// What choosing a segment stores on the pane. A segment the setting does not
// offer answers `undefined`, so a stray value can never become an override.
export function overrideFromSegment<Key extends SourceDisplayKey>(
	key: Key,
	segment: string,
): SourceDisplayOverrides[Key] | undefined {
	if (segment === FOLLOW_DEFAULT) return null;
	if (key === "spaceIndicators") {
		return (SPACE_INDICATOR_VALUES as readonly string[]).includes(segment)
			? (segment as SourceDisplayOverrides[Key])
			: undefined;
	}
	if (segment === ON) return true as SourceDisplayOverrides[Key];
	if (segment === OFF) return false as SourceDisplayOverrides[Key];
	return undefined;
}

// True while the pane has made no choice of its own.
export function followsEveryDefault(
	overrides: SourceDisplayOverrides,
): boolean {
	return SOURCE_DISPLAY_KEYS.every((key) => overrides[key] === null);
}

// Whether a pane showing this view offers the setting. Every setting reaches
// every text view but the ones a format's own facts decide: alignment belongs
// to the formats that align on screen (#396), so a pane where it would do
// nothing does not offer it.
export function offersSetting(
	key: SourceDisplayKey,
	view: ViewDefinition,
): boolean {
	if (key === "alignColumns") return alignsColumns(view);
	return true;
}
