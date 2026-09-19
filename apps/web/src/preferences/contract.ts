import { z } from "zod";

export const PREFERENCES_STORAGE_KEY = "tabelo.preferences";
export const PREFERENCES_VERSION = 4;

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
export const THEME_COLOR = "#1c1c1b";

export type SpaceIndicators = (typeof SPACE_INDICATOR_VALUES)[number];

// How a source view is displayed. Four independent choices: wrapping decides
// how a long line is laid out, and the three indicators answer three different
// questions. Tabs are a delimiter in TSV, so seeing them is a structural need;
// the empty placeholder reports a value rather than a character; and spaces are
// the one the reader has an opinion about, which is why they get four modes.
export interface SourceDisplay {
	readonly wrap: boolean;
	readonly spaceIndicators: SpaceIndicators;
	readonly tabIndicators: boolean;
	readonly emptyValueIndicators: boolean;
}

// The global default for every source pane's display. A pane may override each
// value on its own; `workspace/source-display.ts` owns the one rule that decides
// which of the two wins.
export interface Preferences extends SourceDisplay {
	readonly version: typeof PREFERENCES_VERSION;
}

// Every default is off: a source pane draws nothing and wraps nothing until the
// reader asks, in Settings or in that pane. This supersedes the decision on
// #55, which showed trailing spaces, tabs, and empty values without being
// asked (#276).
export const DEFAULT_PREFERENCES: Preferences = {
	version: PREFERENCES_VERSION,
	wrap: false,
	spaceIndicators: "none",
	tabIndicators: false,
	emptyValueIndicators: false,
};

const indicatorShape = {
	spaceIndicators: z.enum(SPACE_INDICATOR_VALUES),
	tabIndicators: z.boolean(),
	emptyValueIndicators: z.boolean(),
};

const preferencesSchema = z
	.object({
		version: z.literal(PREFERENCES_VERSION),
		wrap: z.boolean(),
		...indicatorShape,
	})
	.strict();

// Every shipped version keeps its own schema and one forward-only step to the
// next version. A payload is validated against the schema of the version it
// claims and then carried one step at a time, so no version gains a second,
// direct path to the current shape.

// Versions 1 and 2 carried a `theme`, which version 3 removed: the product has
// one palette and nothing to choose between (docs/adr/0010). The key is read
// only to accept the payload's shape, so it is typed as `unknown` rather than
// as the old enum: what it said no longer decides anything.
const DISCARDED_THEME = z.unknown();

// Version 1 carried one boolean for every marker at once.
const version1Schema = z
	.object({
		version: z.literal(1),
		theme: DISCARDED_THEME,
		showWhitespaceIndicators: z.boolean(),
	})
	.strict();

// Version 2 split that boolean into the three independent settings.
const version2Schema = z
	.object({ version: z.literal(2), theme: DISCARDED_THEME, ...indicatorShape })
	.strict();

// Version 3 differs from version 2 by the theme alone.
const version3Schema = z
	.object({ version: z.literal(3), ...indicatorShape })
	.strict();

type Version1 = z.infer<typeof version1Schema>;
type Version2 = z.infer<typeof version2Schema>;
type Version3 = z.infer<typeof version3Schema>;

// The single marker choice, split the way version 2 shipped it: a reader who
// had markers on received that version's space default, `trailing`.
function migrateVersion1(value: Version1): Version2 {
	const shown = value.showWhitespaceIndicators;
	return {
		version: 2,
		theme: value.theme,
		spaceIndicators: shown ? "trailing" : "none",
		tabIndicators: shown,
		emptyValueIndicators: shown,
	};
}

function migrateVersion2({ theme: _discarded, ...value }: Version2): Version3 {
	return { ...value, version: 3 };
}

// Version 4 turns the three indicators from the setting into the global
// default, adds wrapping beside them, and ships every default off (#276). The
// stored values are overwritten rather than carried: they were written while
// the product showed markers without being asked, and keeping them would keep
// that superseded decision alive for every reader who never touched it. The
// cost is deliberate: a reader who had chosen markers chooses them once more.
function migrateVersion3(_value: Version3): Preferences {
	return DEFAULT_PREFERENCES;
}

interface PreferencesMigration {
	readonly schema: z.ZodType;
	readonly step: (value: never) => unknown;
}

// Keyed by the version each step reads.
const migrations: Readonly<Partial<Record<number, PreferencesMigration>>> = {
	1: { schema: version1Schema, step: migrateVersion1 },
	2: { schema: version2Schema, step: migrateVersion2 },
	3: { schema: version3Schema, step: migrateVersion3 },
};

function storedVersion(value: unknown): unknown {
	return typeof value === "object" && value !== null && "version" in value
		? value.version
		: undefined;
}

// The current payload, or the result of carrying an older one forward. Null
// for anything else, including a payload an older version wrote invalidly: a
// migration reads the old schema, it does not repair it.
function readPreferences(value: unknown): Preferences | null {
	let candidate = value;
	for (;;) {
		const current = validatePreferences(candidate);
		if (current) return current;
		const version = storedVersion(candidate);
		const migration =
			typeof version === "number" ? migrations[version] : undefined;
		if (!migration) return null;
		const parsed = migration.schema.safeParse(candidate);
		if (!parsed.success) return null;
		candidate = migration.step(parsed.data as never);
	}
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
		return readPreferences(JSON.parse(raw)) ?? DEFAULT_PREFERENCES;
	} catch {
		return DEFAULT_PREFERENCES;
	}
}

export function serializePreferences(preferences: Preferences): string {
	return JSON.stringify(preferencesSchema.parse(preferences));
}
