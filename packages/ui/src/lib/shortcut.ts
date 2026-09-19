import { isApplePlatform } from "@tabelo/ui/lib/platform";

// How a shortcut string splits into the keys it names. The renderer draws one
// `<kbd>` per key and the product's own guard counts them, so both read the
// same tokens: a legend that renders three keys and counts as two would let a
// four-key chord past the limit docs/design-system.md section 9 sets.
//
// `+` is both the separator and a key, so the two literal forms are spelled
// out rather than left to a split that would produce an empty token.
export function shortcutRawKeys(shortcut: string): readonly string[] {
	if (shortcut === "+") return ["+"];
	if (shortcut.endsWith("++")) {
		return [...shortcut.slice(0, -2).split("+"), "+"];
	}
	return shortcut.split("+");
}

// The name each key goes by, and the glyph or word its keyboard prints. The
// names are platform vocabulary rather than product copy, so they live beside
// the tokenizer: the legend speaks them, and product copy that has to name a
// chord in a sentence reads them from here (docs/design-system.md section 8).
interface ShortcutKey {
	readonly display: string;
	readonly label: string;
}

export function shortcutKeys(shortcut: string): readonly ShortcutKey[] {
	// Apple keyboards print the modifiers as glyphs. Windows and Linux
	// keyboards print them as words, and a ⌃ there reads as a stray caret
	// rather than as the Ctrl key the user is looking at.
	const apple = isApplePlatform();

	return shortcutRawKeys(shortcut).flatMap<ShortcutKey>((key) => {
		switch (key) {
			case "Mod":
				return [
					apple
						? { display: "⌘", label: "Command" }
						: { display: "Ctrl", label: "Control" },
				];
			case "Control":
			case "Ctrl":
				return [{ display: apple ? "⌃" : "Ctrl", label: "Control" }];
			case "Alt":
			case "Option":
				return [
					apple
						? { display: "⌥", label: "Option" }
						: { display: "Alt", label: "Alt" },
				];
			case "Shift":
				return [{ display: apple ? "⇧" : "Shift", label: "Shift" }];
			case "Backspace":
				return [{ display: apple ? "⌫" : "Backspace", label: "Backspace" }];
			case "Enter":
			case "Return":
				return [{ display: apple ? "↵" : "Enter", label: "Enter" }];
			case "Escape":
			case "Esc":
				return [{ display: apple ? "⎋" : "Esc", label: "Escape" }];
			case "Tab":
				return [{ display: apple ? "⇥" : "Tab", label: "Tab" }];
			case "Space":
				return [{ display: apple ? "␠" : "Space", label: "Space" }];
			case "ArrowUp":
				return [{ display: "↑", label: "Up arrow" }];
			case "ArrowDown":
				return [{ display: "↓", label: "Down arrow" }];
			case "ArrowLeft":
				return [{ display: "←", label: "Left arrow" }];
			case "ArrowRight":
				return [{ display: "→", label: "Right arrow" }];
			case "+":
				return [{ display: "+", label: "Plus" }];
			case "-":
				return [{ display: "−", label: "Minus" }];
			default:
				return [{ display: key, label: key }];
		}
	});
}

// A chord as a screen reader should say it, "Command plus Option" on Apple
// platforms and "Control plus Alt" elsewhere, never the placeholder "Mod".
export function spokenShortcut(shortcut: string): string {
	return shortcutKeys(shortcut)
		.map((key) => key.label)
		.join(" plus ");
}
