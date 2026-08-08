import {
	detectSystemTheme,
	type EffectiveTheme,
	resolveEffectiveTheme,
	SYSTEM_THEME_QUERY,
	THEME_COLOR_SELECTOR,
	THEME_COLORS,
	type ThemePreference,
} from "./contract";
import { preferencesStore } from "./store";

function setThemeState(
	theme: ThemePreference,
	systemTheme: EffectiveTheme | null,
	document: Document,
): void {
	const root = document.documentElement;
	if (theme === "system") root.removeAttribute("data-theme");
	else root.setAttribute("data-theme", theme);

	const effective = resolveEffectiveTheme(theme, systemTheme);
	document
		.querySelector(THEME_COLOR_SELECTOR)
		?.setAttribute("content", THEME_COLORS[effective]);
}

function systemThemeMedia(): MediaQueryList | null {
	try {
		return typeof window.matchMedia === "function"
			? window.matchMedia(SYSTEM_THEME_QUERY)
			: null;
	} catch {
		return null;
	}
}

function currentSystemTheme(): EffectiveTheme | null {
	const media = systemThemeMedia();
	return detectSystemTheme(media ? () => media : undefined);
}

export function applyThemePreference(
	theme: ThemePreference,
	options: { readonly suppressTransitions?: boolean } = {},
): void {
	const root = document.documentElement;
	if (options.suppressTransitions) {
		root.setAttribute("data-theme-changing", "");
	}
	setThemeState(theme, currentSystemTheme(), document);
	if (options.suppressTransitions) {
		void root.offsetWidth;
		root.removeAttribute("data-theme-changing");
	}
}

export function startThemeRuntime(): () => void {
	const media = systemThemeMedia();
	const applyCommitted = (suppressTransitions: boolean) =>
		applyThemePreference(preferencesStore.getSnapshot().theme, {
			suppressTransitions,
		});

	applyCommitted(false);
	const unsubscribe = preferencesStore.subscribe(() => applyCommitted(true));
	const onSystemThemeChange = () => {
		if (preferencesStore.getSnapshot().theme === "system") {
			applyCommitted(true);
		}
	};
	media?.addEventListener("change", onSystemThemeChange);

	return () => {
		unsubscribe();
		media?.removeEventListener("change", onSystemThemeChange);
	};
}
