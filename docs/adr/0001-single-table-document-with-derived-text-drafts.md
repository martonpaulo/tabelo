# Derive every representation from one table document

## Context

Tabelo shows the same table three ways — a visual grid, Markdown source, and CSV
source — and every one of them is editable. Left unmanaged, that is three
mutable copies of the same data, which produces update loops, cursor jumps, and
silent divergence.

Text editing makes this harder than a normal shared-state problem. A grid edit
is a discrete, always-valid operation. A text edit is a stream of keystrokes
that is syntactically broken most of the time, and it carries a cursor and a
selection that must not move underneath the user.

A CRDT (Yjs and similar) is the reflexive answer to multi-surface editing and
would supply undo and cursor preservation for free. It does not actually solve
this problem: a CRDT can merge concurrent edits to one text buffer, but it
cannot map an arbitrary Markdown text edit onto a structured table without a
parser. The parse/serialize round trip remains, and the CRDT adds weight,
a second state model, and a collaboration story the product explicitly rejects.

## Decision

One canonical **table document**. The grid mutates it through pure table
operations. The text panel does not own data at all — it holds a **draft**
string plus the serialized projection of the document.

The synchronization layer owns the round trip:

- **Text → document.** Keystrokes mark the draft dirty. After a debounce, parse.
  On success, structurally diff the result against the current document and
  patch it, matching existing rows and columns so identifiers, selection, and
  column widths stay attached. On failure, keep the document untouched and
  surface the error in the text panel.
- **Document → text.** A grid edit serializes into the active format and is
  pushed into the editor as a minimal-diff transaction, so the cursor stays put.
  It is pushed only when the draft is clean; if a draft is pending, it is
  superseded and left recoverable through undo.
- **Loop prevention.** Every editor transaction carries an origin annotation.
  Sync-originated transactions never re-trigger a parse.

Cell values are opaque strings throughout. Markdown and CSV are parsers and
serializers around the document, not alternative homes for the data.

## Consequences

- There is exactly one thing to persist, undo, and validate.
- Adding a format later means adding a parser/serializer pair behind the shared
  format contract — no change to synchronization, history, or persistence.
- The structural diff is the load-bearing part of the design and the place bugs
  will concentrate. It needs strong round-trip and identity-preservation tests.
- Debounced parsing means the grid trails the text by a moment. That is
  intentional and must stay visible in the UI rather than being hidden.
- Real-time collaboration is deliberately out of reach without revisiting this
  ADR. That is an accepted trade, not an oversight.
