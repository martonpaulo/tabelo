import {
	Decoration,
	type DecorationSet,
	type EditorView,
	MatchDecorator,
	ViewPlugin,
	type ViewUpdate,
} from "@codemirror/view";
import type { SpaceIndicators } from "@/preferences/contract";

// Which spaces are marked is the reader's choice, offered as the modes
// VS Code's `editor.renderWhitespace` settled on, minus its `selection`, which
// asks the reader to make a selection before it answers anything. Two of the
// rest need no scope at all: `none` marks nothing and `all` marks every space.
// The other two wrap the spaces that qualify in one shared class, which the
// editor theme then uses to decide where a dot is drawn.
//
// Marking rather than drawing is what keeps one owner for the glyph. These
// plugins never say what a space looks like; they only say which spaces are
// worth looking at. `highlightWhitespace()` supplies the per-character spans
// underneath, which is what keeps a run of dots countable.

// The two answers that hold for the whole document arrive as a class on the
// editor rather than as a decoration, because there is nothing to select: every
// tab, or every space. The theme reads all three of these.
export const TAB_INDICATOR_CLASS = "cm-tabeloTabs";
export const ALL_SPACES_CLASS = "cm-tabeloAllSpaces";
export const SPACE_SCOPE_CLASS = "cm-tabeloSpaceScope";

const scopeDecoration = Decoration.mark({ class: SPACE_SCOPE_CLASS });

// VS Code's `boundary`: every space except a single one between words. What is
// left is exactly the whitespace that carries meaning in a table source, the
// padding around a value and the runs nobody can count by eye.
const boundaryMatcher = new MatchDecorator({
	regexp: / {2,}|^ +| +$/g,
	decoration: scopeDecoration,
});

// VS Code's `trailing`: the spaces after the last thing on a line. Matched
// here rather than taken from `highlightTrailingWhitespace()`, so both scoped
// modes reach the theme through one class, and so a trailing tab keeps
// answering to the tab switch instead of this one.
const trailingMatcher = new MatchDecorator({
	regexp: / +$/g,
	decoration: scopeDecoration,
});

function matchedSpaces(matcher: MatchDecorator) {
	return ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;

			constructor(view: EditorView) {
				this.decorations = matcher.createDeco(view);
			}

			update(update: ViewUpdate) {
				this.decorations = matcher.updateDeco(update, this.decorations);
			}
		},
		{ decorations: (plugin) => plugin.decorations },
	);
}

const boundarySpaces = matchedSpaces(boundaryMatcher);
const trailingSpaces = matchedSpaces(trailingMatcher);

// The classes the editor carries for the choices that need no scope.
export function indicatorClasses(
	spaces: SpaceIndicators,
	tabs: boolean,
): string {
	return [
		tabs ? TAB_INDICATOR_CLASS : "",
		spaces === "all" ? ALL_SPACES_CLASS : "",
	]
		.filter(Boolean)
		.join(" ");
}

// The scope extension for a mode, or nothing where the mode needs none: `none`
// because no space qualifies, and `all` because every space does. Both of those
// are settled by the class above instead.
export function spaceScope(mode: SpaceIndicators) {
	switch (mode) {
		case "boundary":
			return boundarySpaces;
		case "trailing":
			return trailingSpaces;
		default:
			return [];
	}
}
