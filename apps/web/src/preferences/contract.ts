import { z } from "zod";

export const PREFERENCES_STORAGE_KEY = "tabelo.preferences";
export const PREFERENCES_VERSION = 3;

// Which spaces a source view marks. These are the modes VS Code's
// `editor.renderWhitespace` offers, kept by their names, because they are a
// settled and widely understood answer to a question every source editor has
// to ask, and a reader who already knows one of them should not have to learn
// a second vocabulary here. Its `selection` is deliberately not among them: it
// answers nothing until the reader has already selected the text they were
// trying to inspect.
// https://code.visualstudio.com/docs/reference/default-settings
export const SPACE_INDICATOR_VALUES = [
	"none",
	"boundary",
	"trailing",
	"all",
] as const;

// The browser's address bar and task switcher tint, matching the only palette
// the product has. One value rather than a per-theme record: see docs/adr/0010.
export const THEME_COLOR = "#1f1f1f";

export type SpaceIndicators = (typeof SPACE_INDICATOR_VALUES)[number];

// Three independent choices, because they answer three different questions.
// Tabs are a delimiter in TSV, so seeing them is a structural need; the empty
// placeholder reports a value rather than a character; and spaces are the one
// the reader has an opinion about, which is why they get the five modes.
export interface Preferences {
	readonly version: typeof PREFERENCES_VERSION;
	readonly spaceIndicators: SpaceIndicators;
	readonly tabIndicators: boolean;
	readonly emptyValueIndicators: boolean;
}

export const DEFAULT_PREFERENCES: Preferences = {
	version: PREFERENCES_VERSION,
	// A space at the end of a line is the one nobody meant to type. Marking
	// every space instead dots Markdown's alignment padding from edge to edge
	// and answers a question nobody asked, so the noisier mode is offered
	// rather than assumed. VS Code defaults to `selection`; Tabelo shows
	// something without being asked, which is the decision on #55.
	spaceIndicators: "trailing",
	tabIndicators: true,
	emptyValueIndicators: true,
};

const preferencesSchema = z
	.object({
		version: z.literal(PREFERENCES_VERSION),
		spaceIndicators: z.enum(SPACE_INDICATOR_VALUES),
		tabIndicators: z.boolean(),
		emptyValueIndicators: z.boolean(),
	})
	.strict();

// Both older versions carried a `theme`, which version 3 removes: the product
// has one palette and nothing to choose between (docs/adr/0010). Each step
// below reads the key only to accept the payload's shape and then discards it,
// so a reader whose stored theme was `light`, or was corrupt, still keeps every
// display preference they had set. The value is typed as `unknown` rather than
// as the old enum for the same reason: what it said no longer decides anything.
const DISCARDED_THEME = z.unknown();

// Version 1 carried one boolean for every marker at once. Splitting it into
// three was the version 2 change, and it still runs here: a reader who had
// turned the markers off keeps them off, and everyone else lands on the current
// defaults. Forward-only, so version 1 reaches version 3 through this step
// rather than gaining a second direct path.
const version1Schema = z
	.object({
		version: z.literal(1),
		theme: DISCARDED_THEME,
		showWhitespaceIndicators: z.boolean(),
	})
	.strict();

// Version 2 already had the three independent settings and differs from the
// current shape by the theme alone.
const version2Schema = z
	.object({
		version: z.literal(2),
		theme: DISCARDED_THEME,
		spaceIndicators: z.enum(SPACE_INDICATOR_VALUES),
		tabIndicators: z.boolean(),
		emptyValueIndicators: z.boolean(),
	})
	.strict();

function migrateVersion1(value: unknown): Preferences | null {
	const parsed = version1Schema.safeParse(value);
	if (!parsed.success) return null;
	const shown = parsed.data.showWhitespaceIndicators;
	return {
		version: PREFERENCES_VERSION,
		spaceIndicators: shown ? DEFAULT_PREFERENCES.spaceIndicators : "none",
		tabIndicators: shown,
		emptyValueIndicators: shown,
	};
}

function migrateVersion2(value: unknown): Preferences | null {
	const parsed = version2Schema.safeParse(value);
	if (!parsed.success) return null;
	return {
		version: PREFERENCES_VERSION,
		spaceIndicators: parsed.data.spaceIndicators,
		tabIndicators: parsed.data.tabIndicators,
		emptyValueIndicators: parsed.data.emptyValueIndicators,
	};
}

export function validatePreferences(value: unknown): Preferences | null {
	const parsed = preferencesSchema.safeParse(value);
	return parsed.success ? parsed.data : null;
}

// A payload from a version this build does not know is left alone rather than
// guessed at, exactly as the table's own persistence treats one.
export function parseStoredPreferences(raw: string | null): Preferences {
	if (raw === null) return DEFAULT_PREFERENCES;
	try {
		const value: unknown = JSON.parse(raw);
		return (
			validatePreferences(value) ??
			migrateVersion2(value) ??
			migrateVersion1(value) ??
			DEFAULT_PREFERENCES
		);
	} catch {
		return DEFAULT_PREFERENCES;
	}
}

export function serializePreferences(preferences: Preferences): string {
	return JSON.stringify(preferencesSchema.parse(preferences));
}
