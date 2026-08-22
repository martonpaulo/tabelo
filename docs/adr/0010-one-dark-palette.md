# Ship one palette, and make it dark

## Context

Tabelo shipped two palettes. `docs/design-system.md` already named one of them
primary:

> **Dark is the reference interface.** Both themes are supported and neither may
> regress, but when something has to be looked at, measured, or decided in one
> theme first, it is dark: it is what this product's users work in.

That sentence describes the cost rather than removing it. Light was designed
second, measured second, and screenshotted second, and it was never free:

- a second set of token values in `apps/web/src/index.css`, plus a second set in
  the vendored shadcn layer, each of which had to stay in step with the first;
- a second contrast pass on every visual change, since neither theme could
  regress;
- a theme preference with three values, stored in the versioned
  `tabelo.preferences` payload;
- a `matchMedia` runtime following the operating system, and an attribute
  written onto the document element;
- a generated script injected into the document head, whose entire job was to
  place the palette before first paint so the wrong one could not flash;
- a rule suppressing every component transition during a palette swap, so the
  change looked atomic;
- a 245-line browser spec, plus paired assertions in six others.

None of that serves the product's own priorities. It is not data preservation,
not synchronization, not keyboard interaction. It is a second visual world for
an editor whose users work in one.

The immediate trigger was #269, which set out to give syntax highlighting more
depth and stopped because no existing token could serve as a second accent. The
hardest constraint found there was a light-theme one: `--accent-foreground`
resolves to `#0f6cbd` in light, which is exactly `--selection-edge`, so the two
collapse into the same colour. Half of every palette constraint came from the
theme that was already the secondary one.

## Decision

**Tabelo has one palette, and it is dark.**

There is no light palette, no theme preference, and no following of the
operating system. The product renders the same interface whatever
`prefers-color-scheme` reports, and no `data-theme` attribute selects anything.
This reverses #20, which made the product follow the system theme, and #93,
which added the Settings override.

Three things that look like theme machinery are deliberately kept:

- **`color-scheme: dark` on `:root`.** It is what makes native controls,
  scrollbars, and the caret match the interface. Removing the surrounding
  machinery makes this line the only thing still saying so, which makes it more
  load-bearing rather than less.
- **Forced colours.** Windows High Contrast is an assistive path, not a palette
  preference. `@media (forced-colors: active)` is untouched, and a reader who
  needs it is unaffected by this decision.
- **The `dark` Tailwind variant**, redefined as unconditional rather than
  deleted. Thirty-five `dark:` utilities live inside the vendored shadcn
  primitives and are the correct styling for a dark palette. A `dark:` class
  with no matching variant compiles to nothing and raises no error, so deleting
  the variant would have dropped every one of them silently, across every form
  control in the product. The variant keeps its upstream name because the
  utilities using it are upstream's.

Rejected alternatives:

- **Keep both and stop calling one primary.** The honest version of the status
  quo, and it doubles the cost of every visual change for a second world nobody
  asked for.
- **Keep light but stop testing it.** Untested support is not support; it is a
  regression waiting to be reported by a user.
- **Inline the 35 `dark:` utilities and delete the variant.** Edits eight
  vendored primitives, increasing drift from upstream for no behavioural gain.

## Consequences

The stored preference payload goes to version 3 and `theme` leaves it. That is a
schema change, so it gets a forward-only migration step like any other: a reader
whose stored theme was `light`, `system`, or corrupt keeps every display
preference they had set and lands in the one palette. Shipping the schema change
without the step would be data loss the product caused, which priority 1
forbids.

A reader who had deliberately chosen Light now gets dark. That is the intended
outcome of this decision rather than a side effect of it, and it is the one
user-visible consequence.

The pre-paint bootstrap script is gone. Nothing needs to run before first paint,
because the palette is unconditional in the stylesheet rather than selected at
runtime. The browser `theme-color` metadata and the PWA manifest carry the one
palette's value, set at build time; both previously carried **light** values,
which a dark-first product had no use for.

Design and review get simpler in the way that matters: a contrast decision is
made once, in the interface the product is actually used in, and there is no
second theme to confirm afterwards. #269 in particular loses half its constraint
set, which is what it was blocked on.
