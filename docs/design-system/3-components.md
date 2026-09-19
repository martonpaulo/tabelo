Part of the [Tabelo Design System](../design-system.md). Its entry point lists every part.

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
0.5rem control radius, 0.75rem type, the shared padding, and the shared
clipped triangular pointer ([§6](../design-system.md#6-icons)). A tooltip explains its trigger and never
carries the only copy of something the user needs, because it is transient and
because pointer-only affordances fail [§9](9-accessibility.md). Every tooltip opens on keyboard focus
as well as hover. Keyboard focus means focus the user moved there, with Tab or
with the arrow, Home, End, or page keys: focus the product places, such as a
menu or dialog handing focus back to its trigger as it closes, raises no
tooltip, because it covered whatever the user looked at next (owner,
2026-09-19). `ControlTooltip` owns that distinction. When it explains why a control is unavailable, the tooltip is
the visual echo of a persistent accessible description on the control. The
shared disabled-tooltip pattern keeps an `sr-only` copy mounted and associates
the control with it through `aria-describedby`; the transient popup is never
the description's only owner.

**An icon-only action names itself** (#277). A control whose only content is
an icon shows its name on hover and on keyboard focus, and the name is written
once: `ControlTooltip`'s `name` becomes both the control's `aria-label` and the
tooltip, so the words shown and the words announced cannot drift apart. That
tooltip is hidden from the accessibility tree, which already has the name, so
nothing is announced twice, and it rides on the control itself rather than a
wrapper, so a menu trigger still opens on the first press. A control carries
one tooltip: `ControlTooltip` takes the name and the disabled reason together,
shows the reason whenever there is one (the user who cannot use a control needs
the refusal, not its name), and refuses to be nested inside another. Three
icon-only controls carry none, each for a stated reason: the fill handle and
the pane splitter are drag targets, where a floating layer would open over the
cells or panes the drag is reaching, and the dialog close button is never
rendered, because every dialog closes through Cancel and `Escape`.

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
drawn. In a menu, a checked option uses the shared `--selection-fill` row
background, a quiet tint that suits a dense list; in a dialog, the option block
below takes the solid primary instead (owner decision, 2026-09-18). Pointer hover and keyboard highlight use
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
and context menus alike (#75). A visible group title is reserved for the three
inline segmented choices, Expected type, Alignment, and Cell type, and for
Edit (owner, 2026-09-19). It is canonical copy rendered through GroupLabel, and
the Group is named with `aria-labelledby`. Clipboard, Insert, Remove, and the
self-explanatory width actions (Fit column to content, Set column width) remain
untitled semantic groups, without an empty label. Move, Fill, and Move focus
are named by their submenu trigger and by that menu's own accessible name
instead, so their items travel into the child menu without a GroupLabel of
their own, and the three triggers share one untitled group with no separator
between them: three one-item groups only lengthened the menu (owner,
2026-09-19). Group labels
are non-interactive and arrow-key navigation skips them. App and pane menus
follow the same grouping contract.

A submenu is allowed for exactly one shape: **a flat list of immediate,
self-explanatory commands that needs no explanatory state**. Every row performs
its command the moment it is chosen, there is nothing to state beforehand, and
nothing to unwind afterwards. The approved members are the global `Copy as` (#149),
whose rows are the codec registry and which is the standing example; column
`Alignment` (#155) and cell `Cell type`, which keep their radio-group semantics
wherever they are placed; and the three named groups of four directional
commands in the grid's menus, `Move`, `Fill`, and `Move focus, keep
selection`, folded in on #369 because a flat grid context menu had grown taller
than a laptop screen. Clipboard, Insert, Edit, and Remove stay on the first
level, one click away. Nothing else nests, and a submenu never contains a
second submenu.

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
menu primitive. `@tabelo/ui/lib/shortcut` owns how a legend string splits into
the keys it names, so the rendered `<kbd>` count and the three-key limit in
[section 9](9-accessibility.md) are counted the same way.

Key legends follow the user's platform, which the app already knows. Apple
keyboards get the glyphs their keys are printed with: `⌘`, `⌃`, `⌥`, `⇧`, `⌫`,
`↵`, `⎋`, `⇥`. Every other platform gets the words its keys are printed with:
`Ctrl`, `Alt`, `Shift`, `Backspace`, `Enter`, `Esc`, `Tab`. Those words and
the spoken key names are copy, supplied from `copy.keys` through a provider
the app mounts once at its root; the glyphs stay in `packages/ui`. Arrows and the
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

- **No card.** The pane already supplies the surface. Do not wrap the table in
  a second container. The table itself is drawn like the tables in Claude's
  answers (owner, 2026-09-19): one rounded hairline around it, the header on
  the quiet `--surface-header` band in medium weight, and row lines only, with
  no vertical dividers.
- **No zebra striping.** An alternating tint encodes nothing about the row, so it
  is decoration under [§1](../design-system.md#1-the-design-line), and it borrows the header surface for rows that are not
  headers.
- **Thin rules.** `--line-subtle` at 0.0625rem between rows and around the
  table, per [§2](2-tokens.md), and none between columns.
- **The header is medium-weight text on the `--surface-header` band**, the one
  place the preview uses a tone, because a document table in the destinations
  it previews shows its header that way.
- **Tabelo's own type**, at `text-content` so the preview scales with the pane.
- **Sized to its content, capped at the pane width.** A narrow table is not
  stretched across a wide pane, and a wide one wraps instead of forcing the
  reader sideways. Cells keep `whitespace-pre-wrap`, so the line breaks the
  codecs escape survive. Alignment comes from the column's own alignment.
- **A document with no rows shows a written empty state**, not a bare header row.
- **Inline content renders as its semantic elements** (#306): `strong`, `em`,
  `u`, `s`, and `code` on the `font-value` token, built as React elements from
  the document's nodes, never from authored markup. Formatting is carried by
  the elements, not by colour. A link that opens is underlined; an address
  Tabelo will not open keeps a dotted underline, is not a link, and explains
  itself through its title and accessible description. An image is capped by
  `--spacing-inline-image`; one that may not load or fails shows the photo-off
  icon beside its alternative text, in the muted tone, as one `img` named by
  that text. The shared primitive lives in `apps/web/src/ui/inline/` so the
  grid can render the same elements. The link and image styling here is the
  minimal document default and awaits the owner's review with the Visual
  Table mockup.

### Empty workspace

After hydration, an initially empty document with no source draft presents the
existing Start with surface in the centre of the workspace. The normal workspace
stays visible only as blurred context and is inert; the global action button is hidden
until the user chooses an empty table, pastes, or imports. This is an onboarding
surface, not a dialog: it does not claim modal semantics and never appears
automatically over saved content, an unfinished draft, or a table the user
emptied during the current visit. An explicit New table command resets the
document first and then returns to this surface (#46). A trusted `Mod`+`V` paste event
starts the table directly while the surface is open.

**The first content of a session decides what the workspace opens as.** A
paste or import made while nothing has been worked on yet arranges two panes in
columns: the format the content arrived in on the left, the visual table it
became on the right, with the table active and focus placed on its pane frame.
This is the moment the product explains itself, so it says what it means
without a sentence: the same table, in two representations, side by side.
Content no editable view owns, plain text and Tabelo's own clipboard payload,
keeps the ordinary default instead. Only the first content does this: once the
session holds a table or a draft, an import replaces the document and leaves
the arrangement exactly as the user set it up. The result is saved like any
other workspace, so returning to the app keeps it.

Its three entry actions use the shared decision-action group: right-aligned in
one horizontal row at every supported width. Ordinary alternatives come first
and the primary starting action comes last, at the far right. Their DOM and
focus order follows that same semantic priority. The surface grows to the row's
intrinsic width and the action row never becomes a scroll container.

The credit and source links under the actions keep the `text-xs` helper size
and are each at least 1.5rem tall, the WCAG 2.5.8 target minimum, through
vertical padding rather than larger text, with no gap between the two lines
(owner, 2026-09-19).

### A pane's own tool bar

The find bar is the one surface of this shape, and adding a second kind is a
pattern break under [§0](../design-system.md#0-pattern-break-protocol-read-this-first). Every pane has its own (#280, superseding #144's
grid-only bar), each searching what that pane shows, and the rules below hold
for all of them. It is not a dialog and not a floating layer: it is a tool the
user works **alongside** the pane's content for as long as the errand lasts, so
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
  everything else in the bar. A read-only pane renders no replace row and no
  disclosure at all, rather than disabled ones: there is nothing it could
  replace, and the bar's name drops "and replace" with them. The view's
  `editable` capability decides, never its id.
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
  than by keystroke. The controls beside a field stay on its first row. A field
  takes the typeface of the view it belongs to, so a query typed against a
  monospaced source reads the way the source does.
- **Its one piece of state is passive text.** The match count is a legend beside
  the controls with no role and nothing to press, and it reads compactly
  (`3/14`) while the same number is spoken in full through the shared polite
  channel, because a sentence read on its own has no controls beside it to give
  a compact legend its meaning.
- **A keyboard-first tool still needs a way in.** Its shortcut is the discovery
  problem, not the surface, so the owning pane's menu carries the command that
  opens it, with the shortcut beside it. See [§9](9-accessibility.md).

### Dialog

A dialog is allowed **only as the direct result of a command the user issued**,
and only when the command has a choice to make that the current menu cannot
hold without cascading: a choice with its own options, one that needs stating
before it happens, or the layout gallery opened from the global menu. The
download chooser holds format-specific output choices. New table also uses a
dialog when the current visit has held valid content or a pending draft would
be lost; an untouched session returns to onboarding without interruption (#46).

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

Moving a pane also qualifies because the choice is spatial (#73). The Move pane
dialog shows every other occupied position in the current preset through a
small layout diagram and a worded name such as "Top left" or "Right, full
height". The diagram is supplemental; the words carry the destination for
assistive technology. Choosing one swaps the two pane positions without
changing the preset or pane count.

Settings is the other deliberate exception. It holds the four global source
display defaults (#55, #276), and each one applies as it changes: a read-only preview at
the top of the dialog is a real source editor built from the same indicator
extensions every text view uses, so the effect is visible before the dialog
closes and no Apply step is left to confirm. Its title carries no icon, like
every other dialog's. The footer is the shared action row, `Reset to defaults`
as the ordinary alternative and `Done` last, stacking at full width on a phone
(owner, 2026-09-19). Each option block's glyph sits in one fixed slot as wide
as the widest mark, so every row's label starts on the same line, and the
preview keeps a trailing gap so a clipped line never touches its box. Wrap
lines, empty values, and tabs are option blocks whose icon is the mark they
draw, wrapping's being the pane menu's own icon because it draws no mark, and
whose control is a `Switch`; spaces is one option block holding a
`SegmentedControl` of its four modes, with the chosen mode's description above
it. A write the browser refuses is reported in place and the controls show what
was actually saved. The owner replaced the earlier transactional draft with
this on 2026-09-18. There is no theme choice, because there is one palette
(#289). A pane's own overrides of those defaults, and pane zoom, belong to the
pane menu.

`Switch` and `SegmentedControl` live in `packages/ui` and are the only way to
draw their two kinds of choice. A `Switch` is an on/off setting that takes
effect at once; an on/off choice that waits for a confirm, such as a download
option, stays a checkbox. A `SegmentedControl` is one value out of two to four
short, mutually exclusive ones that fit side by side; longer or described
choices stay option blocks. Below the `sm` breakpoint a four-segment control whose
labels would wrap inside their segments forms two rows of two instead (owner,
2026-09-19). Both keep native semantics underneath (switch and
radio group).

Rename table uses a transactional boundary for one persisted text value.
Its labelled input starts with the current name, validates before saving, and
keeps both the prior name and the dialog open when durable storage refuses the
change.

Typed grid entry has one deliberate decision dialog (#201). Committing valid number or
boolean input whose canonical representation differs from the draft asks
whether to convert it or keep the entered text exactly. Committing invalid
typed input asks whether to keep editing or store it as text. Dismissal is
`Keep editing`: after the close transition, focus returns to the same editor
with the complete draft. Either final choice is one document change and returns
focus to the same cell. The dialog never advances to the next row or column,
because no value was committed when navigation was requested.

A dialog is never used to announce something. Notices belong in the notice
layer described in [§5](5-layout.md): it floats above the workspace without modal semantics,
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
| Width | One of two presets on `DialogContent` (owner, 2026-09-19): `narrow` (28rem) for a confirmation or a short form, `wide` (32rem) for a chooser whose options carry descriptions, and Settings. A dialog never sets a width class of its own; below the `sm` breakpoint both fill the window less a 1rem margin each side |
| Body text | `text-sm`; the same 0.875rem floor as everywhere else |
| Title | `DialogTitle`, `text-lg font-semibold` (see Typography) |
| Supporting copy | `DialogDescription`, one sentence saying what to choose |
| Initial focus | A dialog that asks for text names its first field as `DialogContent`'s `initialFocus` (owner, 2026-09-19). React's `autoFocus` is never used in a dialog: it fires on mount, before a menu that opened the dialog has returned focus to its trigger, so the first keystrokes land outside the modal |
| Dismissal | Escape and an explicit Cancel; focus returns to what opened it |
| Button hierarchy | One right-aligned, non-wrapping action row; below the `sm` breakpoint the actions stack at full width in the same order instead. Cancel or another neutral dismissal comes first, ordinary alternatives follow, and exactly one emphasized decision comes last. That decision is destructive red or primary blue, never both |
| Confirmation | One primary verb naming the operation: "Download", not "OK" |

Compose `packages/ui`'s `Dialog`; do not build a second modal. Prefer the
explicit Cancel and Confirm pair over the primitive's corner close button, so
the two ways out are both visible and both labelled.

A dialog that asks for one value uses the shared `SingleSelectionList` and
`SingleSelectionOption` treatment. Every option is one full-width labelled row
with native Base UI radio semantics behind the shared visual anatomy: icon on
the left, content in the middle, and optional metadata. Each option is an
option block (`optionBlockStyles` and `optionBlockStateStyles` in
`packages/ui`): the muted fill at rest, 0.75rem by 0.625rem padding, the
control radius, and 0.375rem separation. The start surface's three actions are
the same block, with its recommended action wearing the primary emphasis.
Hover uses the shared accent, the checked row is the solid primary with white
text, keyboard focus outlines the
whole row, and disabled rows stay visible with their reason. No radio circle or
other redundant selected glyph is visible. A title and optional description
use the shared `MenuOption` rhythm. Do not recreate this structure inside a
feature dialog. If an option has both status and metadata, its trailing area
stacks them vertically, status first, instead of widening the row with two
adjacent labels. A missing status or metadata child reserves no space.

Dialog action buttons use the shared action group and shared button wrappers.
They stay right-aligned in one non-wrapping row without changing DOM or focus
order, and the action group itself never scrolls. Below the `sm` breakpoint,
where three labelled actions are wider than a phone, the same actions stack
vertically at full width, still in DOM order with the decisive one last, rather
than overflowing the surface. Decided on #355. One shared, deliberately
generous top spacing separates the footer from the dialog content in every
dialog. A neutral dismissal comes first, ordinary reversible alternatives
follow, and exactly one decisive action comes last at the far right. That last
action is primary blue for the normal path or destructive red for an
irreversible path. One group never presents both emphasized colours. The destructive
button is a soft tinted fill, never bare red text: `--destructive` at low alpha
behind `--destructive` text, a step stronger on hover, so it carries the same
weight as the filled primary it stands in for (owner, 2026-09-19).

Single-selection dialogs grow to show their complete option list. A dialog
never grows past the window: every dialog caps its height at the viewport and
scrolls vertically, as one contained scroll area, only when its content does
not fit, so its actions stay reachable at any window height (owner,
2026-09-19; the option blocks made Change view overflow a 600px window). The
option list and the action row never own scrolling of their own, and nothing
scrolls sideways. A dialog body that does scroll, such as
Settings, scrolls vertically only: it states `overflow-x-hidden`, prose inside a
flex or grid item carries `min-w-0` so it wraps, and nothing invisible, such as
a control's enlarged hit area, may widen it. Decided on #273. The footer remains after the complete
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
is the single list of table operations; the grid context menu and the pane
menu are renderers over it. A source view's context menu is the text counterpart and
lists only commands the editor's keymap binds, so it never gains an action the
keyboard lacks, with one carved-out group: in a pane whose codec maps rows, the
grid's structural operations on the caret's row or column (move a column,
insert a row or column, sort, delete a row or column) are menu-only items with
no binding of their own, because they are table commands reached from the
text rather than text commands (Decided on #255). Never write an action inline in a
menu. That is how a menu and a toolbar drift apart.

A component in `primitives/` must not import from the store. If it needs
document state, it belongs in a feature folder.

Related controls use the shared radius and spacing to read as a family. Do not
wrap an existing control group in another card or add a border merely to make
the relationship visible.
