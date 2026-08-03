import { menuShortcutKeyStyles } from "@tabelo/ui/components/menu-styles";
import { isApplePlatform } from "@tabelo/ui/lib/platform";

interface ShortcutKey {
	readonly display: string;
	readonly label: string;
}

function shortcutKeys(shortcut: string): readonly ShortcutKey[] {
	// Apple keyboards print the modifiers as glyphs. Windows and Linux
	// keyboards print them as words, and a ⌃ there reads as a stray caret
	// rather than as the Ctrl key the user is looking at.
	const apple = isApplePlatform();
	const rawKeys =
		shortcut === "+"
			? ["+"]
			: shortcut.endsWith("++")
				? [...shortcut.slice(0, -2).split("+"), "+"]
				: shortcut.split("+");

	return rawKeys.flatMap<ShortcutKey>((key) => {
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

export function ShortcutKeys({ shortcut }: { readonly shortcut: string }) {
	const keys = shortcutKeys(shortcut);
	return (
		<>
			<span className="sr-only">
				{keys.map((key) => key.label).join(" plus ")}
			</span>
			{keys.map((key, index) => (
				<kbd
					aria-hidden
					className={menuShortcutKeyStyles}
					key={`${key.label}-${index}`}
				>
					{key.display}
				</kbd>
			))}
		</>
	);
}
