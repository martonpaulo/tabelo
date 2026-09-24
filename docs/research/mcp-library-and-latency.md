# MCP library workflow and latency

Owner request and decision: 2026-09-24. Target: ChatGPT Desktop's local MCP
host with the production HTTPS editor; no locally served website or hosted
relay. The owner authorized listing, opening, creating and renaming tables in
the paired tab's library, explicitly excluding table deletion.

## Primary-source findings

- [MCP tools, 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/server/tools): validate inputs, distinguish protocol failures from actionable tool errors, retain user control, and treat annotations as hints. Structured output is optional; an output schema requires matching structured results.
- [OpenAI tool metadata](https://developers.openai.com/plugins/guides/optimize-metadata): describe when a tool applies, its parameters and boundaries; annotate read-only and destructive behavior accurately; test positive and negative requests.
- [ChatGPT Desktop MCP](https://learn.chatgpt.com/docs/extend/mcp): local stdio support, host-shared configuration, server restart and server-wide instructions. Instructions should begin with a self-contained workflow.

Checked against the installed MCP TypeScript SDK 1.30.0 and the existing
shared Zod protocol, rather than adopting a release-candidate SDK or adding
dependencies. Sources were read on 2026-09-24.

## Decisions

Keep the canonical typed document API. A source format's alignment padding is
presentation; whitespace inside a cell is data and must remain byte-exact.
Do not expose arbitrary JavaScript, filesystem access or a second document.

Keep a small tool surface, compact reads, column selection, pagination,
atomic edit batches and explicit revisions. Add library listing separately
from mutations so discovery has an accurate read-only annotation. Return the
new active table snapshot with create/open, avoiding a redundant model/tool
round trip. Reuse resulting revisions and IDs unless a conflict requires a
fresh read. Do not poll while paused or during human input.

Add server instructions about batching, source-of-truth ownership, exact
types, meaningful whitespace and safe retries. Retain one JSON text result:
the installed desktop host successfully consumed it. Do not duplicate table
payloads in `structuredContent` without evidence that the intended host
deduplicates them. Do not add analytics, background polling, a tunnel or an
API-billed evaluation to measure a local command path.

Protocol version 2 makes expanded pairing consent explicit and refuses older
peers. Library operations reuse the store and its persistence outcomes. They
never delete a table, bypass a pending draft or infer success from a void UI
callback. Corrupt or future-version storage remains raw and guarded.

## Verification scope

Native desktop MCP tools were discovered after restart and exercised against
the production HTTPS site: typed edits, exact whitespace, null, duplicate
receipt replay, stale revision refusal and editing without a visible grid.
The earlier SDK flow additionally exercised undo/pause, resume and disconnect.
Synthetic browser fixtures cover library creation/open/rename, duplicate
creation retry, failed writes and recovery; CI owns browser-suite execution.
See [performance measurements](../performance.md#sparse-batch-writes-2026-09-24)
for the measured preparation improvement and its limits. This is behavioral
verification, not a model-quality benchmark or a guarantee of response time.
