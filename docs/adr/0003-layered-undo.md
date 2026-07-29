# Layer text-editor undo on top of a document timeline

## Context

Tabelo has two editing surfaces with genuinely different natural undo
granularities. A source editor undoes keystrokes and typing runs. A table editor
undoes operations: "delete column", "move row", "paste range". ⌘Z has to mean
something predictable in both, and the two cannot simply be merged.

A single document-level history makes ⌘Z consistent everywhere but breaks the
text panel: undoing a typo would discard a whole table state instead of the
character just typed. That violates the strongest expectation any user brings to
a text box.

Two fully independent histories keep each surface feeling native but let them
drift: after a grid edit supersedes a text draft, the editor's local history
still contains states that no longer correspond to any document, and a grid
operation cannot be undone while the text panel holds focus.

## Decision

Undo is layered, and the layer is chosen by focus.

- With focus in the text panel, ⌘Z is the editor's own keystroke-level history.
- When that local history is exhausted: or when focus is on the grid: ⌘Z walks
  the **document timeline**, where each committed parse and each table operation
  is exactly one step.
- A grid edit that supersedes an uncommitted draft pushes that draft onto the
  timeline as a recoverable step, so undo restores the user's in-progress text
  rather than discarding it.
- Sync-originated editor transactions are annotated and excluded from the local
  history, so undo never rewinds a change the user did not make.

## Consequences

- Each surface behaves the way its users expect, without the two histories
  silently diverging.
- The fall-through boundary is the subtle part: crossing from local history into
  the document timeline changes granularity mid-gesture. It needs to be
  predictable and should be covered by end-to-end tests rather than reasoned
  about.
- History is coupled to focus, so focus management becomes correctness-relevant,
  not just an accessibility concern.
- Redo has to respect the same layering, including after a superseded draft is
  restored.
