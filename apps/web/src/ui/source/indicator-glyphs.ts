// Kept apart from the CodeMirror extensions so the settings dialog, which
// ships in the main bundle, can show the same glyphs without loading the
// editor.
//
// The glyphs a source view draws over whitespace. One owner, because the same
// characters answer the same question in more than one place: the
// per-character indicators, the settings that switch them, and the
// escape-sequence glyphs that stand for a space or a tab a format could not
// write literally.
export const SPACE_GLYPH = "·";
export const TAB_GLYPH = "→";
// A line break inside a cell, however its format writes it: an escape
// sequence such as `<br>` or `&#10;`, or a real newline inside a quoted CSV
// field (owner, 2026-09-19). The pilcrow is the mark editors have long used
// for a paragraph end, and it is one character wide, so it never pretends to
// be the notation it replaces.
export const LINE_BREAK_GLYPH = "↵";
