// The vertical terms a source editor lays its text out with, as CSS values.
// The editor theme styles CodeMirror with them, and the Settings preview
// reserves its box from them before the editor's code has arrived (#422), so
// they live here, free of CodeMirror, where both can reach them.

// One whole row of the shared `--spacing-content-line-box` rhythm the grid's
// cells and the rendered preview's rows are built from, carried as a line
// height so the text centres inside it exactly as a table cell's text centres
// in its own row. The content and the line-number gutter both use it, which is
// what keeps a number level with its line without either side depending on a
// measurement pass having already run.
export const sourceLineBox = "calc(var(--pane-zoom, 1) * 2rem)";

// The column markers (#368) float over the top of the scroller, which runs the
// pane's full height, so the text starts below them: they publish their height
// as `--tabelo-source-top-inset` while shown. With the strip the text starts
// right under it, as the grid's header row starts right under its letters, so
// every row sits at the same height in every view (owner, 2026-09-19); without
// one, a small inset.
export const sourceTopInset =
	"var(--tabelo-source-top-inset, calc(var(--spacing) * 1.5))";

// The room every pane leaves below its content, which is also the target for
// clicking below the last line to focus the editor.
export const sourceEndRoom = "var(--pane-end-room)";
