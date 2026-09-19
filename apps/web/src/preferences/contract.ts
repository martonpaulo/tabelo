import { z } from "zod";
import type { PersistenceFailureReason } from "@/persistence/schema";

export const PREFERENCES_STORAGE_KEY = "tabelo.preferences";
// Where an unreadable payload is copied before the user replaces it, beside
// the table's own recovery key and for the same reason.
export const PREFERENCES_RECOVERY_KEY = "tabelo.preferences.recovery";
export const PREFERENCES_VERSION = 5;

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

// How a source view is displayed. Five independent choices: wrapping decides
// how a long line is laid out, and the four indicators answer four different
// questions. Tabs are a delimiter in TSV, so seeing them is a structural need;
// the empty placeholder reports a value rather than a character; a line break
// inside a cell is the one character that cannot be shown on its line; and
// spaces are the one the reader has an opinion about, which is why they get
// four modes.
export interface SourceDisplay {
	readonly wrap: boolean;
	readonly spaceIndicators: SpaceIndicators;
	readonly tabIndicators: boolean;
	readonly emptyValueIndicators: boolean;
	readonly lineBreakIndicators: boolean;
}

// The global default for every source pane's display. A pane may override each
// value on its own; `workspace/source-display.ts` owns the one rule that decides
// which of the two wins.
export interface Preferences extends SourceDisplay {
	readonly version: typeof PREFERENCES_VERSION;
}

// Every default but one is off: a source pane draws nothing and wraps nothing
// until the reader asks, in Settings or in that pane. This supersedes the
// decision on #55, which showed trailing spaces, tabs, and empty values without
// being asked (#276). The line-break mark is the exception and ships on (owner,
// 2026-09-19): without it an escaped break reads as notation and a quoted one
// as a new row, which is misreading the table rather than a matter of taste.
export const DEFAULT_PREFERENCES: Preferences = {
	version: PREFERENCES_VERSION,
	wrap: false,
	spaceIndicators: "none",
	tabIndicators: false,
	emptyValueIndicators: false,
	lineBreakIndicators: true,
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
		lineBreakIndicators: z.boolean(),
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

// Version 4 made the indicators the global default and added wrapping.
const version4Schema = z
	.object({ version: z.literal(4), wrap: z.boolean(), ...indicatorShape })
	.strict();

type Version1 = z.infer<typeof version1Schema>;
type Version2 = z.infer<typeof version2Schema>;
type Version3 = z.infer<typeof version3Schema>;
type Version4 = z.infer<typeof version4Schema>;

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
function migrateVersion3(_value: Version3): Version4 {
	return {
		version: 4,
		wrap: false,
		spaceIndicators: "none",
		tabIndicators: false,
		emptyValueIndicators: false,
	};
}

// Version 5 adds the line-break mark (owner, 2026-09-19). Every choice the
// reader made is carried as it was, and the new setting starts at its
// default, on.
function migrateVersion4(value: Version4): Preferences {
	return {
		...value,
		version: PREFERENCES_VERSION,
		lineBreakIndicators: DEFAULT_PREFERENCES.lineBreakIndicators,
	};
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
	4: { schema: version4Schema, step: migrateVersion4 },
};

function storedVersion(value: unknown): unknown {
	return typeof value === "object" && value !== null && "version" in value
		? value.version
		: undefined;
}

export type PreferencesReadOutcome =
	| { readonly status: "ok"; readonly preferences: Preferences }
	| {
			readonly status: "unreadable";
			readonly reason: PersistenceFailureReason;
	  };

// The current payload, or the result of carrying an older one forward.
// Anything else is unreadable, for the same reasons the table's own
// persistence reports, and that includes a payload an older version wrote
// invalidly: a migration reads the old schema, it does not repair it. A version
// this build does not know is left alone rather than guessed at.
function readPreferences(value: unknown): PreferencesReadOutcome {
	const version = storedVersion(value);
	if (typeof version !== "number" || !Number.isInteger(version)) {
		return { status: "unreadable", reason: "current-schema-invalid" };
	}
	if (version > PREFERENCES_VERSION) {
		return { status: "unreadable", reason: "future-version" };
	}
	const failure: PreferencesReadOutcome = {
		status: "unreadable",
		reason:
			version < PREFERENCES_VERSION
				? "migration-failed"
				: "current-schema-invalid",
	};
	let candidate = value;
	for (;;) {
		const current = validatePreferences(candidate);
		if (current) return { status: "ok", preferences: current };
		const step = storedVersion(candidate);
		const migration = typeof step === "number" ? migrations[step] : undefined;
		if (!migration) return failure;
		const parsed = migration.schema.safeParse(candidate);
		if (!parsed.success) return failure;
		candidate = migration.step(parsed.data as never);
	}
}

export function validatePreferences(value: unknown): Preferences | null {
	const parsed = preferencesSchema.safeParse(value);
	return parsed.success ? parsed.data : null;
}

// Reads the stored bytes without deciding what to do with a failure: the
// store keeps an unreadable payload untouched and reports it, and runs on the
// defaults meanwhile, never writing them over it.
export function readStoredPreferences(raw: string): PreferencesReadOutcome {
	let value: unknown;
	try {
		value = JSON.parse(raw);
	} catch {
		return { status: "unreadable", reason: "invalid-json" };
	}
	return readPreferences(value);
}

export function serializePreferences(preferences: Preferences): string {
	return JSON.stringify(preferencesSchema.parse(preferences));
}
