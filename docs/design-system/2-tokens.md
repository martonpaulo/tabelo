Part of the [Tabelo Design System](../design-system.md). Its entry point lists every part.

## 2. Tokens

All tokens live in `apps/web/src/index.css`. Product-wide primitives inherit
shadcn's tokens from `packages/ui/src/styles/globals.css`.

### Rule: use tokens and relative units

No hex colours, no `oklch()` outside the token file, and no arbitrary sizes.
Author interface geometry, spacing, radii, typography, and breakpoints in
`rem`; do not write `px` in product CSS or component styles. This keeps the
interface proportional when the user changes the browser's base font size.
Use `rounded-interactive` for controls and `rounded-surface` for panels
and contained or floating surfaces. Structural table geometry stays square. If
you need a value that has no token, that is a pattern break: follow [§0](../design-system.md#0-pattern-break-protocol-read-this-first). The
vendored shadcn primitives under `packages/ui/src/components` keep upstream's
own internal geometry, arbitrary values included, so a future shadcn update
stays a clean merge; the rule binds every file Tabelo authors, including
Tabelo's own modules in that package such as `menu-styles.ts`.
Platform metadata and standalone SVG assets are the narrow exception because
they cannot consume CSS variables; they repeat an existing token exactly and
must never introduce another palette value.

Browser APIs are another boundary exception: pointer coordinates, viewport
fixtures, and raster dimensions are expressed in CSS or image pixels by those
APIs. Convert pointer measurements to `rem` before storing presentation state,
and never treat an API's pixel result as the authored unit or a value worth
pinning in a test.

Tests never turn a visual equality into two bounds around the same target, a
ratio near `1`, `toBeCloseTo`, or matching bounding boxes. Those checks pin the
rendered dimension just as surely as an exact number and provide false
confidence when the visible result is still wrong. Equal geometry has one code
owner through a shared token or component and is inspected in the running app.
Automation is reserved for meaningful thresholds and changes in direction,
including interaction-target minimums, overflow, breakpoints, contrast, and
user-issued resizing.

### Surfaces

| Token | Utility | Use |
| :--- | :--- | :--- |
| `--surface-app` | `bg-surface-app` | The page behind the panes |
| `--surface-panel` | `bg-surface-panel` | A pane's content area |
| `--surface-header` | `bg-surface-header` | Interface chrome such as the grid's column strip. A pane header is not on it: it sits on the pane's own surface with no dividing line, so a pane has two layers, the pane and its content (owner, 2026-09-19) |
| `--surface-code` | `bg-surface-code` | The inset rounded box a source view's text and line numbers sit in (owner, 2026-09-19) |
| `--line-number` | CodeMirror gutter | Source line numbers: the dimmest tone that still reads at 4.5:1 on `--surface-code` |
| `--surface-floating` | `bg-surface-floating` | Menus, tooltips, and dialogs above panes |

Order matters: app is furthest back, interface chrome sits above the panel,
and a pane's content box sits inset in it. Neighbouring surfaces are close in tone on purpose and are not held to a
contrast ratio: they group content, they do not identify a component. A
floating layer is set apart by its own surface and a deep shadow, with a soft
`--line-floating` edge (owner, 2026-09-19). That shadow is one token,
`--shadow-floating`, cast through `floatingSurfaceStyles` by every floating
layer: menus and their submenus, tooltips, dialogs, notices, the start card,
the source editor's diagnostic tooltip, and
the floating action button on hover. A layer that writes its own `shadow-lg`,
`shadow-md`, or ring is a pattern break (owner, 2026-09-19).

The grid has no surface of its own for its header row, its row-number gutter,
or its column letters (owner, 2026-09-19): all of them sit on the content box's
`--surface-code`, and the header row is told apart by its weight and the strong
line under it. Use tones to group related content before adding a line. Every pane's content, editable
or read-only, sits in one `--surface-code` box (owner, 2026-09-19); a read-only
pane says so with a quiet lock in its header whose name and tooltip are "Read-only", not with a tone.

### Lines

| Token | Utility | Use |
| :--- | :--- | :--- |
| `--line-subtle` | `border-line-subtle` | Grid cell borders, control separators |
| `--line-strong` | `border-line-strong` | Boundaries between panes |
| `--line-floating` | `ring-line-floating` | The soft boundary of anything that floats: menus, tooltips, dialogs, notices |
| `--line-pane` | pane edge | A pane's own edge, almost the pane's tone |
| `--active-pane-edge` | active pane edge | The active pane's translucent blue edge |
| `--control-outline` | `border-control-outline` | Unfilled small controls that must remain identifiable against their surface |

Borders are always 0.0625rem. Use them for the table grid, pane boundaries, or an
explicit state. Prefer tonal separation for buttons,
empty states, and pane headers; never use a border to decorate.

**One edge, one stroke.** A rounded surface draws its boundary with a
`border`, never with a `ring`. A ring is a box-shadow painted behind the
element, so the background's own antialiased corner eats into it and the arc
comes out thinner and softer than the straight edges: that is what a badly
drawn corner is. A border is part of the box, the browser computes the inner
and outer radii together, and the corner stays one clean arc. A translucent
surface adds `bg-clip-padding` so its background does not paint under that
border and muddy it.

**A state recolours that stroke; it never adds another.** The active pane's
blue edge is the pane's own border wearing the accent, not a second border
inside it, and it keeps the resting width so activating a pane moves nothing.
Two strokes at slightly different radii is exactly how a corner ends up looking
doubled, which is what the overlay this replaced did.

**A hairline stroke is filled, not stroked.** A 0.0625rem border cannot cover a
whole device pixel along a curve, so on a one-device-pixel display the browser
antialiases the arc down to roughly half the stroke's colour: measured on this
product's menu, the corner came out at 57% of the straight edges, which is what
a corner that looks thin, faded, and low-resolution actually is. Retina hides
it completely, so it has to be measured rather than looked at.

The `tabelo-hairline` utility paints the stroke as the difference between two
filled rounded rectangles, one clipped to the border box and one to the padding
box. The ring between them is filled rather than stroked, and the arc keeps 89%
of its colour at one device pixel and all of it above. It takes two custom
properties, `--hairline-fill` for the surface, which may be translucent, and
`--hairline-color` for the boundary; radius and border width stay the
consumer's. Both are registered with `inherits: false`, so the surface that
uses the utility sets them on itself and nothing inside it can read them: an
inherited value changing on a pane restyled every cell of the grid inside it
(#364, `docs/performance.md`).

`surface-styles.ts` in `packages/ui/src/components/` holds the three
compositions and nothing else does: `floatingSurfaceStyles` for menus,
tooltips, dialogs, and notices; `panelSurfaceStyles` for a pane; and
`activePanelSurfaceStyles`, which changes only the boundary colour. A rounded
surface that needs a boundary composes one of them. Writing `ring-1`, a bare
`border-<colour>`, or a second stroke on a rounded surface is a pattern break,
and a browser test walks the live DOM to catch it.

`--control-outline` carries a contrast floor and is tested for it: it reaches
at least 3:1 against every surface it can appear over, because
[WCAG 1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)
requires that much of anything needed to identify a control. `--line-floating`
carried the same floor until the owner chose soft borders on 2026-09-19: a
menu or dialog is now identified by its lighter surface, its shadow, and its
content, the way comparable editors draw them, and its edge is only a soft
line. `--line-subtle`, `--line-strong`, and `--line-pane` are structure inside
content the user is already looking at and carry no floor either.

### Accent

| Token | Utility | Use |
| :--- | :--- | :--- |
| `--selection-fill` | `bg-selection-fill` | Background of selected cells |
| `--selection-edge` | `border-selection-edge` | The focused cell's mark, focus rings, resize affordance |
| `--text-selection-fill` | CSS selection | Native and source-editor text selection |
| `--primary` / `--primary-foreground` | `bg-primary text-primary-foreground` | The solid accent with a contrast-paired label: the primary decision button, a checked control, and the current find match in every pane |
| `--active-line-fill` | Source editor theme | Current source line without competing with selected text, drawn with its gutter number only in the editor that has focus (owner, 2026-09-19) |

The find match is the one place the solid accent fills a run of text rather than
outlining a control. It earns it: the cell underneath already wears
`--selection-fill`, so a second translucent tint over the first is the weakest
possible way to say "these characters", and the pale tone is reserved for fills
that sit under content rather than replace its ground. The paired foreground is
what keeps the marked characters readable (#144).

The accent family is blue. Use its solid tone only for focus,
selection, and checked or active controls; use the pale tone for hover or
selection fills. Text selection is intentionally stronger than an active line
and is a separate token from structural cell selection, so the two meanings do
not accumulate into a muddy block in dark mode. Ordinary neutral buttons and
links do not become blue merely for decoration.

### Semantic values and syntax

The value palette crosses views for native typed values. JSON scalar literals
and visual-grid number, boolean, and null cells use the same token for the type
the canonical value already carries. A grid string instead uses the same plain
`--foreground` as the editable header row, so ordinary text remains neutral.
The grid asks `cellValueType` for that type and never parses the displayed text:
a string `"1"` stays plain foreground beside the distinct treatment of the
number `1`, in accordance with ADR 0008.

| Token | Utility | Role | Second channel |
| :--- | :--- | :--- | :--- |
| `--value-string` | `text-value-string` | Quoted source strings | Literal shape and normal weight |
| `--value-number` | `text-value-number` | JSON numbers and carried number cells | Tabular numerals; 600 weight in sources only. A grid cell stays at the string weight and is told apart by the value typeface and its accessible type name, because weight in the grid belongs to the header row and a selected axis label (owner, 2026-09-19) |
| `--value-boolean` | `text-value-boolean` | JSON booleans and carried boolean cells | Upright; 600 weight in sources only, the grid cell at the string weight like a number (owner, 2026-09-19) |
| `--value-null` | `text-value-null` | JSON null and carried null cells | Literal shape in sources; grid type presentation also uses italics |
| `--syntax-notation` | `text-syntax-notation` | Escapes, entities, and other notation | Token shape and grammar position |
| `--syntax-tag` | `text-syntax-tag` | HTML element names: a calm lilac of their own, so the notation tone marks only escapes in an HTML pane (owner, 2026-09-19) | Token shape and grammar position |
| `--syntax-punctuation` | (source views only) | Brackets, pipes, separators, the Markdown alignment divider, and markup markers | Grammar position; quieter than every value tone by design |
| `--syntax-link` | `text-syntax-link` | Links, URLs, and autolinks | Underline on the link text and the address shape |

The palette is "A · Quente" (owner, 2026-09-19): string `#b9c98a`, number
`#e8b06f`, boolean `#d49bc0`, null `#8fb3d9`, notation `#e0876a`, link
`#8cc4ff`, and punctuation `#6f6d66`, each written once as a token in the
global stylesheet. Every value, notation, and link tone reaches WCAG AA
contrast (4.5:1) against `--surface-code`, `--surface-panel`, and the
selected-cell composite; on `--surface-code` the lowest is notation at 6.2:1.
Punctuation is the one exception, at 3.2:1: it is structure drawn as
decoration, and the text between the delimiters, never the delimiter's tone,
carries the content. Forced colours replaces every one of these tones with the
system text colour, so each keeps a second channel that survives there: weight
for the header and for numbers and booleans in sources, the underline for
links, and the glyph shape for notation. Close hues also differ by weight, underline,
numeric spacing, or literal shape, so hue is never their only distinction.
These colours describe content, not interaction or status: selection keeps its
blue fill and edge, while the warm warning and destructive band stays reserved
for diagnostics and destructive state.

### Status

| Token | Utility | Meaning |
| :--- | :--- | :--- |
| `--status-warning` | `bg-status-warning` | Source parses with a non-blocking warning |
| `--destructive` | `text-destructive` | Destructive action confirmation |

**Colour never carries meaning alone.** A source diagnostic combines underline
shape with written tooltip text. This is not optional.

**A status colour means only its status** (#53, #287). Syntax highlighting never borrows
one: an escaped pipe or an HTML attribute name is not a source that parsed with
a warning, and lending the amber to either leaves it carrying two meanings at
once. The only status colour the source editor spends is `--status-warning` on
the warning diagnostic's own underline, and `--destructive` on markup the
grammar could not read. See "Syntax and table structure" later in this section.

### Palette

**Tabelo has one palette, and it is dark.** There is no light palette, no theme
preference, and no following of the operating system: the product renders the
same interface whatever `prefers-color-scheme` reports, and no `data-theme`
attribute selects anything. See `docs/adr/0010`.

Two consequences are load-bearing and are not part of that removal:

- `color-scheme: dark` on `:root` is what makes native controls, scrollbars, and
  the caret match the interface. It is the only thing left saying so, so it must
  stay.
- Forced-colours support is untouched. Windows High Contrast is an assistive
  path rather than a palette preference, and the product still answers it.

The browser `theme-color` metadata and the installed application's manifest both
carry the one palette's value, set at build time rather than at runtime.

A contrast or colour decision is made, measured, and screenshotted in that one
interface. There is no second theme to confirm afterwards, which is the point:
what used to be two passes over every visual change is now one.

### Geometry

| Token | Utility | Value |
| :--- | :--- | :--- |
| `--control-h-sm` | `h-control-sm` | 1.75rem: dense toolbars, menu triggers |
| `--control-h-md` | `h-control-md` | 2rem: default compact control height: menu rows, icon buttons |
| `--control-h-lg` | `h-control-lg` | 2.25rem: the default labelled button, a text field, and a textarea's starting height (owner, 2026-09-19) |
| `--panel-header-h` | `h-panel-header` | 2.75rem: every pane header |
| `--index-text-gap` | (none) | 1rem: the gap between a row's number and its text, in a source view's line numbers and the grid's row numbers alike (owner, 2026-09-19) |
| `--grid-gutter-w` | `w-grid-gutter` | 3rem: the row number, a small leading gap, and the whole `--index-text-gap`, so the first cell starts where a source view's text does (owner, 2026-09-19; #288) |
| `--grid-gutter-trailing` | `pr-grid-gutter-trailing` | `--index-text-gap` less a cell's `px-2`: what a grid row number keeps after its digits |
| `--grid-row-h` | `min-h-grid-row` | calc(var(--pane-zoom, 1) * 2rem): minimum table row height |
| `--grid-col-w` | `w-grid-col` | 10.5rem: default column width |
| `--control-radius` | `rounded-interactive` | 0.5rem: buttons, fields, menu items, option blocks, badges |
| `--indicator-radius` | `rounded-indicator` | 0.25rem: a checkbox's 1rem box |
| `--surface-radius` | `rounded-surface` | 0.75rem: panes, menus, dialogs, notices, empty states |

Every height in `packages/ui`'s Button, Input, and Textarea resolves to one of
the three control heights; a primitive writing its own `h-9` or `size-8` is a
pattern break (owner, 2026-09-19). The only exception is the 1.5rem `icon-xs`
button, which sits inside a denser control and is no control height of its
own.

The two radii communicate hierarchy rather than decoration. Grid cells, row or
column headers, resize tracks, and layout glyphs stay square because their
geometry communicates table structure.

Column width is a persisted workspace preference keyed by stable column id,
never table document state or a document-history step (#137). Pointer resize,
keyboard resize, and Fit (#81) share one arithmetic owner: 4.5rem through 64rem,
stored to one sixteenth of a rem. Reordering follows the id, deletion removes
the orphaned preference, and duplication copies the source preference to the
new adjacent id.

### Per-pane content scale

One pane can scale what it displays without touching the rest of the app.

| Token | Utility | Use |
| :--- | :--- | :--- |
| `--pane-zoom` | inline on the pane body | The pane's scale factor, 0.5–2 |
| `--text-content` | `text-content` | Any text that is pane *content* |
| `--text-cell-type-mark` | `text-cell-type-mark` | A compact real-type mark that scales with grid content |
| `--spacing-content-line` | `h-content-line` | A one-line clip box that scales with it |
| `--spacing-content-line-box` | `h-content-line-box` | A line rhythm token shared by grid and source: one row pitch, the same in every view. A grid row's line is drawn inside it, never added to it (owner, 2026-09-19), so a grid row and a source line keep step row for row |
| `--spacing-content-line-inset` | `py-content-line-inset` | Half the box's spare height, above and below a wrapped value |
| `--spacing-inline-image` | `max-h-inline-image` | The tallest an inline image in a cell is drawn, 6rem at 100% (#306) |

`--pane-zoom` is set on the pane body and nowhere else. At 100% both utilities
resolve to exactly `text-sm`, so the default rendering is unchanged.

**A wrapped value is one paragraph** (#374). Its lines follow at
`leading-content-line`, the text's own line height, and the box's spare height
is split once above the first line and once below the last. So its first line
sits where a single-line value would, and its later lines read as the same
value, not as separate rows. The grid's wrapped value, its wrapped header, and
the cell editor all take that layout from one shared class, so opening an
editor moves no text.

**Only content scales.** Pane headers, titles, controls, hit targets, focus
rings, the grid's row-number gutter, and menu text keep their size at every zoom
level: a pane zoomed out must not become harder to operate. Use `text-content`
for table cells, source text, and the rendered preview; use `text-sm` for
everything that frames them.

Do not implement scale as a transform on the pane. That breaks hit testing and
text rendering. Scale the type, and scale measured geometry such as the grid's
column widths in the component that owns it. Zoom is a local preference belonging to
the pane, never document state and never a history step; it is bounded, and
browser zoom remains the way to scale the whole interface. `Mod`+`Alt`+`+` and
`Mod`+`Alt`+`-` step the active pane; `Mod`+`Alt`+`0` resets it. The `Alt` is
load-bearing: `Mod`+`+`, `Mod`+`-`, and `Mod`+`0` belong to the browser and are
never intercepted, because a user pressing them wants the chrome, hit targets,
and focus rings that pane zoom deliberately leaves alone. Decided on #30.

### Syntax and table structure

Every editable source view uses the existing CodeMirror integration for syntax
highlighting. Markdown uses its installed language support with the GFM base,
so the table itself is parsed rather than matched by pattern; HTML uses the
maintained XML stream mode from `@codemirror/legacy-modes`, which returns `<`,
`</`, and `>` as delimiters and the element name on its own, so an opening tag
never renders as a closing one; JSON uses CodeMirror's official JSON language
package. CSV and TSV share a delimiter-aware project-owned `StreamLanguage`,
and Jira and Records use the same small approach, because those grammars are
narrow and domain-specific. Highlighting must preserve source text exactly and
must not become another parser or source of truth.

**The header row is marked in the tokens, never as a band behind a line.** A
line-wide background competed with the selection drawn over it, and it had no
answer for JSON, where the header names are keys repeated inside every record.
So the header treatment travels with the tokens instead: bold at the pane's
plain foreground, weight rather than colour, which keeps it legible in
forced-colour mode and to anyone who cannot separate the two tones. It reaches
one line in Markdown, CSV, TSV, and Jira, including that line's own
delimiters, so an unnamed table still shows which line is the header; the
header portion of each Records field; every key inside every JSON object; and
the contents of each `<th>` in HTML, which is the one format whose grammar
marks no header and therefore gets a narrow project-owned decoration instead.

**Source views draw no row lines** (owner, 2026-09-19, reversing the row
boundaries #296 drew). A source view is code, and a line between table rows
turned it into a grid it is not. The parse still reports where each semantic row
sits (`SourceRowRange`, declared by `mapsSourceRows`); the pinned header (#252)
reads it to find the header row, and nothing draws it.

**The header row stays in sight while the rows scroll** (decided on #252). Once
the first line of a source view's header row has scrolled above the top of the
pane, a copy of that row is pinned there, the way the grid's header row sticks.
Which text is the header comes from the same row mapping as the boundaries
above: the first `SourceRowRange` the parse returns. So the views that declare
`mapsSourceRows` pin it and no other view does; a CSV or TSV header with a
quoted line break is pinned whole; and a draft that does not parse pins
nothing, like it draws no boundaries. The pin ends on the line that holds the
header row's last cell, so Markdown pins its header line and not the alignment
divider the codec counts as part of that row: the divider names no column and
only costs a line of pane height (owner, 2026-09-19, reversing the earlier
choice to pin both). The answer comes from the row's own cell ranges, so it is
still one rule for every format rather than a Markdown-only case. A selection
that covers the header is drawn on the copy too, as the grid's pinned header
row shows one. The copy is a second,
read-only CodeMirror view over the same text with every line outside the
header collapsed, fed the pane's own language, indicators, wrapping, and zoom,
so it is the same rendering rather than a lookalike: the escape glyphs,
whitespace and empty-value markers, and the line-number gutter all line up with
the rows below, and it scrolls sideways with them. It floats over the text
instead of taking room from it, so showing or hiding it never moves a line,
and a caret revealed by scrolling keeps clear of it. It paints the opaque pane
surface, and its bottom edge is the strong line the grid's pinned layers use,
which is also the cue that survives forced colours. It never grows past half
the pane; a taller header is clipped there. The copy is presentation only: it
is inert and hidden from assistive technology, takes no pointer or focus, and
reaches no text, clipboard, download, draft, or history. A press on it goes to
the real header, where the caret lands on the same character, and the real
header is the only one a reader can select, copy, or hear. Where the pane shows
column markers (#368), the copy is pinned directly under their strip.

**Structure recedes, while semantic values and notation stay related across
views** (#269). Syntax highlighting always keeps tokens upright. Italics are reserved
for content the user explicitly marked as emphasis; types, comments, element
names, escapes, entities, annotations, and other grammar indicators never add
italics of their own.
Brackets, pipes, the Markdown alignment divider, and markup markers are all
`--syntax-punctuation`; HTML attribute names and comments stay
`--muted-foreground`. Strings, numbers, booleans, and
null use their cross-view value tokens; element names, escapes, entities, and
links use the notation and link tokens above. These treatments are presentation
only: they do not change grammar, parsing, cell values, or source text. A status
colour is never spent on a token.

**Whitespace, empty values, and escape sequences are annotated, never
written** (#55, #287). The formats Tabelo edits are whitespace-significant and full of
positions that hold a value the user cannot see: a tab and a run of spaces look
alike in TSV, `a,,b` has a middle field, `||a|||b||` is hard to count, and
`&#32;` is five characters standing for one space nobody can spell. Four glyph
families answer that, all of them CodeMirror decorations over unchanged text:
`·` for a space and `→` for a tab, on the per-character marks
`highlightWhitespace()` provides; `empty` where a syntax holds an empty field;
and one glyph over each escape sequence, showing the character the sequence
stands for. The last two are the ones this project draws itself, because no
editor has a concept of a field or of a codec's escaping grammar. The
placeholder appears in every source view, so the preference means one thing
everywhere: between delimiters in Markdown, CSV, TSV, and Jira, after the
separator of a Records line whose value is empty, inside an empty HTML
`<td></td>` or `<th></th>`, and between the quotes of a JSON `""`. It has two
exclusions. A typed literal, JSON's `null`, a number, or a boolean, is a value
the document carries rather than an empty field, and is never marked
(ADR 0008). A Records title whose column name is omitted and whose value is
empty is a blank line, which is also the record separator, so that ambiguous
line is left unmarked rather than guessed at. Decided on #274. The escape glyph
appears in Markdown and Jira, the two formats whose codecs escape reversibly
inside a cell, and for HTML's `<br>`, the one notation the HTML source view
draws.

**An annotation sits below the content, never beside it.** The tab arrow
and the placeholder share one tone, `--muted-foreground` mixed to 40%
strength (lowered from half on #363), never a status colour and never the full text tone: a marker answers a
question the reader has to ask before it matters, so it must be findable when
looked for and ignorable when not. The space dot mixes the same muted tone at
70% and draws at 30% of the character's half-width rather than 22% (owner,
2026-09-19): a dot a few pixels across at the shared strength all but vanished
on a real screen, and a dot is only useful if a run of them can be counted. The escape glyph is the exception, and it is
notation rather than annotation: it wears the same `--syntax-notation` tone as
the syntax token it replaces, because it says the same thing more briefly. Each
is a distinct glyph, so none is told apart from content by colour alone, and the
glyph itself is what survives forced colours where a tone does not. The space
dot is painted as a background inside the character's own box, and the tab arrow
in an absolutely positioned pseudo-element; either way the marker carries no
advance width and the annotated character stays exactly one character wide. The
split is a cost decision: Markdown pads every cell, so a viewport can hold a
thousand marked spaces, and a background is the only one of the two that adds no
box and no text shaping per character. A tab is one span per tab and appears in
quantity only in TSV, so it keeps the glyph. Forced colours is the one place the
split reverses: a background is not painted there at all, so the space dot
returns to a pseudo-element glyph for that mode only, drawn on exactly the
spaces the reader's mode marked. That is what keeps "a distinct glyph survives
forced colours" true of all three markers rather than two. No marker is ever a
text node,
because each is either generated content or a background rather than content at
all: none of them can be read out, copied, downloaded, parsed, or persisted, and
the caret, the selection, and the diagnostic underlines stay measured in the
characters the user typed.

**The placeholder reads as text and is not text.** It sits where the cell's
value would have started and takes the width of the padding it is drawn instead
of, so a reader sees what the field costs. Everything else about it says
otherwise: it holds no document position, the caret steps over it rather than
into it, it cannot be selected or typed through, and it never reaches the text,
the clipboard, a download, or storage.

**An empty field has one caret stop.** The padding around a placeholder would
otherwise offer the caret a place after the opening delimiter, one on each side
of the word, and one before the closing delimiter: four stops in a field that
holds nothing. A lone caret arriving anywhere in an empty field, by key or by
click, lands where the value would start, just before the placeholder, and the
next move in either direction leaves the whole field, delimiter included, and
lands on the neighbouring empty field's stop when there is one. A range being
extended is left alone. The placeholder is sized like a text run rather than
like the line, so the caret beside it is drawn on the text line like every
other caret. Decided on #345.

**An escape sequence is drawn as what it means, in the room it took** (#287).
`&#32;`,
`<br>`, `\|`, `\\`, and `&amp;` are notation the codec had to write, and read as
text they are both unreadable and out of proportion: five characters where the
value is one. Each is replaced by the single character it resolves to, and the
glyph keeps the exact width of the sequence it is drawn instead of, because
Markdown measured and padded its column counting those characters and a narrower
drawing would shift every delimiter after it. The width is stated in the
editor's own character, so it follows the pane's zoom with nothing measuring
anything. What a sequence is comes from the codec that owns the grammar, never
from a pattern the editor matches itself, and a run that only looks like one,
the literal text `&#32;`, stays exactly as written. Whitespace reuses the space
and tab glyphs, and a hover names both the spelling and the character it stands
for, which is the one thing that cannot be drawn there. The glyph itself is
generated content and hidden from assistive technology like every other
annotation, but this is the one replacement that covers characters the file
actually holds rather than padding, so the sequence is kept in the accessible
tree, clipped out of sight: what a screen reader reads is still the source,
exactly and in order.

**A line break inside a cell is one `¶`, one character wide** (owner,
2026-09-19). Every sequence that encodes a line break, Markdown's `<br>` and
`&#10;`, Jira's `\\` and `&#10;`, and HTML's `<br>` (the one notation the HTML
source view draws), is drawn as `¶` in a single character cell. This
supersedes, for this glyph only, the rule above that a glyph keeps the room of
its sequence: the room the sequence gave back is drawn instead as extra padding
at the end of its cell, just before the next delimiter, so in Markdown the pipe
after it stays in the column the serializer measured. Jira and HTML pad
nothing, so there the glyph simply takes one character. JSON and Records spell
a break inside a value as `\n`, and that sequence is drawn as the same `¶`,
one character wide (owner, 2026-09-19: what one view has, every view that can
have it should have); a backslash that is itself escaped starts no sequence,
and every other escape those formats write stays as written. The padding is a
zero-length widget with no text; the file, copy, download, and draft are
unchanged. The caret still treats the sequence as atomic and never lands inside
it: a click on either half of the `¶` places it before or after the sequence.
The same `¶` marks a real newline inside a quoted CSV or TSV field, drawn at
the end of the visual line where the break occurs, because to the reader it is
the same fact about the cell: a codec declares `literalLineBreaks` when its
cells hold their breaks that way, and its own `sourceFields` decide which
newlines are inside a cell, so a newline that ends a row is never marked. One
constant owns the character for the editor, the settings preview, and the
setting's icon. The **Line breaks** display setting decides whether the mark is
drawn at all; with it off, an escaped break shows as written and a quoted one
unmarked. Every other escape glyph is always on: a reader who cannot tell
notation from content has no question a preference would answer.

**The file carries the room, so the file decides the layout.** Markdown pads its
columns for readability, and an empty cell is padded to hold the placeholder,
which is why `core/empty-value.ts` owns the word rather than the copy module:
its length is a fact about the format's output, not only a string on screen. The
column, the divider, and every row are then already the right width, the
placeholder lands inside padding the source already has, and the editor computes
no layout of its own. That padding does not depend on whether the reader has the
indicator switched on, so the bytes are the same either way. The trade is
deliberate and worth naming: a downloaded table reserves that room for an empty
cell whether or not anyone will see a placeholder in it. Where a syntax writes
no padding at all, as `a,,b` does, the placeholder takes the width of the word
itself.

**Formats that pad nothing are aligned on screen** (#396, owner, 2026-09-19).
CSV, TSV, and Jira write each field at its own length, so a source view draws
the padding their files leave out: a zero-length widget with no text after
each field, so every column starts at the same place on every row, as
Markdown's own padding does. Which views do it is the codec's answer, never the
view's: a format that maps its rows (`mapsSourceRows`) and does not pad its
own text (`padsColumns`). Where a column starts comes from those rows, so an
unparsed draft maps none and shows exactly as typed rather than aligned to rows
it no longer has. A column is as wide as its widest field as drawn, in
characters of the monospaced font: a wide character takes two, an empty field
the placeholder's word while that marker is on, a line-break sequence its one
`¶`, and a tab nothing, since the tab after an aligned field reaches the same
stop on every row. Jira's doubled header delimiter is absorbed by padding
drawn at the start of each body line, so its cells and closing pipes line up
too. A quoted CSV or TSV field holding a line break is aligned where it starts;
the lines it continues onto are not padded. The widget sits after the field,
so a caret at a field's end stands against its text, typing there grows the
field before the padding, and arrow keys have no stop inside it; a click on the
padding places the caret at the field's end. The column letters (#368) stand
over the header's cells and therefore over every row's. Text, copy, download,
drafts, history, and persistence are byte-identical with it on or off.
Wrapping turns it off: measured on 2026-09-19 at two 530 px panes, padding that
cannot break moved to a visual line of its own and made lines wrap that fitted
unaligned (CSV 8 to 12 visual lines over 7 rows, Jira 9 to 12 over 6), while
every continuation line stayed out of line anyway.

**Four choices, because they answer four questions.** Tabs are a delimiter, so
seeing them is structural; the placeholder reports a value rather than a
character; a line break inside a cell is the one character that cannot be
shown on its own line; and spaces are the one a reader has an opinion about.
Tabs, the placeholder, and line breaks are each on or off. Spaces take the modes VS Code's
`editor.renderWhitespace` settled on, under its names, so a reader who knows
that setting does not learn a second vocabulary: `none`, `boundary` (runs of
spaces and the spaces at a line's edges), `trailing`, and `all`. Its
`selection` is deliberately absent, because it answers nothing until the reader
has already selected the text they were trying to inspect. Every one but the
line-break mark ships off: a source pane draws nothing until the reader asks,
in Settings or in that pane. This reverses the default #55 set, `trailing`
with tabs and the placeholder on (#276). The line-break mark ships on (owner,
2026-09-19), because without it an escaped break reads as notation and a quoted
one as a new row, which misreads the table rather than leaving a preference
unasked.

**A global default, and a pane that may disagree** (#276). The four
indicators, source wrapping, and column alignment are the six source display
settings. Column alignment ships on (#396), and a pane offers it only where its
format aligns on screen. Markdown's line-break spelling (#397, ADR 0002) is set
the same way, a global default a Markdown pane may override, though it changes
the pane's text rather than a drawing: every Markdown output follows it too. Each has
a global default, set in Settings and kept in the versioned
`tabelo.preferences` payload, and each source pane may override each one,
because a display setting answers a question about one pane's syntax while a
reader who always wants the same answer should say so once. The override is
stored on the pane as a choice, empty while the pane follows the default, and
never as the value it resolved to: changing a default then moves every pane
that has not chosen, at once, and no pane that has, even one that chose the
default's own value. One pure function in the workspace decides which of the
two wins, and every consumer, the source view and the pane menu alike, reads
through it. Non-source panes carry the overrides dormant, so changing a view
back restores the pane as it was. A schema change here gets a migration like
any other. The step that introduced the defaults overwrote the old indicator
values rather than carrying them, because they were written under the
superseded default; a pane that had wrapping on kept it as its own choice, and
one that had it off follows the default. A stored payload that cannot be read,
damaged or written by a newer version, is kept untouched and reported like the
table's: the defaults apply for the session, a change applies without being
written, and only Replace saved settings overwrites it, after copying it to its
recovery key.
CodeMirror's own extensions carry as much of this as they can:
`highlightWhitespace()` supplies the per-character span under every glyph, and
`highlightTrailingWhitespace()` is the whole of the `trailing` mode. Only
`boundary` has no built-in to stand on and is marked here. Which spans exist is
decided by those extensions, and which of them carry a glyph is decided in the
theme, from a class the editor wears and a mark around the qualifying spaces:
one owner for what a marker looks like, and a mode change that repaints without
touching the document. Reconfigure the live editor
through its own compartment, so switching any of them keeps each pane's caret,
selection, draft, local undo history, and wrapping choice exactly as they were.

Source panes scroll horizontally and vertically by default. Soft wrapping is
one of the four source display settings above, never owned by a format, the
document, a draft, or the history timeline. The pane actions menu exposes one
checked `Wrap lines` command for source views: it shows what the pane displays,
and choosing it records the pane's own choice. Reconfigure the live CodeMirror
instance through its wrapping compartment so the caret, selection, draft, and
local undo history survive the change. A newly created pane follows every
default; changing or rearranging a view keeps the pane's own choices.

Every one of the four overrides, the way back to following, and which value a
following pane follows are set in the pane's `Display…` dialog (decided on
#276, option C, owner, 2026-09-19); [§3](3-components.md) owns its anatomy. A
submenu per setting was declined because a choice among states is outside the
submenu class there.

**Structural assistance can always be switched off** (#294). A source view
whose format has a structural-assistance feature (Markdown has three: the
alignment divider, #297, a new row's opening `| ` on Enter at the end of a
row below the divider, with the caret after it, #391, and the padding of the
column being typed in, which grows and shrinks with its widest cell in every
row while the caret stays where the user is typing, #401; Jira has one, a new
row's bare `|` on Enter at the end of the header or a row, #391) shows one checked
`Smart editing` item in its pane actions menu, beside `Wrap lines`. The one
item covers every feature its format declares. Turning it off reconfigures the live
editor through its own compartment: the text, caret, selection, and history
stay exactly as they are, and from then on the buffer is plain text. Turning it
back on rewrites nothing by itself; only the next eligible edit is adjusted
again. The switch belongs to the pane's current buffer and to nothing else: it
creates no history step, is never persisted, and resets to on when the draft is
discarded or superseded, when the pane changes view or closes, and when the
page reloads. A view with no such feature shows no item.

The line-number gutter is its widest number plus one gap, `--spacing` × 3, on
each side (#367). It reserves no minimum width, so it fits one, two, or three
digits at any pane zoom without holding room for digits that are not there.
The trailing gap doubles as the source text's leading space, because the line
itself cannot carry it without leaving a band the selection never paints.

The visual table mirrors structure rather than source punctuation: its header
row is set apart by weight and the strong line under it, while body cells keep
the normal content treatment. Header text position shows
alignment without an extra icon inside the editable cell. A native source
selection must paint over the header treatment just as it does over any other
line.

Cell types are carried from the document and never inferred from visible text
(#200). A number, boolean, or null value uses the dedicated `font-value` token, which
aliases the source monospace stack without making source typography the owner
of grid presentation. Alignment stays independent metadata and never signals a
type. When a real type differs from its column expectation, one compact textual
mark stays inside the cell: `text` for string, `num` for number, `bool` for
boolean, or `null` for null. The word, not its colour, carries the distinction.
It uses the product sans stack at `--text-cell-type-mark`, does not take focus
or pointer events, and shares the cell's scaling, wrapping, selection, copied,
focus, and clipping states. A narrow column may clip the compact mark, while
the full type remains available through the accessible name. Forced-colour mode
keeps the same text treatment.

The column index menu owns one `Expected type` radio group for text, number,
and boolean. Changing it converts the column's cells with it, as one
document-history step: every cell that loses nothing converts at once, and
empty cells stay empty. When any cell cannot follow, the change first asks in
the same dialog shape as Cell type, naming how many cells cannot convert, with
`Cancel` (nothing changes, the expectation included) and `Convert the rest`
(those cells keep their value and show the divergence mark). The dialog opens
after the menu has closed and returns focus to the grid's focused cell; the
rule lives in ADR 0008 (Decided on #392). A data cell's context menu owns the corresponding `Cell type`
radio group for string, number, boolean, and null. A valid different choice is
one explicit conversion and one document-history step. A conversion that the
current value cannot represent stays visible but disabled with its reason. One
that would lose the value it replaces, or invent a boolean for an empty cell,
asks first in a dialog naming the value before, the value after, and what
changing the type back would give; the table and the loss rule live in ADR 0008
(#371). The
group requires exactly one selected data cell and never picks one silently from
a larger or non-contiguous selection.

### Spacing rhythm

Use Tailwind's scale, restricted to: `0.5`, `1`, `1.5`, `2`, `3`, `4`, `6`.
Anything else is a pattern break. Gaps inside a control group are `1` or `1.5`;
padding inside a pane header is `3`; cell padding is `2` horizontal, `1.5`
vertical. The scale stays as written rather than moving to a doubling scale
(`1`, `2`, `4`, `8`): `1.5` and `3` carry the documented cell and pane-header
rhythm on every surface, so a doubling scale would be a redesign, not a
cleanup (owner, 2026-09-18, decided on #354). No linter reads Tailwind classes,
so review enforces it.

The values that were off the scale were snapped to the nearest step (owner,
2026-09-19, option A on #354): an option block and a notice pad `3` on every
side (were `3` by `2.5`), an inset menu row or label starts at `6` (was `7`),
and the offline page pads `6` (was `8`). One Tabelo-authored value stays off
the scale on purpose: a checked menu row's `pr-12` is clearance for the trailing
on/off indicator, not rhythm. Vendored shadcn primitives keep their upstream
values.

**One screen inset.** A floating layer that can grow as wide or as tall as the
window (a dialog, the app menu, the start card) leaves `--screen-inset`, 2rem,
between itself and the screen's edges, 1rem on each side. It is read through
`max-w-screen-fit-w` and `max-h-screen-fit-h` rather than a `calc()` written at
each call site; the app menu used 1.5rem until #354. The start card's
`min(26rem, …)` clamp still spells the same 2rem inline and should read the
token when that file is next touched.

### Where shared style lives

One mechanism per kind of repetition, all already in the stack (#354):

- **A value with no name** (a z-order layer, an inset, a width): a token in
  `apps/web/src/index.css`. A value Tailwind has a theme namespace for goes in
  `@theme` and is used as a normal utility (`h-control-md`, `rounded-surface`);
  one it has none for, such as a z-index, is a custom property read with the
  variable shorthand (`z-(--z-notice)`, `z-(--z-grid-pinned)`).
- **Plain CSS that is one visual idea**: a Tailwind
  [`@utility`](https://tailwindcss.com/docs/adding-custom-styles#adding-custom-utilities)
  in `index.css`, such as `bg-sticky-selection-fill` or `cell-clip`, so it
  takes variants like any utility.
- **A multi-utility cluster that composes with component state**: an exported
  class constant in the `*-styles.ts` modules in `packages/ui/src/components/`
  (`menu-styles.ts`, `surface-styles.ts`, `motion-styles.ts`).
- **A size or tone of one component**: `cva` variants inside that
  `packages/ui` component, as the vendored primitives already declare them.
- **The same markup twice**: compose the existing component, extending its
  props when needed, rather than rewriting its classes. `MenuOption` is the
  one label-and-description text stack for menus and dialogs.

A cluster only earns a name once it repeats as one idea; two elements that
happen to share `flex items-center` do not.

### Typography

Interface text uses Figtree, self-hosted through `@fontsource-variable/figtree` so
no font request leaves the page, then `-apple-system, BlinkMacSystemFont,
"Segoe UI", sans-serif` while it loads. The owner replaced the Microsoft stack
on 2026-09-18, together with the warm neutral palette, because the interface
read as dated; the spreadsheet reference that stack stood for no longer
decides the type. On 2026-09-19 the owner chose Figtree over Inter as the closest open face to the look he approved. The source editor keeps the existing
`ui-monospace`, `SF Mono`, `Cascadia Mono`, `Menlo`, `monospace` stack.

| Role | Classes |
| :--- | :--- |
| Pane title | `text-sm font-medium` |
| Start surface title | `text-xl font-semibold`: the product name on the first-visit surface, the one text above the dialog title |
| Dialog title | `text-lg font-semibold`, owned by the shared `DialogTitle` and never overridden per dialog |
| Dialog section | `text-sm font-medium` |
| Control label | `text-sm font-medium` |
| Nested setting | `text-sm font-normal`: a setting inside a dialog section, and the options it owns |
| Table cell | `text-sm` |
| Native cell value | `text-content font-value` |
| Source editor | `text-sm font-source` |
| Index chrome | `font-index` |
| Helper / status | `text-xs text-muted-foreground` |

Critical control, pane, menu, notice, onboarding, and error labels never fall
below `text-sm` (0.875rem). `text-xs` is reserved for optional descriptions,
shortcuts, file extensions, and secondary status detail. There is no
`text-base` and nothing larger in the product interface, with two exceptions:
the dialog title and the start surface title. Weight alone inside one size was tried on #293 and the steps
were too small to see, so on #352 the title took one size step up. A dialog's
hierarchy is then the `text-lg` semibold title, a medium section title, and
normal-weight settings, with the options a setting owns indented under it, so
no level reads as a peer of the next. A top-level choice in a dialog without
sections keeps the control-label weight. There are no headings
above `h2`: the app has one screen.
