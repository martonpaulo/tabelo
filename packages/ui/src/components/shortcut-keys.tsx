import { menuShortcutKeyStyles } from "@tabelo/ui/components/menu-styles";

interface ShortcutKey {
	readonly display: string;
	readonly label: string;
}

function shortcutKeys(shortcut: string): readonly ShortcutKey[] {
	const apple =
		typeof navigator !== "undefined" &&
		/(Mac|iPhone|iPad|iPod)/.test(navigator.platform);
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
						: { display: "⌃", label: "Control" },
				];
			case "Control":
			case "Ctrl":
				return [{ display: "⌃", label: "Control" }];
			case "Alt":
			case "Option":
				return [{ display: "⌥", label: "Option" }];
			case "Shift":
				return [{ display: "⇧", label: "Shift" }];
			case "Backspace":
				return [{ display: "⌫", label: "Backspace" }];
			case "Enter":
			case "Return":
				return [{ display: "↵", label: "Enter" }];
			case "Escape":
			case "Esc":
				return [{ display: "⎋", label: "Escape" }];
			case "Tab":
				return [{ display: "⇥", label: "Tab" }];
			case "Space":
				return [{ display: "␠", label: "Space" }];
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
