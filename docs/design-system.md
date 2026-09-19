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
introduces the code, in the section that owns the subject, and cite the issue,
pull request, or commit that decided it (`#N` or a short commit hash). A rule
never lives only in an issue: a coordination or tracking issue is a queue, not
the record, and a decision left there is one this document does not have.
Where a rule replaces an earlier one, rewrite the paragraph rather than
appending the change as chronology (#85).

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

### Design references

Four products are the reference for how Tabelo looks and behaves, each for one
part of it (owner, 2026-09-19). A reference settles a question this document
leaves open; it never overrides a rule stated here, and nothing is copied from
any of them.

| Reference | What it is the reference for |
| :--- | :--- |
| Claude (claude.ai) | The visual language: warm neutral greys one step apart per layer, the type, stacked option blocks with a line of detail, soft borders with shadowed floating layers, one blue accent. The approved start surface came from it |
| Linear | Menus, keyboard-first operation, shortcut hints, and density: compact where the user works fast, never cramped |
| Notion databases | The visual table: row lines only, no vertical dividers or chrome bands, the header set apart by weight |
| VS Code and Zed | The source views: line numbers inside the code box, whitespace and empty-value markers, caret and selection behaviour |

Spreadsheet products (Excel, Google Sheets) are deliberately not references:
Tabelo is a focused table editor, not a spreadsheet (`docs/product.md`).

The earlier palette and radius scale came from
[petrroll/markdown-to-teams](https://github.com/petrroll/markdown-to-teams); on
2026-09-18 the owner replaced them with the look above: warm neutral greys,
Figtree, a deeper primary blue that carries white text, and a 0.5rem/0.75rem
radius scale.

- **Structured.** Grid cells, row and column headers, resize affordances, pane
  edges, and major workspace divisions are rectilinear. The table remains the
  visual anchor.
- **Friendly.** Buttons, fields, menu items, and option blocks use a 0.5rem
  control radius; a checkbox uses the 0.25rem indicator radius so it never reads
  as a radio. Panels, menus, dialogs, notices, and other contained or floating
  surfaces use a 0.75rem surface radius, except the tooltip, which keeps the
  control radius ([§3 Tooltip](design-system/3-components.md#tooltip)). There are no pills or arbitrarily rounded
  containers.
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

## Parts

Sections 2, 3, 4, 5, and 9 each live in their own file under
`docs/design-system/`, and are as binding as this one (#336). Section numbers
are global and never renumbered, so a citation such as `docs/design-system.md
§9` resolves through this table. A new citation names the part's path.

| § | Part | Scope |
| :--- | :--- | :--- |
| 2 | [Tokens](design-system/2-tokens.md) | Colour, geometry, content-scale, syntax, spacing, and typography tokens, and the rule for using them |
| 3 | [Components](design-system/3-components.md) | Composition, reuse, tooltips, menus, the rendered preview, the empty workspace, pane tool bars, dialogs, and layer ownership |
| 4 | [Interaction states](design-system/4-interaction-states.md) | The state every interactive element defines, notice severity, and announcing |
| 5 | [Layout](design-system/5-layout.md) | The workspace, panes, stacking, notices, and the floating app menu |
| 9 | [Accessibility floor](design-system/9-accessibility.md) | The accessibility floor, the grid and source-editor keyboard models, several areas, naming, the column index strip, column markers, and pinning |

---

## 6. Icons

Tabler outline icons only (`@tabler/icons-react`), `size-4` inside `control-md`
and `size-3.5` inside `control-sm`. Tabler replaced Lucide by owner decision on
2026-09-19, so the product draws from the same set as the approved mockups. Every
icon uses the shared 1.5 stroke weight, applied once through the `.tabler-icon`
rule in the global stylesheet, never per call site. Always `aria-hidden`,
because the accessible name comes from the button.

**View icons are one family** (owner, 2026-09-19). Every text format is a
file, so every text view wears a Tabler file icon carrying that format's mark:
`IconFileTypeCsv` for CSV, `IconFileSpreadsheet` for TSV, `IconFileTypeHtml`
for HTML, `IconFileTypeTxt` for Jira, `IconFileCode2` (square brackets, the
array a JSON table is) for JSON, `IconFileTypography` (formatted text) for
Markdown, and
`IconFileDescription` for Records. Tabler draws no Markdown or JSON file type,
so those two take the closest file sibling rather than leaving the family. The
two views that are not files keep their own shapes: `IconTable` for the visual
table and `IconEye` for the preview. A brand mark or a bare format glyph
outside a file shape is a pattern break. The registry owns the assignment.

Directional glyphs are shared by three different table operations, so each one
takes its own family and no two of them may collapse back onto the plain arrow:
insert lands against a boundary line (`IconArrowBarToUp` and its three
siblings), move is the long-stemmed `IconArrowNarrowUp` family, and fill keeps
the plain `IconArrowUp` family it drags along. The four directions of a family
are chosen as a set, not one at a time.

Icon-only buttons are limited to the globally stable floating action trigger
and the pane header's actions chevron, where a label would not fit. The pane chevron earns the exemption
because the view name beside it already carries the pane's identity: a second
labelled button there repeated the word "Pane" once per open pane. Its
accessible name is then the only signal it has, so that name states both the
action and the view.
**The grid draws no affordance icon beside a row number or a column letter**
(decided on #288). Each label is one control: the row number or the column
letter, which selects its row or column, carries the reorder gesture once that
row or column is selected ([§9](design-system/9-accessibility.md)), and is where the grid's context menu opens for
its axis. Right-click, `Shift`+`F10`, and the `ContextMenu` key reach that
menu; nothing hover-revealed stands in for it. Every numbered gutter cell,
including row 1, uses the same right-aligned, normal-weight number, and the
number fills its cell so the whole cell is the target. The gutter is sized for
the number alone: three digits of the index face plus one small gap on each
side (`--grid-gutter-w`, [§2 Geometry](design-system/2-tokens.md#geometry)). A column letter carries the
cells' own inline padding, so it starts exactly where the text of its column
starts.
The pane-edge Add view control uses the full default control target and a larger
plus than the grid's labels. It remains centred on the edge band and is
revealed by edge hover or keyboard focus, never by hovering the pane body.
The floating trigger has a stable accessible name, and every command inside its
menu keeps a visible label. It displays the project mark rather than a generic
menu glyph. The mark is a small table grid whose blue header row and two active
centre cells form a compact T. `logo.svg` is the one source for the mark
everywhere, the interface, the favicon, and every generated installable icon:
its rounded grid interior is an opaque dark surface, while the padding outside
that silhouette stays transparent. It uses one fixed palette in every browser
theme. The generator keeps that transparent exterior in the favicon and the
ordinary PWA icons, and composites the maskable and Apple outputs, whose
platforms fill transparency with a colour of their own, onto `#1c1c1b` with the
safe-area padding those contexts need. Decided on #307, replacing the separate
blue-field source. The mark must remain legible at 1rem, use only product
colours, and keep the grid silhouette intact.

Tooltip pointers use the shared Base UI arrow with one clipped triangular
shape. Do not reintroduce a rotated square or build feature-specific pointers
(c3dc59a).

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
Never blame, never exclaim, never use humour in an error. Prefer "These edits
aren't valid yet" to "Oops! Something went wrong".

The rules below were settled in the full copy review (Decided on #78).

**Capitalization.** Labels, titles, buttons, menu items, and accessible names
are sentence case. Product, format, and key names keep their own capitals
(Markdown, CSV, Enter). Inside an accessible name, a qualifier after a comma
stays lowercase: "Name, expected type number".

**Commands.** Actions are verbs: "Add row", not "New row". Each action has one
wording everywhere it appears, and the label says what the command does:
"Go to cell" selects the offending cell, so it is not called a fix. Two
conventional names are allowed although they are not verbs: `New table`, the
"New <thing>" command every editor offers, and `Settings`, the entry named for
what it opens. A dialog is titled for what it holds while the command that
opens it stays a verb: the `Change layout` command opens the `Layout` dialog.

**Descriptions.** The line under a label, in a menu, a choice list, or a
dialog field, is a fragment or noun phrase of roughly 45 characters or fewer:
"Tab-separated, pastes into spreadsheets". It carries no full stop.

**Disabled reasons.** One or two sentences. The first states what blocks the
action; when the user can change that, the second says how: "Four views is
the maximum. Close one to add another." A block the user cannot lift is
stated alone: "At least one view must stay open."

**Contractions.** Descriptions, notices, errors, and disabled reasons use
contractions ("can't", "isn't", "doesn't"), because they are read as speech.
Labels, buttons, and titles never do.

**Vocabulary.** Copy names each concept once, with the interface names in
`CONTEXT.md`: a string value is **text**, a view that shows the table as text
is a **source view**, a draft is **unfinished edits**, the rendered preview
produces a **formatted table**, the ranges a source editor gathers are
**matches**, and structural assistance is **Smart editing**. "Header" stays
the word in sentences. A choice that cannot be taken says `Unavailable`;
"blocked" is kept for a browser that refused a permission, such as the
clipboard.

**Accessible names.** They get the same review as visible copy. A name that
pairs a command family with its target reads "Family: target", as in
"Pane actions: Markdown", and one copy function builds it. Positions use what
the grid shows: row numbers and column letters, "Row 2, column A". A shortcut
named inside a sentence is spoken through the platform key helper in
`packages/ui` (`spokenShortcut`), never written as the placeholder `Mod`. The
key names themselves, spoken ("Command", "Option", "Up arrow") and printed on
non-Apple keyboards ("Ctrl", "Esc"), are product copy in `copy.keys`: the app
passes that table to `spokenShortcut` and provides it once at its root for
the menu legend, and `packages/ui` keeps only the tokenizer and the glyphs.

**Composition.** A component never appends punctuation, a space, or another
string to a copy value to finish a sentence or a name. When a string needs a
variable part or its closing stop, the copy function returns the whole string.
Placing a separate element beside a label, such as a link after "Made by", is
layout and not composition.

A notice is read at a glance while the user is doing something else, so it says
the least that still helps: what happened, and the recovery only when there is
one. Its action label is one short verb phrase, "Use as data" rather than "Use
it as data instead". Do not restate in the message what the interface already
shows, and do not name the product inside its own notice. The message carries
what happened and what to do; a consequence that holds for every case, such as
"Your table is unchanged." after any refused import, goes on the notice's
detail line instead of being repeated in each message.

Prose names an alternative with the word "or", never a slash: a slash between
two options reads as a fraction and is spoken as one by a screen reader. A
keyboard shortcut is not an alternative at all: name the one key the user's
platform has, as [§3](design-system/3-components.md) requires.

Terminal punctuation follows a structural split:

- **No full stop** on labels, fragments, and single noun phrases: view descriptions, layout descriptions, menu option descriptions, dialog hints, and short confirmations.
- **Full stop** on complete sentences, and on any string of more than one sentence: multi-sentence error and recovery copy. Disabled reasons keep their stop because they are read aloud from tooltips and require a prosodic pause.

Never use the Unicode em dash character (U+2014) in product copy, metadata,
comments, or documentation. Choose punctuation that states the relationship
clearly instead.
