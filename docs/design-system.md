# Tabelo Design System

The binding rules for how Tabelo looks and behaves. This document is normative:
if code and this file disagree, one of them is a defect.

Read this before writing or changing any UI.

---

## 0. Pattern-break protocol: read this first

**Committing to one design line matters more than any individual improvement.**
There is always a prettier layout, a nicer colour, a more interesting control.
Chasing them is what destroys consistency, so the answer is no by default.

Before you write UI, check whether a pattern for it already exists: in this
document, then in `apps/web/src/ui/primitives/`, then in `packages/ui`.

**If a pattern exists, use it.** Do not build a local variant because the
existing one is "almost" right. Extend the shared component instead.

**If no pattern exists, or the existing one genuinely does not fit, stop.** Do
not invent one silently and do not force the current one. Report to the user:

1. what you are building and where it will live;
2. the closest existing pattern, and precisely why it does not fit;
3. the new pattern you propose, with its tokens and states;
4. what else would need to change if this new pattern is adopted;
5. your recommendation: extend the existing pattern, or add a new one.

Then wait for a decision. Once decided, record it here in the same edit that
introduces the code.

**Also report, do not silently fix, when you find an existing pattern break**:
a raw hex value, a one-off spacing, a control that does not match its family, a
second way of doing something this document already covers. Say what it is,
where, and which rule it breaks. Fixing it may be out of scope for the current
task; deciding that is the user's call, not yours.

---

## 1. The design line

Tabelo is a **calm, compact, neutral table utility**. It follows the shadcn
`base-lyra` style already configured in `packages/ui/components.json` without
importing card-heavy dashboard styling.

The neutral palette, system sans-serif stack, and 0.25rem/0.5rem radius scale are
inspired by [petrroll/markdown-to-teams](https://github.com/petrroll/markdown-to-teams).
This is visual direction, not a template: Tabelo keeps its own blue accent,
stronger element hierarchy, and explicit editable/read-only distinction. No
source code or visual asset from that project is copied into Tabelo.

- **Structured.** Grid cells, row and column headers, resize affordances, pane
  edges, and major workspace divisions are rectilinear. The table remains the
  visual anchor.
- **Friendly.** Buttons and fields use a 0.25rem control radius. Panels, menus,
  dialogs, notices, and other contained or floating surfaces use a 0.5rem surface
  radius. There are no pills or arbitrarily rounded containers.
- **Neutral with one blue accent.** Neutral greys distinguish surfaces before
  lines do. Blue marks focus, selection, and checked or active controls. Status
  colours are the only other colours and always have written meaning.
- **Compact, not tiny.** Controls remain 1.75–2rem tall. Critical labels stay at
  0.875rem; space comes from removing repetition and progressive disclosure, never
  from shrinking essential text.
- **Quiet.** Shadows belong only to floating layers. Borders communicate
  structure or state, never decoration. There are no gradients or decorative
  elements.
- **Still.** Transitions orient the user, never decorate or flash.

The table is the loudest thing on screen. Everything else recedes.

---

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
you need a value that has no token, that is a pattern break: follow §0.
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
| `--surface-header` | `bg-surface-header` | Pane headers and interface chrome |
| `--surface-table-header` | `bg-surface-table-header` | The editable table header row in the grid and the rendered preview. The source views mark their header in the syntax tokens instead: see "Syntax and table structure". The grid's sticky row composites it over an opaque base: see §9 |
| `--surface-gutter` | `bg-surface-gutter` | The grid's row-number gutter |
| `--surface-readonly` | `bg-surface-readonly` | A pane body that cannot be edited |
| `--surface-floating` | `bg-surface-floating` | Menus, tooltips, and dialogs above panes |

Order matters: app is furthest back, gutter and interface chrome sit above the
panel. Neighbouring surfaces are close in tone on purpose and are not held to a
contrast ratio: they group content, they do not identify a component. What has
to be seen is the boundary of anything floating, and that is `--line-floating`
below. The table-header surface is a quiet accent tint, so headers remain
recognizable as mutable table data instead of reading as disabled chrome. Use
tones to group related content before adding a line. Editable pane bodies use
`--surface-panel`; a read-only pane uses
`--surface-readonly` and a written "Read only" cue in its header.

### Lines

| Token | Utility | Use |
| :--- | :--- | :--- |
| `--line-subtle` | `border-line-subtle` | Grid cell borders, control separators |
| `--line-strong` | `border-line-strong` | Boundaries between panes |
| `--line-floating` | `ring-line-floating` | The boundary of anything that floats: menus, tooltips, dialogs, notices |
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
consumer's.

`surface-styles.ts` in `packages/ui/src/components/` holds the three
compositions and nothing else does: `floatingSurfaceStyles` for menus,
tooltips, dialogs, and notices; `panelSurfaceStyles` for a pane; and
`activePanelSurfaceStyles`, which changes only the boundary colour. A rounded
surface that needs a boundary composes one of them. Writing `ring-1`, a bare
`border-<colour>`, or a second stroke on a rounded surface is a pattern break,
and a browser test walks the live DOM to catch it.

Two of these carry a contrast floor and are tested for it. `--line-floating`
and `--control-outline` reach at least 3:1 against every surface they can
appear over, because
[WCAG 1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)
requires that much of anything needed to identify a component. A floating
layer's own surface is deliberately close in tone to what it covers, so the
boundary, not the fill, is what proves the layer is there. `--line-subtle` and
`--line-strong` are structure inside content the user is already looking at and
carry no such floor: raising them to 3:1 would turn the table into a wireframe
and is not what the rule asks for.

### Accent

| Token | Utility | Use |
| :--- | :--- | :--- |
| `--selection-fill` | `bg-selection-fill` | Background of selected cells |
| `--selection-edge` | `outline-selection-edge` | The focused cell's outline, focus rings, resize affordance |
| `--text-selection-fill` | CSS selection | Native and source-editor text selection |
| `--primary` / `--primary-foreground` | `bg-primary text-primary-foreground` | The solid accent with a contrast-paired label: the primary decision button, a checked control, and the grid's current find match |

The find match is the one place the solid accent fills a run of text rather than
outlining a control. It earns it: the cell underneath already wears
`--selection-fill`, so a second translucent tint over the first is the weakest
possible way to say "these characters", and the pale tone is reserved for fills
that sit under content rather than replace its ground. The paired foreground is
what keeps the marked characters readable.
| `--active-line-fill` | Source editor theme | Current source line without competing with selected text |

The accent family is blue. Use its solid tone only for focus,
selection, and checked or active controls; use the pale tone for hover or
selection fills. Text selection is intentionally stronger than an active line
and is a separate token from structural cell selection, so the two meanings do
not accumulate into a muddy block in dark mode. Ordinary neutral buttons and
links do not become blue merely for decoration.

### Semantic values and syntax

The value palette crosses views. JSON scalar literals and visual-grid cells use
the same token for the type the canonical value already carries. The grid asks
`cellValueType` for that type and never parses the displayed text: a string
`"1"` stays a string treatment beside the distinct treatment of the number `1`,
in accordance with ADR 0008.

| Token | Utility | Role | Second channel |
| :--- | :--- | :--- | :--- |
| `--value-string` | `text-value-string` | Quoted source strings and carried string cells | Literal shape and normal weight |
| `--value-number` | `text-value-number` | JSON numbers and carried number cells | 600 weight and tabular numerals |
| `--value-boolean` | `text-value-boolean` | JSON booleans and carried boolean cells | 600 weight and italics |
| `--value-null` | `text-value-null` | JSON null and carried null cells | Italics and the literal or empty-value shape |
| `--syntax-notation` | `text-syntax-notation` | Element names, escapes, entities, and other notation | Italics |
| `--syntax-link` | `text-syntax-link` | Links, URLs, and autolinks | Underline on the link text and the address shape |

Every tone reaches WCAG AA contrast against both `--surface-panel` and the
selected-cell composite. Close hues also differ by weight, italics, underline,
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

**A status colour means only its status.** Syntax highlighting never borrows
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
| `--control-h-md` | `h-control-md` | 2rem: default control height |
| `--panel-header-h` | `h-panel-header` | 2.75rem: every pane header |
| `--grid-gutter-w` | `w-grid-gutter` | 5.5rem: row number between its reorder grip and its options control |
| `--grid-row-h` | `min-h-grid-row` | calc(var(--pane-zoom, 1) * 2rem): minimum table row height |
| `--grid-col-w` | `w-grid-col` | 10.5rem: default column width |
| `--grid-col-w-min` | `w-grid-col-min` | 4.5rem: resize floor |
| `--control-radius` | `rounded-interactive` | 0.25rem: buttons, fields, menu items, badges |
| `--surface-radius` | `rounded-surface` | 0.5rem: panes, menus, dialogs, notices, empty states |

The two radii communicate hierarchy rather than decoration. Grid cells, row or
column headers, resize tracks, and layout glyphs stay square because their
geometry communicates table structure.

Column width is a persisted workspace preference keyed by stable column id,
never table document state or a document-history step. Pointer resize,
keyboard resize, and Fit share one arithmetic owner: 4.5rem through 64rem,
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
| `--spacing-content-line-box` | `h-content-line-box` | A line rhythm token shared by grid and source |

`--pane-zoom` is set on the pane body and nowhere else. At 100% both utilities
resolve to exactly `text-sm`, so the default rendering is unchanged.

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
and focus rings that pane zoom deliberately leaves alone.

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

**Structure recedes, while semantic values and notation stay related across
views.**
Brackets, pipes, the Markdown alignment divider, markup markers, and HTML
attribute names are all `--muted-foreground`. Strings, numbers, booleans, and
null use their cross-view value tokens; element names, escapes, entities, and
links use the notation and link tokens above. These treatments are presentation
only: they do not change grammar, parsing, cell values, or source text. A status
colour is never spent on a token.

**Whitespace, empty values, and escape sequences are annotated, never
written.** The formats Tabelo edits are whitespace-significant and full of
positions that hold a value the user cannot see: a tab and a run of spaces look
alike in TSV, `a,,b` has a middle field, `||a|||b||` is hard to count, and
`&#32;` is five characters standing for one space nobody can spell. Four glyph
families answer that, all of them CodeMirror decorations over unchanged text:
`·` for a space and `→` for a tab, on the per-character marks
`highlightWhitespace()` provides; `(empty)` where a delimited syntax hides an
empty field; and one glyph over each escape sequence, showing the character the
sequence stands for. The last two are the ones this project draws itself,
because no editor has a concept of a field or of a codec's escaping grammar. The
placeholder appears in Markdown, CSV, TSV, and Jira, while JSON, Records, and
HTML spell an empty value out and get none; the escape glyph appears in Markdown
and Jira, the two formats whose codecs escape reversibly inside a cell.

**An annotation sits below the content, never beside it.** The whitespace
glyphs and the placeholder share one tone, `--muted-foreground` mixed to half
strength, never a status colour and never the full text tone: a marker answers a
question the reader has to ask before it matters, so it must be findable when
looked for and ignorable when not. The escape glyph is the exception, and it is
notation rather than annotation: it wears `--syntax-notation` in italics, the
same treatment the syntax tokens already give an escape, because it says the
same thing more briefly. Each is a distinct glyph, so none is told apart from
content by colour alone, and italics and the glyph itself are what survive
forced colours where a tone does not. The space and tab glyphs are painted in an
absolutely positioned pseudo-element so they carry no advance width and the
annotated character stays exactly one character wide. Every glyph is generated
content, so no marker is ever a text node: none of them can be read out, copied,
downloaded, parsed, or persisted, and the caret, the selection, and the
diagnostic underlines stay measured in the characters the user typed.

**The placeholder reads as text and is not text.** It sits where the cell's
value would have started and takes the width of the padding it is drawn instead
of, so a reader sees what the field costs. Everything else about it says
otherwise: it holds no document position, the caret steps over it rather than
into it, it cannot be selected or typed through, and it never reaches the text,
the clipboard, a download, or storage.

**An escape sequence is drawn as what it means, in the room it took.** `&#32;`,
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
and tab glyphs, a line break is `↵`, and a hover names both the spelling and the
character it stands for, which is the one thing that cannot be drawn there. It
is always on: a reader who cannot tell notation from content has no question a
preference would answer. The glyph itself is generated content and hidden from
assistive technology like every other annotation, but this is the one
replacement that covers characters the file actually holds rather than padding,
so the sequence is kept in the accessible tree, clipped out of sight: what a
screen reader reads is still the source, exactly and in order.

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

**Three choices, because they answer three questions.** Tabs are a delimiter, so
seeing them is structural; the placeholder reports a value rather than a
character; and spaces are the one a reader has an opinion about. Tabs and the
placeholder are each on or off. Spaces take the modes VS Code's
`editor.renderWhitespace` settled on, under its names, so a reader who knows
that setting does not learn a second vocabulary: `none`, `boundary` (runs of
spaces and the spaces at a line's edges), `trailing`, and `all`. Its
`selection` is deliberately absent, because it answers nothing until the reader
has already selected the text they were trying to inspect. The default is
`trailing`, with tabs and the placeholder on: a space at the end of a line is
the one nobody meant to type, and dotting every space instead answers a
question nobody asked.

All three live in the versioned `tabelo.preferences` payload and are global,
never pane state. A schema change here gets a migration like
any other, so a reader who had turned the markers off keeps them off.
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
an opt-in presentation preference owned and persisted by each pane, never by a
format, the document, a draft, or the history timeline. The pane actions menu
exposes one checked `Wrap lines` command for source views. Reconfigure the live
CodeMirror instance through its wrapping compartment so the caret, selection,
draft, and local undo history survive the change. A newly created pane starts
unwrapped; changing or rearranging a view retains the preference of the pane.

The visual table mirrors structure rather than source punctuation: its header
row and the rendered preview use the shared editable table-header surface,
while body cells keep the normal content treatment. Header text position shows
alignment without an extra icon inside the editable cell. A native source
selection must paint over the header treatment just as it does over any other
line.

Cell types are carried from the document and never inferred from visible text.
A number, boolean, or null value uses the dedicated `font-value` token, which
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
and boolean. Changing it updates the column expectation only and never converts
existing cells. A data cell's context menu owns the corresponding `Cell type`
radio group for string, number, boolean, and null. A valid different choice is
one explicit conversion and one document-history step. A conversion that the
current value cannot represent stays visible but disabled with its reason. The
group requires exactly one selected data cell and never picks one silently from
a larger or non-contiguous selection.

### Spacing rhythm

Use Tailwind's scale, restricted to: `0.5`, `1`, `1.5`, `2`, `3`, `4`, `6`.
Anything else is a pattern break. Gaps inside a control group are `1` or `1.5`;
padding inside a pane header is `3`; cell padding is `2` horizontal, `1.5`
vertical.

### Typography

Interface text uses `"Segoe UI", Aptos, Calibri, -apple-system,
BlinkMacSystemFont, sans-serif`. The source editor keeps the existing
`ui-monospace`, `SF Mono`, `Cascadia Mono`, `Menlo`, `monospace` stack.

| Role | Classes |
| :--- | :--- |
| Pane title | `text-sm font-medium` |
| Control label | `text-sm font-medium` |
| Table cell | `text-sm` |
| Native cell value | `text-content font-value` |
| Source editor | `text-sm font-source` |
| Index chrome | `font-index` |
| Helper / status | `text-xs text-muted-foreground` |

Critical control, pane, menu, notice, onboarding, and error labels never fall
below `text-sm` (0.875rem). `text-xs` is reserved for optional descriptions,
shortcuts, file extensions, and secondary status detail. There is no
`text-base` and nothing larger in the product interface. There are no headings
above `h2`: the app has one screen.

---

## 3. Components

### Composition over configuration

Build compound components that share a namespace and slot together, rather than
one component with many boolean props.

```tsx
// Yes: composition
<Panel>
  <Panel.Header>
    <PaneIdentity view={pane.view} />
    <Panel.Spacer />
    <PaneMenu pane={pane} />
  </Panel.Header>
  <Panel.Body>…</Panel.Body>
</Panel>

// No: configuration
<Panel view={pane.view} compact={compact} actions={paneActions} />
```

A prop that only exists to toggle a piece of layout is a signal the piece
should be a slot instead.

### Do not rebuild what exists

Before writing a control, check `packages/ui/src/components/`: it holds the
shadcn primitives (button, dropdown-menu, badge, toggle-group, separator,
tooltip, input, and more). Compose those. A bare `<button>` in product code is
a pattern break unless it is a grid cell affordance, which the grid owns.

Add a missing primitive with the shadcn CLI rather than hand-writing it:

```bash
pnpm dlx shadcn@latest add <name> -c packages/ui
```

### Tooltip

There is one tooltip appearance in the product, and `packages/ui`'s `Tooltip`
owns it: the floating surface, one shadow, the `--line-floating` boundary, the
0.25rem control radius, 0.75rem type, the shared padding, and the shared
clipped triangular pointer (§6). A tooltip explains its trigger and never
carries the only copy of something the user needs, because it is transient and
because pointer-only affordances fail §9. Every tooltip opens on keyboard focus
as well as hover. When it explains why a control is unavailable, the tooltip is
the visual echo of a persistent accessible description on the control. The
shared disabled-tooltip pattern keeps an `sr-only` copy mounted and associates
the control with it through `aria-describedby`; the transient popup is never
the description's only owner.

No tooltip picks its own side. The primitive's placement flips when the
preferred side does not fit, and hard-coding a side is how one tooltip ends up
opening away from the control it explains.

Two systems render tooltips that `Tooltip` cannot reach, and both are bound by
this entry:

- **CodeMirror diagnostics.** The source editor draws its own tooltip from a
  JavaScript theme, so the treatment is written twice: once in
  `packages/ui/src/components/tooltip.tsx`, once in `ui/source/editor-theme.ts`.
  That duplication is unavoidable and commented in both places; keep them in
  step. A diagnostic is a product message, not editor chrome.
- **The browser's own `title`.** The grid's cells keep one, because a cell
  shows a clipped value and the OS tooltip reveals the rest without mounting a
  floating layer per cell across a 200-row table. It is the single recorded
  exception. Anywhere else, a native `title` is a pattern break.

### Menus that carry a choice

A menu option that is one of several **mutually exclusive current states**
(the layout, a pane's view, a column's alignment or expected type, or a cell's
real type) is a `DropdownMenuRadioItem`
inside a `DropdownMenuRadioGroup`, never a plain item wearing a tick or a tint.
The primitive supplies `menuitemradio`, `aria-checked`, and the arrow-key
behaviour. The selected row background is the only visible selection mark.

A menu's checkbox and radio indicators are the product's own checkbox and radio
controls, not menu-specific drawings: the same 1rem box, the same control
radius, the same `--control-outline` when unset, and the same primary fill once
set. They are declared once in `menu-styles.ts` and shared by the dropdown and
context menus.

Every option in a single-selection list uses the same anatomy: one meaningful
leading icon, primary text with an optional description, optional trailing
metadata. Icons identify the choice rather than decorate it, so they come from
the registry or domain owner when one exists and use the shared icon size and
alignment. Do not omit an icon from one list or add a radio circle, tick, or
second selection mark because a different primitive renders that list.
Descriptions remain optional: views, layouts, and download formats use
supporting copy when it helps distinguish the choices, while alignment stays
single-line instead of repeating what its icon and label already say.

Radio semantics remain in the accessibility tree even though no radio glyph is
drawn. A checked option uses the shared `--selection-fill` row background, which
is already an unambiguous state cue. Pointer hover and keyboard highlight use
the shared neutral interaction background and update the icon, label, and
description together. A checked row keeps its selection background while
hovered or focused, so menus and dialogs never display two competing selected
treatments. A disabled row never gains an interaction background or active text
colour on hover, regardless of whether it is a command or a selection option.

The checked value is read from the state that owns it, not from the last click,
so a change the product refuses leaves the menu telling the truth. Pass
`closeOnClick` on these items: Base UI keeps radio menus open by default, which
is right for a stepper and wrong for a choice that is finished once made.

A group whose items are *actions* rather than states, such as zoom, add, and
close, stays a plain `DropdownMenuGroup` of `DropdownMenuItem`s.

Every action collection uses the menu primitive's semantic Group, in dropdown
and context menus alike. A visible group title is reserved for Expected type,
Cell type, Edit, Move, and Fill. It is canonical copy rendered through
GroupLabel, and the Group is named with `aria-labelledby`. Clipboard, Insert,
Remove, and the single self-explanatory Fit column to content action remain
untitled semantic groups, without an empty label. Alignment is named by its
submenu trigger and by that menu's own accessible name instead, so its radio
group travels into the child menu without a GroupLabel of its own. Group labels
are non-interactive and arrow-key navigation skips them. App and pane menus
follow the same grouping contract.

A submenu is allowed for exactly one shape: **a flat list of immediate,
self-explanatory commands that needs no explanatory state**. Every row performs
its command the moment it is chosen, there is nothing to state beforehand, and
nothing to unwind afterwards. The class has exactly two approved members: the
global `Copy as`, whose rows are the codec registry and which is the standing
example, and column `Alignment`, which keeps its radio-group semantics wherever
it is placed. Nothing else nests, and a submenu never contains a second
submenu.

Every other choice still opens one dialog, and the two standing examples say
why. **Add view** carries a consequence the list cannot show, because the same
seven views mean a different workspace depending on which edge was clicked, and
its unavailable entries carry reasons worth reading. **Layout** is a visual
gallery of presets, which a text submenu cannot be. Neither changes: a menu item
outside the class above either performs its command or opens one dialog.

Every dropdown and context menu uses the shared primitive's one spacing rhythm:
0.25rem outer padding, 2rem minimum item height, 0.5rem horizontal padding, and
0.5rem vertical padding. Icon-to-label gaps are 0.75rem. Primary option labels
are 0.875rem; a genuine
description or shortcut may use 0.75rem. Floating menus are translucent over a
backdrop blur when the browser supports it, with the opaque popover colour as
the fallback. Their floating surface, strong boundary, and shadow must remain
visibly distinct from the pane beneath.

Groups are separated by the same 0.0625rem hairline used elsewhere, with
0.5rem vertical margin on each side. That shared rhythm belongs to the menu
primitive; no menu adds a local separator variant. Long menus keep the shared
available-height ceiling and vertical scrolling at narrow viewports.

Shortcut hints use the shared normal sans-serif typeface, never the source
editor's monospace face. Each physical key is one compact, quiet tonal rectangle
and adjacent keys use the smallest spacing token. Platform modifiers use their
familiar label or symbol, so zoom in appears as separate `Command` and `+` keys
instead of the ambiguous string `Mod++`. Smaller text and normal letter spacing
distinguish the shortcut from its action label without making it look like
another button. Dropdown and context menus share this treatment through the
menu primitive.

Key legends follow the user's platform, which the app already knows. Apple
keyboards get the glyphs their keys are printed with: `⌘`, `⌃`, `⌥`, `⇧`, `⌫`,
`↵`, `⎋`, `⇥`. Every other platform gets the words its keys are printed with:
`Ctrl`, `Alt`, `Shift`, `Backspace`, `Enter`, `Esc`, `Tab`. Arrows and the
plus and minus signs are glyphs everywhere. `@tabelo/ui/lib/platform` owns that
decision; nothing else may detect the platform. The accessible name keeps the
full key name, so saving horizontal space never makes the shortcut cryptic to a
screen-reader user.

Copy naming a shortcut in prose names the one key the user has, never both
spellings: "Use ⌘C" or "Use Ctrl+C", never "Use ⌘C or Ctrl+C".

### Rendered preview

The rendered preview reads as a **neutral document table**, not as a styled
Tabelo surface. Its job is to answer "what will this table look like once it
leaves Tabelo", so it stays close to what a plain document shows and to what the
copy path produces. Decided on #77.

- **No card.** The pane already supplies the surface, radius, and outline. Do not
  wrap the table in a second one.
- **No zebra striping.** An alternating tint encodes nothing about the row, so it
  is decoration under §1, and it borrows the header surface for rows that are not
  headers.
- **Thin uniform rules.** `--line-subtle` at 0.0625rem on every cell including
  the header, per §2. No heavier rule under the header row.
- **Square outer corners.** Table structure is rectilinear, as in the grid.
- **The header is bold text on `--surface-table-header`**, the same shared
  editable table-header surface the grid uses.
- **Tabelo's own type**, at `text-content` so the preview scales with the pane.
- **Sized to its content, capped at the pane width.** A narrow table is not
  stretched across a wide pane, and a wide one wraps instead of forcing the
  reader sideways. Cells keep `whitespace-pre-wrap`, so the line breaks the
  codecs escape survive. Alignment comes from the column's own alignment.
- **A document with no rows shows a written empty state**, not a bare header row.

### Empty workspace

After hydration, an initially empty document with no source draft presents the
existing Start with surface in the centre of the workspace. The normal workspace
stays visible only as blurred context and is inert; the global action button is hidden
until the user chooses an empty table, pastes, or imports. This is an onboarding
surface, not a dialog: it does not claim modal semantics and never appears
automatically over saved content, an unfinished draft, or a table the user
emptied during the current visit. An explicit New table command resets the
document first and then returns to this surface. A trusted `Mod`+`V` paste event
starts the table directly while the surface is open.

Its three entry actions use the shared decision-action group: right-aligned in
one horizontal row at every supported width. Ordinary alternatives come first
and the primary starting action comes last, at the far right. Their DOM and
focus order follows that same semantic priority. The surface grows to the row's
intrinsic width and the action row never becomes a scroll container.

### A pane's own tool bar

The grid's find bar is the one surface of this shape, and adding a second one is
a pattern break under §0. It is not a dialog and not a floating layer: it is a
tool the user works **alongside** the table for as long as the errand lasts, so
it belongs to the pane the way the header does.

- **Docked at the foot of the pane, outside its scroller.** It covers no cell,
  scrolls with nothing, and its field can take the pane's full width, which is
  what a search string longer than a word needs. A floating pill over the table
  was tried and rejected: it hid the rows the user was searching and bought
  nothing, because the pane already has an edge to attach to.
- **One row for the errand, a second only when asked.** Finding is why the bar
  exists and gets the row to itself. Replacing is a different job, so it sits
  behind one disclosure control at the leading edge, and the two fields line up
  on that edge rather than stepping. The disclosure is transient state like
  everything else in the bar.
- **Dense, and labelled by placeholder.** Every control is one field or one icon
  at the 1.75rem dense-toolbar size, and each field's placeholder is also its
  accessible name. A row of written labels would cost the width the fields
  exist to have, and the audience already knows what a find bar is. This is a
  licence for this surface, not for the product: a control anywhere else still
  carries its visible label.
- **Its fields grow with what they hold, to three rows.** A cell may legitimately
  contain a line break, so a query may too, and a single-line input would
  silently flatten what was pasted into it. Each field is a textarea that starts
  one row tall, grows through the browser's own `field-sizing: content` that the
  shared primitive already declares, and scrolls once it reaches three rows.
  Enter navigates and replaces, so a line break reaches a field by paste rather
  than by keystroke. The controls beside a field stay on its first row.
- **Its one piece of state is passive text.** The match count is a legend beside
  the controls with no role and nothing to press, and it reads compactly
  (`3/14`) while the same number is spoken in full through the shared polite
  channel, because a sentence read on its own has no controls beside it to give
  a compact legend its meaning.
- **A keyboard-first tool still needs a way in.** Its shortcut is the discovery
  problem, not the surface, so the owning pane's menu carries the command that
  opens it, with the shortcut beside it. See §9.

### Dialog

A dialog is allowed **only as the direct result of a command the user issued**,
and only when the command has a choice to make that the current menu cannot
hold without cascading: a choice with its own options, one that needs stating
before it happens, or the layout gallery opened from the global menu. The
download chooser holds format-specific output choices. New table also uses a
dialog when the current visit has held valid content or a pending draft would
be lost; an untouched session returns to onboarding without interruption.

Adding a view qualifies under **"needs stating before it happens"**, not under
length. Seven views are something a menu holds comfortably, so the list is not
what earns the dialog. Two other things do. The choice has a consequence the
list cannot show, because the same seven views mean a different workspace
depending on which edge was clicked, and the dialog's supporting copy is where
that lands: "The new view opens below the Visual table pane." And a view that
cannot be added has a reason worth reading, whether it is already open
elsewhere or its format cannot represent the current table; a dialog can
disable it and explain, where a menu that did the same would be a menu whose
items mostly do nothing. The choice is also unwound by Cancel with nothing
changed, which is the shape of a decision rather than of a command.

Moving a pane also qualifies because the choice is spatial. The Move pane
dialog shows every other occupied position in the current preset through a
small layout diagram and a worded name such as "Top left" or "Right, full
height". The diagram is supplemental; the words carry the destination for
assistive technology. Choosing one swaps the two pane positions without
changing the preset or pane count.

Settings is the other deliberate exception. Preferences are not immediate menu
commands: they form one draft that the user visits, previews, and either applies
together or unwinds with Cancel. A dialog supplies that transactional boundary
and one extensible preferences list without turning the App menu into stored
toggle state. Theme is a labelled single-selection group; global binary display
preferences are labelled checkbox rows in the same list. Per-pane preferences,
including source wrapping and pane zoom, remain in the pane menu.

Rename table uses the same transactional boundary for one persisted text value.
Its labelled input starts with the current name, validates before saving, and
keeps both the prior name and the dialog open when durable storage refuses the
change.

Typed grid entry has one deliberate decision dialog. Committing valid number or
boolean input whose canonical representation differs from the draft asks
whether to convert it or keep the entered text exactly. Committing invalid
typed input asks whether to keep editing or store it as text. Dismissal is
`Keep editing`: after the close transition, focus returns to the same editor
with the complete draft. Either final choice is one document change and returns
focus to the same cell. The dialog never advances to the next row or column,
because no value was committed when navigation was requested.

A dialog is never used to announce something. Notices belong in the notice
layer described in §5: it floats above the workspace without modal semantics,
without a focus trap, and without blocking the work underneath.

Only one dialog may be open at a time. A modal flow that needs another decision
closes or replaces its current step before opening the next one; it never stacks
one backdrop and popup over another. Global shortcuts do not open a second
dialog while one is active, and a portalled dialog closes when the surface that
owns it becomes inert. Model mutually exclusive dialog flows as one state rather
than independent booleans. Raising `z-index` is not a hierarchy fix.

| Rule | Treatment |
| :--- | :--- |
| Surface | `rounded-surface`, `bg-popover`, one shadow: a floating layer |
| Body text | `text-sm`; the same 0.875rem floor as everywhere else |
| Title | `DialogTitle`, `text-sm font-medium` |
| Supporting copy | `DialogDescription`, one sentence saying what to choose |
| Dismissal | Escape and an explicit Cancel; focus returns to what opened it |
| Button hierarchy | One right-aligned, non-wrapping action row. Cancel or another neutral dismissal comes first, ordinary alternatives follow, and exactly one emphasized decision comes last. That decision is destructive red or primary blue, never both |
| Confirmation | One primary verb naming the operation: "Download", not "OK" |

Compose `packages/ui`'s `Dialog`; do not build a second modal. Prefer the
explicit Cancel and Confirm pair over the primitive's corner close button, so
the two ways out are both visible and both labelled.

A dialog that asks for one value uses the shared `SingleSelectionList` and
`SingleSelectionOption` treatment. Every option is one full-width labelled row
with native Base UI radio semantics behind the shared visual anatomy: icon on
the left, content in the middle, and optional metadata. Rows use 0.5rem padding
and 0.375rem separation. Hover and keyboard highlight use the shared interaction
surface, the checked row uses `--selection-fill`, keyboard focus outlines the
whole row, and disabled rows stay visible with their reason. No radio circle or
other redundant selected glyph is visible. A title and optional description
use the shared `MenuOption` rhythm. Do not recreate this structure inside a
feature dialog. If an option has both status and metadata, its trailing area
stacks them vertically, status first, instead of widening the row with two
adjacent labels. A missing status or metadata child reserves no space.

Dialog action buttons use the shared action group and shared button wrappers.
They stay right-aligned in one non-wrapping row without changing DOM or focus
order, and the action group itself never scrolls. One shared, deliberately
generous top spacing separates the footer from the dialog content in every
dialog. A neutral dismissal comes first, ordinary reversible alternatives
follow, and exactly one decisive action comes last at the far right. That last
action is primary blue for the normal path or destructive red for an
irreversible path. One group never presents both emphasized colours.

Single-selection dialogs grow to show their complete option list. The option
list, dialog surface, and action row never own horizontal or vertical scrolling
and never show incidental scrollbars. The footer remains after the complete
list with the shared content separation.
Neutral dismissal and ordinary alternative actions both use the borderless
ghost treatment. An alternative never introduces an outline that makes it look
more important than Cancel or compete with the decisive action.

A menu command that opens a dialog uses the shared sequential-layer helper. It
closes its menu through the menu primitive first, including the close animation,
and only then opens the dialog. The menu must not remain visibly blurred beneath
the modal overlay.

### Layer ownership

| Layer | Location | Holds |
| :--- | :--- | :--- |
| Primitives | `packages/ui/src/components/` | Generic, product-agnostic shadcn components |
| Product primitives | `apps/web/src/ui/primitives/` | Tabelo's shared Panel frame |
| Features | `apps/web/src/ui/{grid,source,preview,workspace}/` | Components that know about the table document |

Actions are described once and rendered many times. `ui/grid/table-actions.ts`
is the single list of table operations; the axis menus and context menu are
renderers over it. Never write an action inline in a
menu. That is how a menu and a toolbar drift apart.

A component in `primitives/` must not import from the store. If it needs
document state, it belongs in a feature folder.

Related controls use the shared radius and spacing to read as a family. Do not
wrap an existing control group in another card or add a border merely to make
the relationship visible.

---

## 4. Interaction states

Every interactive element defines all of these. A missing state is a defect,
not a polish item.

| State | Treatment |
| :--- | :--- |
| Rest | No background |
| Hover or keyboard highlight | Shared `bg-accent` interaction background |
| Focus | 0.125rem `--selection-edge` outline, inset. Never remove it |
| Selected | `bg-selection-fill`, plus outline when it is the focused cell |
| Copied | 0.125rem dashed `--selection-edge` border, drawn only on the outer sides of the copied range |
| Carried cell type | Cross-view semantic value token selected by `cellValueType`; colour is reinforced by weight, italics, numeric spacing, literal shape, and the accessible type name |
| Divergent cell type | Compact textual `CellTypeMark` inside the cell, never alignment or colour alone |
| Disabled | `opacity-50`, no hover or highlight state, `not-allowed` on the actual hit layer, and a tooltip explaining why. Never hide a disabled action |
| Invalid | Red wavy underline; written diagnostic on hover and in the editor description |
| Warning | Yellow dotted underline; written diagnostic on hover and in the editor description |

Disabled actions stay visible so the interface does not reflow as the selection
changes. Every disabled control must expose a concise reason through the shared
disabled-tooltip pattern. Layout stability outranks tidiness.

The copied state marks where the clipboard was filled from, so the user can go
and find the paste destination without losing track of the source. It outlives
the selection, which is the only reason it exists as a state of its own, and it
is drawn by the cells themselves rather than by a floating rectangle over the
table: the cells already resolve per-pane zoom, column width, wrapped row
height, and the sticky chrome layers. Only the sides on the boundary of the
range are drawn, so it reads as one outline rather than a grid of dashes.

**It is static.** It never becomes marching ants: §7 puts grid geometry and cell
selection outside motion, and a status that pulses is exactly what that rule
forbids. The dash pattern, not the colour, separates it from the solid focus
outline, so it carries meaning without colour.

**Copy marks; cut does not.** Cut empties the cells at once rather than on
paste, so there is no pending move to describe and a mark would outline blank
cells. Cut clears an existing mark instead, as does a source or preview copy:
both replace what is on the clipboard. Beyond that the mark is cleared by
pasting, by `Escape`, and by any document change, since an insert, a move, or a
delete leaves its coordinates describing cells the clipboard never held. It is
transient: never document state, never a history step, never persisted.

A dialog confirm is disabled when it would produce no state change. The shared
confirm wrapper owns its required disabled tooltip, so feature dialogs cannot
create an unexplained inactive primary button. It is **explained unavailable**
rather than natively disabled: the button keeps its place in the tab order,
reports `aria-disabled`, and swallows pointer click, `Enter`, and `Space`, so
the written reason opens from focus and not from hover alone. A native
`disabled` attribute is for a control that promises no interaction and carries
no reason to read; the moment a reason exists, it must be reachable without a
pointer. This applies to the current layout in Layout and the current pane
view in Change view. Download remains enabled because producing a file is an
action even when its format choice did not change; destructive New table and
first-visit creation also still perform real actions.

Destructive menu actions use one shared state treatment. Their label, icon, and
any secondary anatomy inherit the same destructive foreground at rest, on
hover, and on keyboard focus; the generic accent foreground never leaks into a
destructive row.

An unchecked checkbox remains visibly identifiable as a control. Its shared
primitive owns a contrasting outline and transparent interior in both colour
schemes; the absence of a checkmark must never make the control disappear into
its parent surface or turn it into a heavy filled square.

Unavailable selection options distinguish two causes. An option already used
elsewhere is an informative `in-use` state with a neutral status label and an
eye icon. An option blocked by the current document or another precondition is
an `unavailable` state with an alert icon and the concise `Blocked` status. Both
are actually disabled, both keep their identity icon, and both expose the full
reason in a tooltip. The written status and different icon shapes keep the
distinction from depending on colour alone. `Blocked` uses an attenuated
destructive tone so it communicates a precondition without competing with the
selected option.

A view or download format whose codec cannot represent the current document
stays listed and disabled with the format rule that causes the block, why that
rule exists, and the corrective action. For example, JSON explains that headers
become unique object keys rather than merely saying that a column is invalid.
An already-open pane that becomes
blocked replaces its content with one keyboard-focusable written status. The
status is announced to assistive technology and identifies affected rows or
columns without relying on the grid being visible.

**A refusal that names a position offers the correction beside it.** The
refused choice stays natively disabled with its reason, and an ordinary enabled
`Fix table` command sits immediately after it as a sibling: never nested inside
the disabled option, its label, or its full-row overlay. A control must not
report itself as disabled while answering to activation, and an enabled control
must not perform a command other than the one its label states. The correction
takes the user to the first offending header or cell, raises the same reason
through the notice channel, and closes the surface it was invoked from without
changing the view, the panes, or the document. Several refused choices in one
list each get their own command, so the accessible name opens with the label
and names the refused choice. A refusal that names no position offers no
command: the choice stays disabled with its reason rather than gaining a
control that would do nothing.

The pane frame owns focus for a source view. CodeMirror never draws a second
inner rectangle: its caret and selection remain visible, while the pane's 0.125rem
inset edge supplies all four focus sides. The source caret is a 0.125rem accent line
aligned to the editor's line metrics; native text editors use the same accent
through `caret-color`.

A source pane measures its logical lines and number gutter when it first becomes
visible and whenever wrapping or pane geometry changes, before the user can see
or focus it. Opening, replacing, or rearranging a view must not leave line
numbers on stale geometry and rely on a click to repair them. In wrapped mode,
each number stays on the first visual line of the logical line it identifies.
Focus changes interaction state; it is never a layout trigger.

Healthy source panes are silent: do not render repeated "In sync" or "Editing"
labels. A transient parse failure also stays silent during its short grace
period. Persistent diagnostics decorate the affected source range without
changing layout: a blocking error uses a red wavy underline and a non-blocking
warning uses a yellow dotted underline. Hover reveals the written diagnostic in
a tooltip; keyboard and screen-reader users receive the same text through the
editor's accessible description. There is no separate Details control and no
automatic cursor movement. Underline shape and written text ensure colour is
not the only signal.

The description element the editor points at exists whether or not there is a
diagnostic; only its text changes. It carries no `aria-live`: the accessible
description is the channel, and a live region on the same node reads the
diagnostic twice.

### Notice severity

A notice's appearance, its announcement, and whether it may expire are all
derived from one declared severity. None of them may be derived from which
part of the app produced the message.

| Severity | Surface | Announced | Expires |
| :--- | :--- | :--- | :--- |
| `info` | `bg-surface-header` | Polite | After 4s, and only when it carries no action |
| `warning` | `bg-destructive/10` | Polite | Never |
| `error` | `bg-destructive/10` | Polite, or assertive when the table is at risk | Never |

Warning and error share the one status surface this design line has. They
differ in how they are announced and in whether they may clear themselves, not
in how loud they look. A failure never renders as `info`.

Only a plain confirmation may expire unattended. A failure, or anything
carrying an action, stays until it is dismissed: a recovery instruction that
disappears after four seconds is not a recovery path. The timer belongs to the
notice on screen, never to the notice area, so nothing can expire unseen.

### Announcing

Two live regions, one `role="status"` and one `role="alert"`, are mounted for
the lifetime of the app and start empty. Notice text is written into them.
A live region inserted at the same moment as its text is not reliably
announced, so a region that appears with a message in it is a defect.

Assertive interrupts whatever is being said and is reserved for a storage
failure or a refused import: the cases where the user's table is at risk.
Everything else, including a plain "Copied", is polite.

Only what has not been announced yet is written, so dismissing one notice never
reads the remaining ones out again, and a batch arriving together becomes one
utterance rather than a burst. The visible notice bar carries no live
semantics of its own.

The polite region also carries text that has no visible counterpart, currently
the grid's selection extent. It shares that one region rather than getting a
third: two status regions would compete for the same moment of speech. The most
recent polite writer wins.

**Announce a change, not a state.** The extent is written only when it changes,
never when the focused cell moves inside an unchanged selection: the cell
announces its own value as focus lands on it, and repeating the extent over
that would double-speak. It is also written only once the extent settles, so
holding `Shift`+`Down` says where the user stopped rather than one utterance
per keystroke.

---

## 5. Layout

- The workspace is a 2×2 slot grid holding one to four panes, arranged by
  preset: see `docs/adr/0006`. One pane is the floor and two is what a fresh
  visit opens. Never build a free slot editor.
- The app surface remains visible as a 0.5rem inset and a 0.5rem gap between panes.
  Each pane is a 0.5rem-radius surface with a subtle outline. With two or more
  panes, the active pane adds a thicker blue edge. A one-pane workspace has no
  persistent active edge because there is no competing pane to distinguish;
  keyboard focus remains visible. This framing applies at every supported width.
- The page never scrolls. Panes scroll independently.
- Below 56.25rem panes stack; the chosen layout is remembered, not discarded.
  Stacking **abandons** the tiling rather than narrowing it: the grid becomes a
  single column, panes stop naming slots, each keeps `min-h-pane-stack` so it
  stays worth scrolling to, and the workspace, not the page, scrolls between
  them. Resizers are not rendered, because neither axis splits. An inline
  `grid-area` naming a second column is the trap here: CSS will create that
  column even when the template says there is one, so the placement has to stop
  being emitted rather than be overridden.
- Pane headers are one row, `h-panel-header`, never wrapping or scrolling. A
  narrow pane shortens its labels rather than wrapping them.
- A pane's height must not change with its state: source diagnostics decorate
  the text and use tooltips rather than inserting a feedback row.
- The notice area is one labelled region floating over the workspace, fixed to
  the viewport's top trailing corner rather than placed in the layout. It takes
  no space, so showing or dismissing a notice moves nothing: the earlier
  in-layout band was itself the reflow this section forbids, because an idle
  notice area renders nothing and the first notice pushed every pane down. The
  top trailing corner is the one the floating action button does not own, and
  the region keeps the panes' own 0.5rem inset with no gutter reserved for what
  lies under it. It stays put while a stacked
  workspace scrolls under it, and its layer is `--z-notice` in `index.css`,
  above the floating action button and below menus, tooltips, and dialogs.
- A notice is not a dialog: no modal semantics, no focus trap, nothing blocked.
  Only the notices themselves take pointer events, so everything beside them
  stays operable. What is under a notice, though, is covered: the pane header
  it lands on, that pane's actions trigger included, and below the stacking
  width the column index strip as well. That is the accepted cost of a layer
  flush in the corner. Dismissal frees it, the trigger stays reachable from the
  keyboard while it is covered, and no notice that is on screen for long is
  undismissable.
- Each notice is only as wide as its content needs, up to a cap. The cap is a
  ceiling, not a width: a one-line message never draws a band across the table.
- A notice's anatomy is fixed. Dismissal holds the top trailing corner. The
  message and its actions share the column beside it, with the actions on their
  own row below the message, aligned to the same trailing edge as the message
  rather than running under the dismissal. Nothing in it moves with the message
  length. A floating notice adds the opaque surface, outline, and single shadow
  every floating layer here carries; the same component inside a dialog stays
  flat.
- A notice's actions carry no outline, because they are the quiet way out of a
  condition rather than a decision the surface is asking for. Weight, not
  colour, separates them from the message: the action is the body-strong style,
  never blue, never capitalised, never italic. Blue belongs to focus and
  selection, and capitals and italics cost legibility for the readers who can
  least afford it.
- The area holds every notice the app currently has, oldest first, with
  conditions ahead of one-off messages. Notices are never ranked against each
  other and never replace each other: something worth saying is worth showing,
  and a message that loses a contest is a message the user never gets. Each
  carries its own dismissal where dismissal makes sense.
- Every notice is app-level. There is no per-pane or per-view notice area: a
  failure belongs to the document the whole workspace is showing, and the same
  message repeated in four panes would be four interruptions. A source pane's
  own parse diagnostics are not notices; they decorate the text and use
  tooltips, as above.
- There is no app header. One floating action button is the document-level
  command surface at every viewport width. It is a floating layer and takes the
  floating surface and elevation, with no resting border. Its menu contains the Tabelo identity
  and description, the current table name with a Rename command, Undo, Redo,
  New table, Import, Download, Add view, Layout,
  and a link to the GitHub repository. The trigger has a stable accessible name
  and never replaces visible menu labels with unexplained icons. Global Add
  view chooses the first valid split in workspace reading order and opens the
  same view chooser as the pane-edge command. It does not ask for placement or
  maintain a second placement policy. The trigger keeps a panel surface and
  elevation without a visible resting border; keyboard focus still uses the
  shared focus treatment.
- A ready service-worker update adds one static accent dot to the FAB and a
  written "Reload to update" action to its menu. The trigger's accessible name
  also states that an update is available, so colour is never the only signal.
  Nothing moves, pulses, opens automatically, or interrupts editing. Applying
  the update first flushes the current document and pending draft to durable
  storage; a failed save leaves the current worker active.
- Pane-level actions live in that pane's header. Row and column actions live on
  the row or column and in the context menu. The grid has no redundant Table
  actions menu in its pane header.
- Each pane header carries one trigger and nothing else that acts. The view name
  and icon are static identity inside the pane heading, with no chevron or
  hidden click behavior. The trailing chevron, right-aligned, opens the pane
  actions menu. `Change view` is one entry in that menu and opens the shared
  choice dialog; it never opens a selector from the title.
- The space between the identity and the trailing trigger is the pane's status
  slot. What sits there is text: no role, no focus, nothing to press, and never
  a third action. It reports a temporary condition of the pane's content, such
  as how many occurrences an incremental selection has gathered, and a healthy
  idle pane leaves it empty. It grows leftward, so the trigger never moves, and
  it uses tabular figures so a rising count does not resize itself. Width
  pressure is absorbed by the identity's own truncation and the registry's
  short labels, never by shrinking status text below §2's floor. No state owns
  the slot exclusively: two conditions present at once still keep the header
  one row, with both meanings readable and no control displaced.
- The `Read only` badge sits beside the view identity because it reports state.
  The actions trigger names the view it belongs to, because with four panes open
  the view is what says which pane the command affects: "Pane actions:
  Markdown", never a bare "Pane".
- Editable pane bodies use the main panel surface. A non-editable pane uses the
  read-only surface and the written "Read only" label. Never rely on a muted
  background alone to communicate editability.
- The pane actions menu is flat and follows one semantic reading order. An
  applicable capability-driven Copy command comes first. Zoom and conditional
  source wrapping form one contiguous display group. Change view and structural
  pane actions form the final group. Separators communicate those groups without
  visible titles. Changing a view opens one dialog; zooming and closing remain
  plain menu items. A command that does not apply is absent when capability
  decides it, while a temporarily unavailable structural command remains in
  place, disabled with a written reason.
- Download and Layout remain document-level commands in the floating menu and
  keep their dialogs. Add view remains in the floating menu and on splittable
  pane edges; it never moves into the pane actions menu.
- Layout offers only the arrangements of the pane count that is open: two
  columns or two rows at two panes, the four asymmetric splits at three. It
  never adds or closes a pane, which Add view and Close view own. At one and
  four panes there is a single arrangement, so the command stays in place,
  disabled with a written reason, rather than disappearing.
- Move pane sits between Change view and Close view in the final pane group. It
  opens the spatial destination dialog and offers every other occupied position
  in the current preset. Choosing a destination swaps positions while pane id,
  view, zoom, wrap, draft ownership, and active state move together. The pane
  array returns to visual reading order, the preset and pane count stay fixed,
  and the operation is persisted workspace presentation rather than document
  history. At one pane, Move pane stays visible and disabled with a written
  reason.
- A view already open in another pane remains listed but disabled, with a
  tooltip explaining that it is already open. The current
  pane's own view remains selected and enabled. No workspace may show two
  instances of the same registered view.
- Add view is disabled, not hidden, at four panes. Close view is disabled, not
  hidden, at one pane. Both expose the shared written disabled reason.
- The global Add view command remains visible and disabled at four panes, with
  a tooltip explaining the limit. Pane-edge controls exist only where a split
  is possible.
- Nothing may reflow because of a selection change or a status change.
- Two-pane layouts may breathe, but do not enlarge controls or introduce an
  otherwise absent card. Four-pane layouts keep the same 0.875rem critical labels,
  focus treatment, and action ownership; labels shorten only through the
  registry's explicit short label and optional descriptions may disappear.
- Four-pane density is recovered by hiding healthy status, removing empty
  reserved rows, and grouping low-frequency actions. Never shrink critical
  text, focus targets, or state cues to make four panes fit.

---

## 6. Icons

Lucide only, `size-4` inside `control-md` and `size-3.5` inside `control-sm`.
All Lucide icons use the shared 1.5 stroke weight. Always `aria-hidden`, because
the accessible name comes from the button.

Directional glyphs are shared by three different table operations, so each one
takes its own family and no two of them may collapse back onto the plain arrow:
insert lands against a boundary line (`ArrowUpToLine` and its three siblings),
move is the long-stemmed `MoveUp` family, and fill keeps the plain `ArrowUp`
family it drags along. The four directions of a family are chosen as a set, not
one at a time.

Icon-only buttons are limited to the globally stable floating action trigger,
the grid's per-row and per-column affordances, and the pane header's actions
chevron, where a label would not fit. The pane chevron earns the exemption
because the view name beside it already carries the pane's identity: a second
labelled button there repeated the word "Pane" once per open pane. Its
accessible name is then the only signal it has, so that name states both the
action and the view.
Tooltip pointers use the shared Base UI arrow with one clipped triangular
shape. Do not reintroduce a rotated square or build feature-specific pointers.
Those axis affordances stay visually quiet with a small icon at rest, but their
target is grown to the 1.75rem control minimum with an `::after`
box rather than by taking layout the row gutter does not have. They appear on
hover, on `focus-within` of the row or column, while the menu is open, and for
whichever row and column the selection is currently in: the last of those is
what teaches the relationship without putting an icon on every row at once.
Every numbered gutter cell, including row 1, uses the same right-aligned,
normal-weight number and row-actions icon. The gutter token reserves separate
space for the number and for each affordance beside it, so revealing one never
covers a number.
The reorder grip is the third of those and follows the same reveal rule, sitting
on the leading side of the row number and in the column strip's leading track.
It is a drag target rather than a button: it is `aria-hidden` and never takes a
tab stop, exactly like the column resize handle, because `Alt`+arrows and the
menu's Move actions are its keyboard equal and a stop per row would be a trap
(§9). The header row has no grip, since every table keeps exactly one header row
and it is always the first; its track stays empty so the numbers stay aligned.
The pane-edge Add view control uses the full default control target and a larger
plus than row or column affordances. It remains centred on the edge band and is
revealed by edge hover or keyboard focus, never by hovering the pane body.
The floating trigger has a stable accessible name, and every command inside its
menu keeps a visible label. It displays the project mark rather than a generic
menu glyph. The mark is a small table grid whose blue header row and two active
centre cells form a compact T. `logo.svg` is the browser and interface source:
its rounded grid interior is an opaque dark surface, while the padding outside
that silhouette stays transparent. It uses one fixed palette in every browser
theme. `logo-maskable.svg` supplies a full blue field and safe-area geometry
for generated installable icons. Both must remain legible at 1rem, use only
product colours, and keep the grid silhouette intact.

---

## 7. Motion

Motion explains feedback, continuity, or progress. It is never decoration and
never delays a command. Shared motion strings in `packages/ui` own four useful
categories:

- interactive control state transitions name only background, border, colour,
  shadow, and opacity;
- pressable controls add transform for the subtle active press response;
- pane-edge disclosure changes only colour and opacity;
- transient layers transition opacity and a subtle 0.98 scale from the Base UI
  transform origin.

Every shared transition is 100ms with an ease-out curve. Never use
`transition-all`: a component may later add a layout property that must stay
instant. Grid geometry, cell selection, editing, focus ownership, document
synchronization, line numbers, and counters do not animate. Functional loading
spinners, real loading skeletons, and notification entry or exit may animate;
static status never pulses or bounces.

Menus, context menus, tooltips, dialogs, and their backdrop use Base UI's
`data-starting-style` and `data-ending-style` attributes with cancellable CSS
transitions. This lets a reversed interaction continue from its current visual
state and lets Base UI finish unmounting the layer correctly. Do not reintroduce
keyframe-based popup entry or side-dependent travel. See the
[Base UI animation guidance](https://base-ui.com/react/handbook/animation).

`prefers-reduced-motion` is honoured globally in `index.css` and must not be
re-enabled locally. Under reduced motion, popup scale becomes 1, transition
durations become effectively immediate, and spinner, pulse, and CodeMirror
cursor animations stop. The written state and progress label remain. This
implements the [W3C reduced-motion technique](https://www.w3.org/WAI/WCAG21/Techniques/css/C39.html).

---

## 8. Copy

Product identity and browser metadata live in `apps/web/src/copy/product.ts`;
all other user-visible strings live in `apps/web/src/copy/copy.ts`. A string
literal in a component is a pattern break. Stable domain IDs, user-entered
values, and generated document content are data rather than copy and remain
owned by their domain modules.

Tests choose commands, layouts, and views by semantic IDs and resolve their
accessible names through the canonical copy or registry. They never repeat a
product string just to locate or assert its UI. This keeps accessibility under
test without turning wording into a second source of truth. A deliberately
forbidden third-party error string may remain literal when the behavior under
test is precisely that it must not leak to the interface.

A test also never uses the same canonical copy or product constant as both the
production input and expected output. That proves only that a value equals
itself. Canonical copy may be used as a locator when the subsequent assertion is
about behavior, semantics, or state. Data-derived identifiers such as column
letters remain technical contracts rather than editorial wording.

Voice: plain, calm, present tense. Say what happened and what the user can do.
Never blame, never exclaim, never use humour in an error. Prefer "The source
does not parse yet" to "Oops! Something went wrong".

Labels are sentence case. Actions are verbs: "Add row", not "New row".

A notice is read at a glance while the user is doing something else, so it says
the least that still helps: what happened, and the recovery only when there is
one. Its action label is one short verb phrase, "Use as data" rather than "Use
it as data instead". Do not restate in the message what the interface already
shows, and do not name the product inside its own notice.

Prose names an alternative with the word "or", never a slash: a slash between
two options reads as a fraction and is spoken as one by a screen reader. A
keyboard shortcut is not an alternative at all: name the one key the user's
platform has, as §3 requires.

Terminal punctuation follows a structural split:

- **No full stop** on labels, fragments, and single noun phrases: view descriptions, layout descriptions, menu option descriptions, hints, and short confirmations.
- **Full stop** on complete sentences, and on any string of more than one sentence: multi-sentence error and recovery copy. Disabled reasons keep their stop because they are read aloud from tooltips and require a prosodic pause.

Never use the Unicode em dash character (U+2014) in product copy, metadata,
comments, or documentation. Choose punctuation that states the relationship
clearly instead.

---

## 9. Accessibility floor

These are requirements, not aspirations:

- The grid is fully operable from the keyboard, including reordering. The model
  below is the contract, not a summary of it.
- Every control has an accessible name; icon-only controls use `aria-label`.
- Focus is always visible and never trapped.
- Interface chrome is not text-selectable. Source text and rendered view
  content remain selectable; the visual grid uses structural cell selection
  instead of native text selection. Line numbers, pane titles, controls, dialog
  copy, menu copy, and portalled floating layers do not become selectable.
- Status is conveyed by text as well as colour.
- Contrast meets WCAG AA against the surface the element actually sits on.
- Nothing depends on hover alone: hover-revealed affordances also appear on
  keyboard focus.
- Use progressive disclosure for low-frequency actions, but keep the owning
  scope and menu label explicit. Do not require users to decode unfamiliar
  icons or remember hidden locations.
- Keep visible copy short, literal, and stable. Do not move controls or resize
  panes when selection or status changes.
- Accessibility validation must be executable in the CLI pipeline: inspect the
  browser accessibility tree and automate roles, names, states, relationships,
  keyboard paths, focus, and contrast. NVDA, JAWS, VoiceOver, and other GUI-only
  assistive applications are never acceptance or closure criteria. A separately
  arranged manual session can inform research, but it does not block delivery.
- The design may reduce common cognitive barriers, but Tabelo must not claim
  suitability for dyslexia, ADHD, or another condition without task-based
  sessions with representative participants. Record participants, tasks,
  outcomes, and changes before making such a claim.

### The grid keyboard model

One rule shapes the rest: **the workspace is a two-level ring. `Tab` walks between panes; `Enter` enters a pane, and `Escape` exits it.** A widget that answers every key is a trap, so the escape hatch is unconditional.

**What is at the workspace level is fixed per pane, never per row or per
column.** The ring holds the pane frame and the two triggers in its header, and
that is all: the header is chrome that belongs beside the pane, not content
inside it. Everything the view itself contains, including every select handle
and axis menu the grid grows, is reachable only after entering. So the number
of stops the ring holds is a property of the layout and never of the table.

A pane counts as entered when focus is in its **body**. Two consequences that
are easy to get wrong and both cost the whole model: focus reaching a header
trigger is not entry, and a scrolling body is not a tab stop. A browser puts an
overflowing scroll container into the tab order on its own, so every scrollable
surface in a pane states `tabindex="-1"` and is focused deliberately or not at
all.

`Enter` lands on what the view says is its content: the grid's focused cell,
the source editor, or, for a view with nothing focusable in it, its scroll
container, so the arrow keys still work.

| Key | Effect |
| :--- | :--- |
| Arrows | Move the focused cell. They stop at the edges and never leave the grid |
| `Shift`+Arrows | Extend the active area from its anchor |
| `Mod`+Arrows | Jump to the edge of the data along that axis |
| `Mod`+`Shift`+Arrows | Extend the active area to that same edge |
| `Mod`+`Alt`+`Shift`+Arrows | Move the focused cell without discarding the areas already selected |
| `Alt`+Arrows | Reorder one contiguous row or column block. A header-touching selection cannot move rows; several areas never collapse into one |
| `Mod`+`Alt`+Arrows | Repeat one contiguous data-cell selection into one more row or column in the requested direction |
| `Alt`+`Shift`+Left / Right | Narrow or widen the focused column without reordering it |
| `Tab` / `Shift`+`Tab` | Move one cell in reading order, wrapping at row ends and grid edges. It never leaves the grid |
| `Home` / `End` | First or last column of the row; with the modifier, the first or last cell of the table |
| `Enter` / `F2` | Edit the focused cell. On a column header, rename it |
| `Space` | On a column header, select the column: activating a button does what buttons do |
| `Ctrl`+`Space` | Add the focused cell's column to the selection, or take it away |
| `Ctrl`+`Shift`+`Space` | The same for its row |
| `Escape` | Close the innermost thing first: cancel an edit, close a menu, clear the copied mark, collapse a selection to one cell. If nothing else is open, exit the pane |
| `Backspace` | Clear the contents of the selection |
| `Mod`+`Backspace` | Remove the selected rows or columns |
| `Mod`+`Enter` | Add a row below |
| `Mod`+`Shift`+`Enter` | Add a row above |
| `Mod`+`Alt`+`Enter` | Add a column after |
| `Mod`+`Alt`+`Shift`+`Enter` | Add a column before |
| `Mod`+`F` | Open the find bar and put the caret in it. Taken from the browser deliberately: its own find searches the rendered chrome rather than the table |
| Any printable character | Replace the cell and start editing |

**A jump reads what the grid shows, and follows one rule on both axes.** When
the next cell continues the non-empty run the focus is already in, the target
is that run's far edge; otherwise the jump crosses the gap to the next cell
holding something; and when nothing holds anything in that direction, it lands
on the table's own edge. Only empty versus non-empty participates, and empty
means what the cell draws as empty, so a stored `null` and an empty string
behave alike. Nothing here reads a type out of text: see `docs/adr/0008`.

Vertically the header row is a structural endpoint rather than the first row of
data. An upward jump lands on it once the data above runs out, and a downward
jump from it begins at the first data row rather than treating the column's
name as the start of a run. Horizontally the header row is an ordinary line and
its names are walked like any other row's values.

**The four insert chords are one reversible matrix**, so learning one teaches
the rest: the modifier inserts, `Shift` flips which side of the selection the
new line lands on, and `Alt` switches the axis from rows to columns. Each one
ends in the same store action as the matching insert menu item, and each menu
item shows its key.

Moving the focus while keeping several selected areas is the one long chord in
the table, and it is long because every shorter arrow chord is spent:
`Alt` reorders, `Mod`+`Alt` fills, `Alt`+`Shift` sets column width, and the
jump above took `Mod`. It is kept rather than dropped because it is what makes
a second column reachable at all: `Ctrl`+`Space` adds the column the focus is
in, and without a move that preserves the areas already selected, every way to
reach the next column discards them. Multi-area selection would become
pointer-only, which is exactly what the rule above forbids. `Alt`+`Shift` is
therefore column width only when the modifier is absent.

The two `Space` chords are the one place the key table names `Ctrl` rather than
`Mod`. Both modifiers count as the modifier everywhere, but macOS keeps
`Cmd`+`Space` for itself and the page never sees it, so `Ctrl` is the one that
is true on every platform. macOS reserves `Ctrl`+arrows the same way, so there
it is `Cmd` that carries `Mod`+Arrows. Whichever one the platform leaves alone
is the one that works; neither chord is unreachable anywhere.

While a cell or header editor is open it owns every key, and the grid's own
handler stands down: a `Backspace` in an editor must never delete the row the
editor is sitting in.

Moving the pointer to another cell, header, grid control, or surface outside
the grid commits the open editor before the destination takes focus, just like
`Enter` or `Tab`. `Escape` is the only exit that discards the in-progress value.

**Every pointer affordance needs a keyboard equal.** Column width is the case
that proves it: the drag handle stays pointer-only and `aria-hidden`, while
`Alt`+`Shift`+Left/Right resizes the focused column and announces the resulting
width or limit through the grid status channel. The column menu adds Fit column
to content for the common automatic case, not stepping commands or a live
numeric readout. The modifier click that builds a selection out of several
areas is the same obligation, and the two `Space` chords above are its answer.

**An equal is an addition, never a replacement.** Reordering ships both ways:
`Alt`+arrows and the menu's four Move actions stay exactly as they are and
remain the accessible path, and dragging a reorder grip is offered beside them.
Both routes end in the same store action, so a drag can never produce a document
shape the keyboard could not, and both are one history step.

Copy fill follows the same rule. One handle sits at the active corner of one
contiguous data-cell selection, and the cell context menu keeps Fill up, down,
left, and right visible. `Mod`+`Alt`+arrows are the direct keyboard equal. All
three routes end in the same store action, tile the source values without
parsing or coercion, update every view immediately, and commit the complete fill
as one document-history step. A header-touching or several-area selection has no
handle, while the menu actions remain visible and explain why they are
unavailable.

The fill handle is a focusable overlay control with the 1.75rem control target
and a small square mark at its centre. It tracks the selected cell geometry, so
pane zoom, scrolling, resized columns, and wrapped rows need no parallel
position state. Its crosshair cursor keeps it distinct from cell selection,
column resize, and reorder. Once a drag crosses the shared threshold, its
dominant axis locks for that gesture. A dashed selection-colour preview covers
only the cells that would be added; it is static at every motion preference,
because §7 never animates grid geometry. `Escape`, pointer cancellation, lost
capture, window blur, or a release back inside the source clears the preview and
changes nothing.

**A series is a second command, never a reading of the first.** A fill repeats
what was selected and stops there. When the repeated cells were a single row or
column of at least two cells that already held numbers, separated by one
constant step, the fill leaves behind an offer: an info notice carrying `Fill
series` and `Keep copied values`. It says what a series would do and does
nothing until the user picks one. Choosing the series is a second document
operation and therefore a second undo step, so undo returns the copied result
before it returns the table the fill replaced. Dismissing it, answering `Keep
copied values`, or any change to the document clears it, and it is never
persisted, never history, and never document state.

The offer is a notice rather than a dialog because the fill already did what it
was asked to: nothing is pending, the table is correct as it stands, and §3
allows a dialog only for a choice the user's own command requires. That is also
why activation revalidates rather than trusting the offer. If the rows or
columns it named have moved, or the numbers would leave the range the arithmetic
stays exact in, it says so in a warning and writes nothing rather than applying
part of a sequence.

What is offered is deliberately narrow, and each exclusion is a decision rather
than an unimplemented case. Text that looks like a number is text and is never
read as one, because a type is carried and never derived: see `docs/adr/0008`.
A single value implies no step, so it offers nothing rather than assuming one.
Dates, weekdays, custom lists, text patterns, formulas, and series in two
directions at once are not offered at all: this is a table editor, not a
spreadsheet, and each of those is a guess about intent dressed as a
convenience.

**A gesture means one thing on one target.** The three drag targets in the grid
chrome are distinct elements, not three readings of the same press: the row
number and the column letter select, and drag-select along their axis; the
column letter's trailing edge resizes; the grip on the leading side reorders.
This is what the rule rests on, not cursor shape, though the grip does carry
`grab` and `grabbing` to confirm it. A reorder begins only once the pointer
crosses a small threshold along its own axis, so a press that does not travel
stays a press and keeps the selection it made. The gesture is mouse and pen
only: on touch a press-and-drag belongs to scrolling the pane, and the keyboard
and menu equals cover the operation there.

While a block is being dragged, one line marks the gap it will land in. The
document changes once, on drop. `Escape`, a cancelled or lost pointer, and a
drop back where the block already sits all leave the document and the selection
untouched.

### Selecting several areas

A selection is an ordered list of areas, and a single area is the ordinary
case: every gesture except the modifier produces exactly one.

- A plain click replaces the selection. `Shift` extends the **active** area,
  the one the keyboard is working in. The platform modifier adds an area, or
  removes one when the click names an area already selected.
- `Mod`+`Shift`+click extends the area the modifier most recently added, so the
  two gestures compose instead of fighting.
- Removing works along the axis the click names. A modifier click on a selected
  column letter subtracts that column, splitting one area in two when the
  column sat in the middle of it. A cell has no axis to subtract along, so a
  modifier click on one adds an area unless it names exactly that single cell.
- A selection is never empty. A subtraction that would empty it does nothing.
- Every count is a set: two areas covering the same column still describe one
  column, so a label never promises to delete something twice.
- **The modifier means "keep what is already selected" on the keyboard too.**
  `Mod`+arrows move the focused cell without discarding the other areas, which
  is what lets `Ctrl`+`Space` reach a second column at all. The single cell the
  focus sits on is provisional: moving it moves that cell rather than leaving a
  trail of one-cell areas, and turning its column or row into an area replaces
  it instead of painting it twice.

**Find is a second way of moving the selection, never a second highlight.**
`Mod`+`F` opens the grid pane's find bar (§3) and `Escape` closes it,
returning the caret to the grid. The chord fires from the grid surface only: a
cell or header editor owns every key while it is open, and a source editor keeps
whatever find behaviour it has. The pane menu carries the same command, because
a capability whose only entry point is a chord nobody was told about fails the
progressive-disclosure rule above.

Matching is literal, left to right, non-overlapping, and case-insensitive until
the toggle says otherwise. It runs over the canonical table in document order,
the header row first, because a header cell is an ordinary cell for every
purpose the user can observe. Cell values are opaque strings: nothing is
trimmed, normalized, unescaped, or read as a type, so a value holding `|` or a
newline is matched as exactly those characters and never as the syntax some
other format would wrap them in.

Stepping to a match **replaces the grid selection** with that cell and reveals
it clear of the sticky chrome, the same contract every other focus move honours.
The bar keeps the caret while this happens, so the walk is announced through the
shared polite channel rather than by the cell taking focus. Closing keeps the
cell the last match reached selected; restoring a selection the user has since
navigated away from would be a second surprise.

Only the **current** occurrence is marked, and only the characters that matched:
the product's solid accent with its paired foreground, drawn inside the value
the cell already shows. Every other match receives no second grid highlight,
because a second kind of highlight is a second visual language and §1 commits to
one. The mark is presentation and nothing else: the cell's accessible value, its
native tooltip, and every copy path still see one unbroken value, and which
occurrence it is comes from the written count rather than from the colour.

Select every matching cell turns the result into an ordinary grid selection,
one area per cell rather than per occurrence, which hands it straight to the
operations that already act on a selection: clear, copy, delete, alignment. It
counts coverage like every other selection, so a cell holding the query twice is
still one cell, and the grid's own extent announcement says how many, so nothing
is announced twice. The cell the bar was on stays the focused one.

Replace acts through the ordinary cell and header edit path, so one replacement
is one history step and Replace all is exactly one, whatever it touched.
Replaced text is written back as a string: a projection that was rewritten is
text, and nothing reads a type off it. A replacement equal to what was already
there writes nothing at all, so a native value keeps its type. Replace resumes
past what it just wrote, so a replacement containing the query cannot press back
on top of itself. The whole of it is transient: the query, the match list, and
the position never reach the document, the history timeline, or `localStorage`,
and the list is recomputed after every document change rather than having its
offsets patched.

**Operations that need one place to act say so.** Insert above, below, left and
right, the four moves, fill, and paste each need a single insertion point or
origin, and several areas name several. Fill additionally requires data cells
only. These actions are disabled with the reason written out, never hidden, per
§4. Copy, cut, clear, delete, duplicate, alignment and width all act on the
union of the areas.

The announcement states the total across every area, not the extent of the last
one: two selected columns announce as two.

Cursor shape confirms the interaction before a click: buttons, menu actions,
checkboxes, radio controls, and clickable row or column labels use `pointer`;
editable text uses `text`; cells use `cell`; split and column handles use the
matching resize cursor; reorder grips use `grab`, and `grabbing` while held;
the fill handle uses `crosshair`; disabled controls use `not-allowed`. Do not
apply a pointer cursor to passive labels or read-only content.

### Naming inside the grid

A cell is named by **its value**, never by its coordinates. Row and column
headers carry the context around it, so a screen reader composes the
announcement itself and stays quiet about the parts that did not change as the
user moves along a row.

That means header cells name themselves after what they contain, not after the
controls they hold: the header row is visibly numbered 1, the first data row is
"Row 2", and each column header is its own text. The header row uses its own
editable table-header surface, matches the body row height, and paints the
selection fill whenever selected. Its text position reflects left, centre, or
right alignment; the editable cell carries no separate alignment or menu icon.
An `aria-label` on a gridcell is a defect: it replaces the content with
coordinates and repeats them on every arrow key.

The real type supplements that content instead of replacing it. Every native
number, boolean, and null, plus any string that diverges from its column
expectation, includes visually hidden full type text inside the gridcell.
The visible compact mark appears only for divergence. A null cell therefore
has a written accessible value even though its `cellText` projection is empty.
Opening its editor retains the native-value typeface and includes the real type
in the editor's accessible name. Neither treatment adds another focus target.

Grid entry follows the column expectation without turning it into inference.
Text columns store every character as a string, including leading zeroes,
exponents, boolean words, and apostrophes. Number and boolean columns accept
canonical input as that native type. One leading apostrophe explicitly stores
the remainder as a string, so `'hello` stores `hello` and `''hello` stores
`'hello`. Representation-changing valid input and invalid input use the decision
dialog above; neither changes the document until the user chooses. Merely
opening and committing an unchanged editor preserves the existing real type.

**A header cell holds editable text and nothing else.** It is a cell for every
purpose the user can observe: it is selectable, it answers Enter, F2, and
typing, and `Backspace` clears it. Deleting its row is not a refusal either:
`Mod`+`Backspace` and the Delete rows menu item remove it and promote the first
surviving row into the header, so the table passes from one header row to one
header row and the gesture means the same thing on row 1 as on any other row.
Everything that acts on the column as a whole (selecting it, its menu, its
resize handle) belongs to the column index strip, not to the header cell.

Because it is a row, **the boundary under the header row is an ordinary row
boundary**: `--line-subtle`, the same one every pair of data rows draws, across
the gutter and the cells alike. `--line-strong` stays on the boundaries between
the grid's chrome and its table, which is what the column index strip, the two
corners, and the gutter's outer edge draw.

Because it is sticky, **its fill is composited over an opaque base**. Body rows
scroll under the header, and both fills it can wear, the header surface and
`--selection-fill`, are translucent tints, so on their own they would let the
scrolling text read through. The tints keep their values: `index.css` paints
each one as a background layer over `--surface-panel` in a utility the header
cell uses instead of the bare `bg-` utility, so the rendered colour at rest is
unchanged and the non-sticky users of the same tokens are untouched. Any other
sticky cell that carries a tint reuses that utility rather than raising a token
to full opacity.

The numbered row gutter is interface chrome, not selected data. It never takes
`--selection-fill`, even when its row or the whole table is selected. Every
number is right-aligned and normal weight, including row 1, matching source and
read-only view line gutters. Row 1 keeps the same row-actions control as every
data row; actions that cannot apply to the required header remain disabled and
explain why.

Cell wrapping is a persisted workspace preference per column, keyed by the
column's stable id and off by default. It never changes the document, codecs,
clipboard output, or undo timeline. A wrapped column preserves spaces and line
breaks, wraps long text inside the authoritative column width, and lets each
row grow to its tallest cell while `--grid-row-h` remains the floor. Row numbers
stay on the first visual line of that variable-height row, and arrow keys still
move one cell rather than one visual line. The semantic checked item in the
column menu is the sole control for this preference. Fit is disabled while the
column wraps, with a written reason to turn wrapping off first.

**An empty header stays empty.** Nothing generates a name for a column the user
has not named. An unnamed column is identified by its letter on the index strip,
and that letter is what its accessible name falls back to, so the announcement
is never silent and no invented text ever reaches the document.

That one letter is the column's identity in three places, from one shared
helper so they can never disagree: the index strip shows it, the accessible name
falls back to it, and the JSON view keys an unnamed column by it. The last is a
deliberate format-local exception, not generated document content: the header
stays empty, no other format ever sees a letter, and the cost is that reading
that JSON back produces a column actually named after the letter.

### The column index strip

A row of column letters (`A`, `B`, ... `Z`, `AA`) sits above the header row and
mirrors the row-number gutter on the other axis. Both are chrome:

- It is **not a table row.** It carries `role="presentation"` so it never counts
  toward `aria-rowcount` or shifts `aria-rowindex`; the header row is still row
  1. Presentation rather than `aria-hidden`, because the controls it holds must
  stay reachable.
- Like the gutter, it **keeps its size at every zoom level** (`--grid-strip-h`).
  At 100% it is exactly one table-row baseline tall, so the strip, header row,
  and body begin on one vertical rhythm.
- **It owns the column.** Clicking a letter selects the whole column, header
  included. The letter is paired with the compact mark for the column's
  expected type. The select control and column-actions control both include
  the full expected type in their accessible names, so the same metadata is
  available by keyboard without another tab stop. The column menu and the
  resize handle live here, revealed by the same rule as the row affordances
  (§6).
- **A per-column property follows the selection.** Alignment, expected type,
  and width applied to a column that is selected as a column apply to every
  selected column, adjacent or not. Applied to any other column they stay there,
  so dragging an
  unrelated edge never resizes something elsewhere. For the same reason a menu
  opened on a target already inside the selection keeps the selection instead of
  collapsing onto it: collapsing would silently discard the rest of what the
  user picked and leave the menu acting on one column of several.
- It is never itself selected and never takes `--selection-fill`. Selecting a
  column paints the header and body cells it represents, while this metadata
  strip remains chrome.
- Its leftmost cell, where the letters meet the row numbers, is a dead corner:
  an empty presentational cell, never a control.

Four sticky layers now overlap, and their order is deliberate rather than
accidental: body cells paint under the row gutter (`z-10`), which paints under
the strip and header cells (`z-20`), which paint under the two corners that
stick on both axes (`z-30`). A sticky cell must not also be `relative`: the
later rule wins and turns the sticky offset into a static shift.

### Pinning the first data row and column

The chrome above is always sticky. Two data layers are sticky **only when the
user asks for them**, from a checkbox in the axis menu of the first data row and
of the first data column, which are the only row and column either preference can
reach. There is no freeze boundary of N rows or N columns: that is the
spreadsheet shape the product declines, and two booleans answer the same need
without a boundary to place, a control to place it with, or a number to explain.

- Both are **workspace display preferences**, stored beside per-column wrapping.
  Neither reaches the document, a codec, the clipboard, a download, or the undo
  timeline, and neither is per-pane: each view appears at most once, so there is
  one grid to pin.
- They **slot between the existing layers** rather than beside them. A pinned
  cell takes `z-index: 5`, above ordinary cells and below the row gutter; the one
  cell belonging to both layers renders their intersection once, at `6`. The rule
  against pairing `sticky` with `relative` applies here too, so a pinned cell
  drops the `relative` its clipboard mark would otherwise resolve against and
  uses the sticky containing block instead.
- A pinned cell **paints an opaque fill**, for the reason the header row already
  does: live rows and columns pass underneath it, and a translucent selection
  tint would let their text read through. The unselected fill is the pane
  surface and needs nothing; the selected one is the sticky composition.
- The **non-color cue is the boundary line.** A pinned edge takes the strong line
  the grid already draws around chrome, against the subtle line every interior
  boundary carries. No new token, and it survives forced colours.
- **Pinning the only row or the only column draws nothing.** There is nothing for
  it to hold position against. The preference is still recorded and still shown
  as checked, so it becomes effective by itself once the table grows.

The pane body is the grid's scroll container. Its optimal viewing region uses
`scroll-padding-top` equal to the strip plus one content line box and
`scroll-padding-left` equal to the gutter. The strip and gutter remain fixed
chrome while the content line box follows pane zoom, so the compensation derives
from the same tokens as the layers it reserves. That declaration governs every
scroll the browser starts on its own.

A pinned layer extends that region by its own size, and its size is not a token:
the header row grows when a header wraps, and a pinned row grows with its tallest
cell. The grid measures each pinned layer and publishes it as a custom property,
which the declaration adds when present and ignores when absent. Absent means
unpinned, so the fallback is zero rather than a size.

**The grid moves its own focus, though, and does not rely on it.** Chrome
honours only part of `scroll-padding-left` when it reveals a focused cell,
delivering roughly half, so the clearance shrank as the gutter grew and the
contract survived on a few pixels of slack. The grid therefore focuses with
`preventScroll` and performs the smallest scroll itself. It measures the two
boundaries from the elements that draw them, the gutter's trailing edge and the
header row's bottom edge, or a pinned layer's edge where one stands in front of
them, rather than recomputing them from tokens: a sticky
cell's own rectangle already is its stuck position, so those are the boundaries
the contract is written about at any zoom and any gutter width, with nothing to
keep in step. The remainder is rounded outwards, because a cell left a fraction
of a pixel under the gutter has still failed.

When a cell is wider or taller than the region the chrome leaves over, both
edges cannot be satisfied at once and the leading edge wins. That is where the
value starts, so aligning the trailing edge would scroll the beginning of the
content out of sight to reveal an end the reader has not reached. A column can
be set to 64rem against a pane a fraction of that wide, so this is an ordinary
arrangement, not an extreme one.

Dragging a cell, row number, or column letter past the pane edge autoscrolls the
grid on the axes that gesture owns and continues extending the selection. A
reorder grip autoscrolls the same way and keeps moving the drop line instead,
while a fill handle extends its preview. One controller owns every grid drag,
clamps velocity, and stops at the document edge; reorder and fill gestures
consume it rather than creating parallel frame loops. Reduced motion keeps the
capability but advances in discrete rows or columns. `Shift` plus the arrow keys
is selection drag's keyboard equal; reordering and fill use the chords recorded
in the keyboard table above.
