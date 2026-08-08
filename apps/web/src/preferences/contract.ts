import { z } from "zod";

export const PREFERENCES_STORAGE_KEY = "tabelo.preferences";
export const PREFERENCES_VERSION = 1;
export const THEME_VALUES = ["system", "light", "dark"] as const;
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

export interface Preferences {
	readonly version: typeof PREFERENCES_VERSION;
	readonly theme: ThemePreference;
	readonly showWhitespaceIndicators: boolean;
}

export const DEFAULT_PREFERENCES: Preferences = {
	version: PREFERENCES_VERSION,
	theme: "system",
	showWhitespaceIndicators: true,
};

const preferencesSchema = z
	.object({
		version: z.literal(PREFERENCES_VERSION),
		theme: z.enum(THEME_VALUES),
		showWhitespaceIndicators: z.boolean(),
	})
	.strict();

export function validatePreferences(value: unknown): Preferences | null {
	const parsed = preferencesSchema.safeParse(value);
	return parsed.success ? parsed.data : null;
}

export function parseStoredPreferences(raw: string | null): Preferences {
	if (raw === null) return DEFAULT_PREFERENCES;
	try {
		return validatePreferences(JSON.parse(raw)) ?? DEFAULT_PREFERENCES;
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
// cannot drift into a second preference schema.
export function createThemeBootstrapScript(): string {
	const config = JSON.stringify({
		storageKey: PREFERENCES_STORAGE_KEY,
		version: PREFERENCES_VERSION,
		themes: THEME_VALUES,
		keys: ["version", "theme", "showWhitespaceIndicators"],
		query: SYSTEM_THEME_QUERY,
		colorSelector: THEME_COLOR_SELECTOR,
		colors: THEME_COLORS,
	});

	return `(()=>{const c=${config};let t="system";try{const r=localStorage.getItem(c.storageKey);if(r!==null){const v=JSON.parse(r);const valid=v!==null&&typeof v==="object"&&Object.keys(v).length===c.keys.length&&c.keys.every((k)=>Object.hasOwn(v,k))&&v.version===c.version&&c.themes.includes(v.theme)&&typeof v.showWhitespaceIndicators==="boolean";if(valid)t=v.theme}}catch{}let s=null;try{if(typeof window.matchMedia==="function")s=window.matchMedia(c.query).matches?"dark":"light"}catch{}const e=t==="system"?(s??"dark"):t;if(t==="system")document.documentElement.removeAttribute("data-theme");else document.documentElement.setAttribute("data-theme",t);const m=document.querySelector(c.colorSelector);if(m)m.setAttribute("content",c.colors[e])})();`;
}
