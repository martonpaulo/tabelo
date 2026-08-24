import {
	Decoration,
	type DecorationSet,
	type EditorView,
	highlightTrailingWhitespace,
	MatchDecorator,
	ViewPlugin,
	type ViewUpdate,
} from "@codemirror/view";
import type { SpaceIndicators } from "@/preferences/contract";

// Which spaces are marked is the reader's choice, offered as the modes
// VS Code's `editor.renderWhitespace` settled on, minus its `selection`, which
// asks the reader to make a selection before it answers anything.
//
// Three of the four need nothing written here. `none` marks nothing, `all`
// marks every space, and `trailing` is exactly what CodeMirror's own
// `highlightTrailingWhitespace()` already marks. Only `boundary` has no
// built-in to stand on, so it is the one scope this file describes: a mark
// around the spaces that qualify, which the editor theme then reads to decide
// where a dot is drawn.
//
// Marking rather than drawing is what keeps one owner for the glyph. Nothing
// here says what a space looks like; it only says which spaces are worth
// looking at. `highlightWhitespace()` supplies the per-character spans
// underneath, which is what keeps a run of dots countable.

// The glyphs a source view draws over whitespace. One owner, because the same
// two characters answer the same question in more than one place: the
// per-character indicators here, and the escape-sequence glyphs that stand for
// a space or a tab a format could not write literally.
export const SPACE_GLYPH = "·";
export const TAB_GLYPH = "→";

// The two answers that hold for the whole document arrive as a class on the
// editor rather than as a decoration, because there is nothing to select: every
// tab, or every space.
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

const boundarySpaces = ViewPlugin.fromClass(
	class {
		decorations: DecorationSet;

		constructor(view: EditorView) {
			this.decorations = boundaryMatcher.createDeco(view);
		}

		update(update: ViewUpdate) {
			this.decorations = boundaryMatcher.updateDeco(update, this.decorations);
		}
	},
	{ decorations: (plugin) => plugin.decorations },
);

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
		// CodeMirror's own, wrapping a line's trailing run in `.cm-trailingSpace`.
		// Nothing is written here for it: the built-in already marks exactly the
		// spaces this mode means.
		case "trailing":
			return highlightTrailingWhitespace();
		default:
			return [];
	}
}
