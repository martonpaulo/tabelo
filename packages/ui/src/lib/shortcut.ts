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
