import { z } from "zod";

export const PREFERENCES_STORAGE_KEY = "tabelo.preferences";
export const PREFERENCES_VERSION = 2;
export const THEME_VALUES = ["system", "light", "dark"] as const;

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
export const SYSTEM_THEME_QUERY = "(prefers-color-scheme: dark)";
export const THEME_COLOR_SELECTOR = "meta[data-tabelo-theme-color]";
export const THEME_COLORS = {
	light: "#f0f0f0",
	dark: "#1f1f1f",
} as const;

export type ThemePreference = (typeof THEME_VALUES)[number];
export type EffectiveTheme = Exclude<ThemePreference, "system">;
export type SystemThemeMatcher = (query: string) => {
	readonly matches: boolean;
};

export type SpaceIndicators = (typeof SPACE_INDICATOR_VALUES)[number];

// Three independent choices, because they answer three different questions.
// Tabs are a delimiter in TSV, so seeing them is a structural need; the empty
// placeholder reports a value rather than a character; and spaces are the one
// the reader has an opinion about, which is why they get the five modes.
export interface Preferences {
	readonly version: typeof PREFERENCES_VERSION;
	readonly theme: ThemePreference;
	readonly spaceIndicators: SpaceIndicators;
	readonly tabIndicators: boolean;
	readonly emptyValueIndicators: boolean;
}

export const DEFAULT_PREFERENCES: Preferences = {
	version: PREFERENCES_VERSION,
	theme: "system",
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
		theme: z.enum(THEME_VALUES),
		spaceIndicators: z.enum(SPACE_INDICATOR_VALUES),
		tabIndicators: z.boolean(),
		emptyValueIndicators: z.boolean(),
	})
	.strict();

// Version 1 carried one boolean for every marker at once. Splitting it into
// three is a schema change, so it gets a migration rather than a silent reset:
// a reader who had turned the markers off keeps them off, and everyone else
// lands on the current defaults. Forward-only, and the only step there is.
const version1Schema = z
	.object({
		version: z.literal(1),
		theme: z.enum(THEME_VALUES),
		showWhitespaceIndicators: z.boolean(),
	})
	.strict();

function migrateVersion1(value: unknown): Preferences | null {
	const parsed = version1Schema.safeParse(value);
	if (!parsed.success) return null;
	const shown = parsed.data.showWhitespaceIndicators;
	return {
		version: PREFERENCES_VERSION,
		theme: parsed.data.theme,
		spaceIndicators: shown ? DEFAULT_PREFERENCES.spaceIndicators : "none",
		tabIndicators: shown,
		emptyValueIndicators: shown,
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

export function resolveEffectiveTheme(
	theme: ThemePreference,
	systemTheme: EffectiveTheme | null,
): EffectiveTheme {
	return theme === "system" ? (systemTheme ?? "dark") : theme;
}

export function detectSystemTheme(
	matchMedia: SystemThemeMatcher | undefined,
): EffectiveTheme | null {
	if (matchMedia === undefined) return null;
	try {
		return matchMedia(SYSTEM_THEME_QUERY).matches ? "dark" : "light";
	} catch {
		return null;
	}
}

// Vite injects this generated script into the head before styles can paint.
// Its literals come from the same contract as the runtime reader, so startup
// cannot drift into a second preference schema: the shapes below are read off
// the schemas themselves rather than retyped.
//
// Every shipped version is listed, not only the current one. The script exists
// to place the theme before the first paint, `theme` means the same thing in
// each version, and refusing an older payload here would flash the wrong
// palette at exactly the reader whose preference the migration is about to
// honour.
export function createThemeBootstrapScript(): string {
	const config = JSON.stringify({
		storageKey: PREFERENCES_STORAGE_KEY,
		themes: THEME_VALUES,
		shapes: [
			{
				version: PREFERENCES_VERSION,
				keys: Object.keys(preferencesSchema.shape),
			},
			{ version: 1, keys: Object.keys(version1Schema.shape) },
		],
		query: SYSTEM_THEME_QUERY,
		colorSelector: THEME_COLOR_SELECTOR,
		colors: THEME_COLORS,
	});

	return `(()=>{const c=${config};let t="system";try{const r=localStorage.getItem(c.storageKey);if(r!==null){const v=JSON.parse(r);if(v!==null&&typeof v==="object"){const p=c.shapes.find((q)=>q.version===v.version);const valid=p!==undefined&&Object.keys(v).length===p.keys.length&&p.keys.every((k)=>Object.hasOwn(v,k))&&c.themes.includes(v.theme);if(valid)t=v.theme}}}catch{}let s=null;try{if(typeof window.matchMedia==="function")s=window.matchMedia(c.query).matches?"dark":"light"}catch{}const e=t==="system"?(s??"dark"):t;if(t==="system")document.documentElement.removeAttribute("data-theme");else document.documentElement.setAttribute("data-theme",t);const m=document.querySelector(c.colorSelector);if(m)m.setAttribute("content",c.colors[e])})();`;
}
