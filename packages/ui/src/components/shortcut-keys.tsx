import { menuShortcutKeyStyles } from "@tabelo/ui/components/menu-styles";
import { isApplePlatform } from "@tabelo/ui/lib/platform";
import {
	type ShortcutKeyLabels,
	shortcutKeys,
	spokenShortcut,
} from "@tabelo/ui/lib/shortcut";
import { createContext, type ReactNode, useContext } from "react";

// Key names are product copy, so `packages/ui` carries no table of its own:
// the application provides one once at its root. There is deliberately no
// default, so a legend rendered outside the provider fails at once instead of
// speaking a second, unreviewed vocabulary.
const ShortcutKeyLabelsContext = createContext<ShortcutKeyLabels | null>(null);

export function ShortcutKeyLabelsProvider({
	labels,
	children,
}: {
	readonly labels: ShortcutKeyLabels;
	readonly children: ReactNode;
}) {
	return (
		<ShortcutKeyLabelsContext.Provider value={labels}>
			{children}
		</ShortcutKeyLabelsContext.Provider>
	);
}

function useShortcutKeyLabels(): ShortcutKeyLabels {
	const labels = useContext(ShortcutKeyLabelsContext);
	if (!labels) {
		throw new Error(
			"ShortcutKeys rendered outside ShortcutKeyLabelsProvider: provide the key labels at the application root.",
		);
	}
	return labels;
}

export function ShortcutKeys({ shortcut }: { readonly shortcut: string }) {
	const labels = useShortcutKeyLabels();
	const keys = shortcutKeys(shortcut, labels);
	return (
		<>
			<span className="sr-only">{spokenShortcut(shortcut, labels)}</span>
			<kbd aria-hidden className={menuShortcutKeyStyles}>
				{keys.map((key) => key.display).join(isApplePlatform() ? "" : "+")}
			</kbd>
		</>
	);
}
