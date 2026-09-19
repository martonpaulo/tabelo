import { menuShortcutKeyStyles } from "@tabelo/ui/components/menu-styles";
import { isApplePlatform } from "@tabelo/ui/lib/platform";
import { shortcutKeys, spokenShortcut } from "@tabelo/ui/lib/shortcut";

export function ShortcutKeys({ shortcut }: { readonly shortcut: string }) {
	const keys = shortcutKeys(shortcut);
	return (
		<>
			<span className="sr-only">{spokenShortcut(shortcut)}</span>
			<kbd aria-hidden className={menuShortcutKeyStyles}>
				{keys.map((key) => key.display).join(isApplePlatform() ? "" : "+")}
			</kbd>
		</>
	);
}
