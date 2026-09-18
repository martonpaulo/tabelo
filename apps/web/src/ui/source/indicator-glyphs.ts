// Kept apart from the CodeMirror extensions so the settings dialog, which
// ships in the main bundle, can show the same glyphs without loading the
// editor.
//
// The glyphs a source view draws over whitespace. One owner, because the same
// two characters answer the same question in more than one place: the
// per-character indicators, the settings that switch them, and the
// escape-sequence glyphs that stand for
// a space or a tab a format could not write literally.
export const SPACE_GLYPH = "·";
export const TAB_GLYPH = "→";
