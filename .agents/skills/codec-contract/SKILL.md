---
name: codec-contract
description: Implement or review Tabelo codecs, parsing, serialization, format sniffing, import, paste, clipboard, download, output options, and format preconditions. Use whenever a change can affect cell-byte preservation, header interpretation, alignment metadata, registry behavior, unsupported input, or cross-format round trips.
---

# Codec Contract

Data preservation is Tabelo's highest priority. Treat every external string, file, clipboard payload, and persisted value as untrusted input, while keeping cell values opaque and byte-preserving.

## Workflow

1. Read the controlling issue, ADR 0001, ADR 0002, ADR 0005, the relevant codec and registry entries, import and clipboard paths, store integration, and existing round-trip tests.
2. State the canonical input and output contract before editing:
   - syntax accepted by the parser;
   - exact serialization rules;
   - header and alignment behavior;
   - structured failure or precondition behavior;
   - import, paste, sniffing, clipboard, and download surfaces affected.
3. Keep syntax rules inside the owning codec. Do not leak format-specific escaping into the document, grid, store, or another codec.
4. Keep formats and views registry-driven. Add a format with one codec file and one registry entry, then derive download, import, paste, and capability behavior.
5. Preserve stable row and column identifiers through structural reconciliation. Preserve document metadata that a format cannot express.
6. Bound input before expensive decoding or rendering and after an operation changes the resulting table size. Return a clear product-owned error rather than a raw parser or platform message.
7. Make unsupported output or document preconditions explicit. Never return plausible-looking partial data or silently coerce an invalid document.
8. Test the smallest grammar cases plus cross-format round trips. Include pipes, backslashes, literal escape sequences, newlines, leading and trailing whitespace, empty values, duplicate or empty headers, alignment, Unicode, and malformed input when relevant.
9. Add Playwright coverage when the contract crosses import, paste, draft ownership, download, dialog, notice, or synchronized-view behavior.

## Invariants

- The table document is the only canonical representation.
- Cell values are opaque strings and are never type-inferred or reformatted.
- Markdown escaping is reversible; a CSV to Markdown to CSV round trip remains byte-exact.
- Invalid drafts leave the last valid document and every other view editable.
- Alignment stays on the document through formats that cannot represent it.
- Output preferences are not document state.
- Registry consumers dispatch by kind and capabilities, never by view id.

If an accepted issue changes a current header, JSON, records, or codec-precondition contract, update `AGENTS.md`, `CONTEXT.md`, or ADR 0005 in the same change where that document is the canonical owner.

## Completion

The change is complete when parse and serialize behavior, registry data, error ownership, all affected integration paths, canonical documentation, unit round trips, and required browser flows agree without silent loss.
