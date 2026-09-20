import { z } from "zod";
import type { PersistenceFailureReason } from "@/persistence/schema";

export const PREFERENCES_STORAGE_KEY = "tabelo.preferences";
// Where an unreadable payload is copied before the user replaces it, beside
// the table's own recovery key and for the same reason.
export const PREFERENCES_RECOVERY_KEY = "tabelo.preferences.recovery";
export const PREFERENCES_VERSION = 1;

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

// How a source view is displayed. Six independent choices: wrapping decides
// how a long line is laid out, alignment decides whether the columns of a
// format that does not pad its own text line up on screen, and the four
// indicators answer four different
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
	readonly alignColumns: boolean;
	// How Markdown spells a line break inside a cell (#397): the character
	// reference `&#10;` by default, `<br>` when this is on. Unlike the others it
	// changes the text a Markdown pane and every Markdown output hold, never
	// what the table is; the parser reads both whatever is chosen.
	readonly lineBreakTags: boolean;
}

// The global default for every source pane's display. A pane may override each
// value on its own; `workspace/source-display.ts` owns the one rule that decides
// which of the two wins.
export interface Preferences extends SourceDisplay {
	readonly version: typeof PREFERENCES_VERSION;
}

// Every default but two is off: a source pane draws nothing and wraps nothing
// until the reader asks, in Settings or in that pane. This supersedes the
// decision on #55, which showed trailing spaces, tabs, and empty values without
// being asked (#276). The line-break mark is one exception and ships on (owner,
// 2026-09-19): without it an escaped break reads as notation and a quoted one
// as a new row, which is misreading the table rather than a matter of taste.
// Column alignment is the other (owner, 2026-09-19, #396): a table whose
// columns do not line up reads as text rather than as a table.
export const DEFAULT_PREFERENCES: Preferences = {
	version: PREFERENCES_VERSION,
	wrap: false,
	spaceIndicators: "none",
	tabIndicators: false,
	emptyValueIndicators: false,
	lineBreakIndicators: true,
	alignColumns: true,
	lineBreakTags: false,
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
		alignColumns: z.boolean(),
		lineBreakTags: z.boolean(),
	})
	.strict();

function storedVersion(value: unknown): unknown {
	return typeof value === "object" && value !== null && "version" in value
		? (value as { version: unknown }).version
		: undefined;
}

export type PreferencesReadOutcome =
	| { readonly status: "ok"; readonly preferences: Preferences }
	| {
			readonly status: "unreadable";
			readonly reason: PersistenceFailureReason;
	  };

// The current payload, and nothing else. Older shapes were dropped with the
// table's own historical schemas (owner, 2026-09-20): an unreadable payload
// is preserved raw and reported, as it always was. A version this build does
// not know is left alone rather than guessed at.
function readPreferences(value: unknown): PreferencesReadOutcome {
	const version = storedVersion(value);
	if (typeof version !== "number" || !Number.isInteger(version)) {
		return { status: "unreadable", reason: "current-schema-invalid" };
	}
	if (version > PREFERENCES_VERSION) {
		return { status: "unreadable", reason: "future-version" };
	}
	const current = validatePreferences(value);
	return current
		? { status: "ok", preferences: current }
		: { status: "unreadable", reason: "current-schema-invalid" };
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
