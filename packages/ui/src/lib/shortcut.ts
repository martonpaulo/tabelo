import { isApplePlatform } from "@tabelo/ui/lib/platform";

// How a shortcut string splits into the keys it names. The renderer draws one
// `<kbd>` per key and the product's own guard counts them, so both read the
// same tokens: a legend that renders three keys and counts as two would let a
// four-key chord past the limit docs/design-system/9-accessibility.md sets.
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

// Every word a legend needs: the name a screen reader says for each key, the
// word a Windows or Linux keyboard prints on it, and what joins spoken keys.
// They are product copy, so the application supplies them from its copy
// module and `packages/ui` keeps no table of its own. Only the tokenizer and
// the glyphs, which are symbols rather than language, live here
// (docs/design-system.md section 8).
export interface ShortcutKeyLabels {
	readonly spoken: {
		readonly command: string;
		readonly control: string;
		readonly option: string;
		readonly alt: string;
		readonly shift: string;
		readonly backspace: string;
		readonly enter: string;
		readonly escape: string;
		readonly tab: string;
		readonly space: string;
		readonly upArrow: string;
		readonly downArrow: string;
		readonly leftArrow: string;
		readonly rightArrow: string;
		readonly plus: string;
		readonly minus: string;
	};
	// Where an Apple keyboard prints a glyph, the others print these words.
	readonly printed: {
		readonly control: string;
		readonly alt: string;
		readonly shift: string;
		readonly backspace: string;
		readonly enter: string;
		readonly escape: string;
		readonly tab: string;
		readonly space: string;
	};
	// Between spoken keys, as in "Command plus Option".
	readonly spokenJoiner: string;
}

// The name each key goes by, and the glyph or word its keyboard prints.
interface ShortcutKey {
	readonly display: string;
	readonly label: string;
}

export function shortcutKeys(
	shortcut: string,
	labels: ShortcutKeyLabels,
): readonly ShortcutKey[] {
	// Apple keyboards print the modifiers as glyphs. Windows and Linux
	// keyboards print them as words, and a ⌃ there reads as a stray caret
	// rather than as the Ctrl key the user is looking at.
	const apple = isApplePlatform();
	const { spoken, printed } = labels;

	return shortcutRawKeys(shortcut).flatMap<ShortcutKey>((key) => {
		switch (key) {
			case "Mod":
				return [
					apple
						? { display: "⌘", label: spoken.command }
						: { display: printed.control, label: spoken.control },
				];
			case "Control":
			case "Ctrl":
				return [
					{ display: apple ? "⌃" : printed.control, label: spoken.control },
				];
			case "Alt":
			case "Option":
				return [
					apple
						? { display: "⌥", label: spoken.option }
						: { display: printed.alt, label: spoken.alt },
				];
			case "Shift":
				return [{ display: apple ? "⇧" : printed.shift, label: spoken.shift }];
			case "Backspace":
				return [
					{
						display: apple ? "⌫" : printed.backspace,
						label: spoken.backspace,
					},
				];
			case "Enter":
			case "Return":
				return [{ display: apple ? "↵" : printed.enter, label: spoken.enter }];
			case "Escape":
			case "Esc":
				return [
					{ display: apple ? "⎋" : printed.escape, label: spoken.escape },
				];
			case "Tab":
				return [{ display: apple ? "⇥" : printed.tab, label: spoken.tab }];
			case "Space":
				return [{ display: apple ? "␠" : printed.space, label: spoken.space }];
			case "ArrowUp":
				return [{ display: "↑", label: spoken.upArrow }];
			case "ArrowDown":
				return [{ display: "↓", label: spoken.downArrow }];
			case "ArrowLeft":
				return [{ display: "←", label: spoken.leftArrow }];
			case "ArrowRight":
				return [{ display: "→", label: spoken.rightArrow }];
			case "+":
				return [{ display: "+", label: spoken.plus }];
			case "-":
				return [{ display: "−", label: spoken.minus }];
			default:
				return [{ display: key, label: key }];
		}
	});
}

// A chord as a screen reader should say it, "Command plus Option" on Apple
// platforms and "Control plus Alt" elsewhere, never the placeholder "Mod".
export function spokenShortcut(
	shortcut: string,
	labels: ShortcutKeyLabels,
): string {
	return shortcutKeys(shortcut, labels)
		.map((key) => key.label)
		.join(labels.spokenJoiner);
}
