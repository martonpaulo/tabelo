# Local agent connection: research and proposed design

Research date: 2026-09-20. Source baseline: `750a9f8bf795989a30a4a6a44208f1965da2f5a5`.

Status: implementation proposal, not an implemented capability or a replacement
for the current product policy. [Issue #405](https://github.com/martonpaulo/tabelo/issues/405)
owns acceptance, tasks, and later decisions; this note owns the comparison and
research evidence. The implemented command-authoring contract is maintained in
[`docs/agent-integration.md`](../agent-integration.md).

## Request and settled choices

The owner wants an external conversational agent to edit the table and workspace
in the same open Tabelo tab while the owner continues editing and deleting.
Examples include adding a column, filling values, and closing a view. No store,
marketplace, public registry, or provider application registration may be required.
Implementation is explicitly deferred; this task researches and plans it.

The owner selected chronological undo on 2026-09-20: the most recent document
edit is undone first, regardless of author. One successful agent document batch
is one timeline step. Selective agent-only undo is not part of this proposal.

## Recommendation

Use a locally launched MCP server over stdio, with an authenticated loopback
WebSocket connecting that process to an explicitly paired Tabelo tab. Keep the
browser as the only document owner. The local process forwards bounded commands
and results; it neither persists tables nor runs the model.

```text
External agent application
        | MCP over stdio
Local Node.js connector
        | authenticated WebSocket on 127.0.0.1
Paired Tabelo tab
        | validated application commands
Existing operations, store, history, views, and persistence
```

Two protocols have different jobs. MCP provides agent-facing tools. The private,
versioned WebSocket protocol carries those requests into the running page.
The page is not an MCP HTTP server, and the WebSocket is not presented as a
standard MCP transport.

## Alternatives considered

| Design | Assessment |
| --- | --- |
| stdio MCP plus direct loopback WebSocket | Recommended. No extension, hosted relay, account, or publication. The browser connection was exercised below. Requires an installed local runtime and explicit browser permission. |
| Unpacked extension plus Native Messaging | Valid fallback, not a second implementation to ship. No Web Store publication is necessary, but installation adds an extension, native-host manifest, browser-specific paths, and another process boundary. Native Messaging stdio framing is different from MCP stdio. |
| WebMCP | Promising future adapter for the same application commands. The current official documentation describes an origin trial from Chrome 149 or a local testing flag, and browser/client discovery still needs support. It is not a drop-in connection to an arbitrary local MCP client. Do not make it the delivery dependency. |
| MCP Apps | Appropriate when embedding the editor inside a compatible conversation host. It changes where the UI runs and does not automatically connect to the existing browser tab or its storage. Not the selected experience. |
| DOM automation or browser debugging | Useful for a demonstration, but focus, selection, partial typing, and layout become the integration contract. Reject as the production command interface for simultaneous use. |

## What the repository already supplies

At the source baseline above:

- `apps/web/src/core/types.ts` supplies row and column identifiers and typed cell
  values. An identifier names a current entity, not an everlasting semantic
  identity through arbitrary source-text reconciliation. A revision check is
  still required.
- `apps/web/src/core/operations.ts` supplies pure document edits. Adapt identifiers
  to current coordinates only at the command boundary. Do not route an agent
  operation through the user's current selection or simulated keystrokes.
- `apps/web/src/state/store.ts` owns document application, workspace changes,
  the active library entry, and persistence coordination. `applyDocument` can
  supersede a pending draft, so exposing it directly is unsafe for this feature.
- `apps/web/src/history/timeline.ts` and ADR 0003 own chronological document
  history. Workspace changes are not uniformly document-history steps; closing
  a pane must not be advertised as undoable unless that contract is separately
  changed.
- `apps/web/src/views/registry.ts` and workspace layout helpers own available
  views, their capabilities, preconditions, and legal pane arrangements.
  The connector must not carry a second format or layout registry.

The active table and workspace introduced by #403 are already present at the
baseline. That issue remains open at research time. Re-read its current state
and the canonical code before implementation; neither its stale title nor its
earlier migration criterion should override the newer local-library contract.

## Browser feasibility experiment

A disposable script opened the real production origin in a fresh, isolated
Playwright context. It did not import the owner's browser profile, read private
tables, change application data, install an extension, modify browser flags, or
alter the deployment. A Node HTTP upgrade endpoint bound to an ephemeral
`127.0.0.1` port accepted only the production origin and exchanged a synthetic
WebSocket message with a page-side probe.

| Item | Observation |
| --- | --- |
| Page | `https://tabelo.martonpaulo.com/`, reported a secure context |
| Browser | Chromium / Chrome for Testing `153.0.8010.12`, headless |
| Harness | Playwright `1.63.0`; existing `ws` `8.21.3`; Node.js `24.21.0` |
| Permission granted | `ws://127.0.0.1:<ephemeral-port>/probe` opened and returned the synthetic acknowledgement |
| Permission denied | A separate browser context, with local and loopback permissions explicitly denied, failed to connect; the server accepted no connection from that attempt |

The first denial attempt targeted the wrong permission context and was not
valid evidence. It was corrected by using a fresh context and its explicit
browser-context identifier, setting `local-network-access`, `local-network`,
and `loopback-network` to denied. The final run accepted exactly one connection:
the granted case. The denied case returned a WebSocket error.

Reproduction outline: bind an echo server to loopback, launch an isolated
Chromium context, navigate to the production HTTPS origin, grant local-network
permission through the harness, and exchange synthetic JSON with WebSocket.
Repeat in a fresh context with the three supported permission names denied.
Close both contexts and the server. The experiment was kept under
`.scratch/prototypes/local-agent-transport/` only during research and removed.

This verifies transport feasibility, not a production connection feature.
Pairing, authentication, MCP-to-page execution, real permission-prompt UI,
command semantics, reconnect behavior, and the installed user's browser profile
were not tested. The development and packaged helper must be exercised again
end to end before delivery.

## Proposed application boundary

Use three small owners rather than importing the React application into Node:

- A private `@tabelo/agent-protocol` package owns versioned wire envelopes,
  tool input schemas, limits, error codes, and generated JSON Schema. No React,
  browser globals, Node runtime, document operations, or format registry.
- A private `apps/agent-bridge` Node workspace owns MCP stdio, loopback transport,
  pairing, request routing, bounded receipts, deadlines, and process cleanup.
  It has no filesystem, shell, browsing, model-provider, or table-storage tools.
- The web application's agent adapter owns live-state validation and dispatch
  into existing operations and state owners. The UI owns connection controls
  and interaction guards. The core remains framework-free.

Use the official TypeScript MCP SDK rather than implementing JSON-RPC or MCP
negotiation. Registry metadata checked during research returned SDK `1.30.0`
with Zod 3.25/4 compatibility and `ws` `8.21.3`. Recheck and lock compatible
versions during implementation. Reuse the workspace's Zod catalog; add Node
dependencies only to the helper. Keep all packages private and do not publish
an npm package. An internal wire version is not a Tabelo product version.

## Concurrency and history

Start with optimistic whole-document revision checks, not CRDTs, cell locks, or
automatic semantic merging. A read returns the paired page-session identity,
active-table identity, document revision, and workspace revision. Mutations
carry their expected revisions and stable target identifiers.

The browser performs guard checks, validates the complete proposed result, and
commits synchronously in one application turn. A table edit uses the document
revision; a workspace edit uses both revisions because view preconditions can
depend on document contents. Human edits, valid source parses, undo, and redo
advance the document revision. Undo never restores an old revision number.
Pointer movement and harmless focus changes do not invalidate table reads.

Any stale revision rejects the entire batch without changing data. The agent
must read again and reconsider the request, including whether the facts used
to compute its answer changed. A person deleting a row never causes a stale
agent response to recreate it. The tradeoff is deliberate: even an unrelated
document edit can require another read. Continuous human typing may delay agent
writes; this is preferable to speculative merging in the first version.

Writes are refused while there is an unsettled source draft, a cell/header edit,
IME composition, a relevant in-progress pointer gesture, or a blocking choice.
Source-editor focus while the page actually has focus also pauses mutations,
so clean parses do not let an agent interrupt an active typing run. DOM focus
left behind after switching to the external chat is not, alone, a busy user.
Reads may expose the committed document and a busy reason, never silently
substitute an invalid draft or upload its text.

There is no delayed mutation queue. `user_busy` and `revision_conflict` are
explicit results. Do not retry in a tight loop or apply an old request later.
An external change uses the existing source-editor history reset rule in ADR
0003. An agent table batch becomes one normal timeline step; changes before
and after it remain in chronological order. A user undo or redo pauses further
agent mutations until explicit resume, preventing a tool loop from immediately
recreating a change the user just undid.

## Session, privacy, and failure boundaries

Pair one connector instance with one tab and its current active table. Switching
tables, reloading, replacing the document, disconnecting, or restarting the
helper invalidates the session epoch. Returning to the previous table does not
revive old commands. Several helper processes may use separate ephemeral ports;
none silently steals another process's pairing or kills its listener.

Pairing starts only after an explicit command. A short-lived, rate-limited,
one-use pairing code connects the chosen tab; a random session credential then
lives in memory. Check the literal loopback Host and exact allowed Origin before
upgrade, authenticate before sharing any table metadata, and do not put secrets
in URLs, browser storage, terminal logs, or diagnostics. Browser permission is
an additional gate, not authentication. Do not bind to `0.0.0.0`.

The browser is authoritative for whether an operation committed. Give each
mutation an identity and a request fingerprint. Retrying an acknowledged
request returns its receipt without applying it again; reusing its identity
with different arguments fails. A timeout after dispatch is an unknown outcome,
not proof that no edit happened. Reconcile via the receipt and fresh state.
Receipts are bounded, session-only, and not an event log. An expired receipt
does not authorize replay; stale revisions and session epochs remain barriers.

No table contents are saved by the helper. Existing browser persistence remains
the only storage owner. Report application and persistence outcomes separately:
a failed save does not make an applied edit unapplied, and must never invite a
blind retry. There is no new persisted schema unless implementation demonstrates
a need and supplies the migration required by current policy.

The supported simultaneous workflow is a person and agent in the same paired
tab. Multiple editing tabs are not collaboration support. Another pairing must
not target the same connected session; a storage change from a different tab
invalidates the session and reports the condition. This does not claim to solve
general cross-tab localStorage races in the existing product. Testing and setup
must use one editing tab; broad cross-tab coordination needs separate scope.

Local transport does not mean a local model: the external agent may send tool
results to its model provider. Explain this before pairing. Only the paired
active table is exposed; other library entries, raw recovery payloads, source
drafts, local paths, credentials, and unrelated browser data are not.

## Required canonical documentation changes at implementation

The current `docs/product.md` says "Runs entirely in the browser, offline, with
no account and nothing uploaded" and "Browser only, no runtime beyond the page".
The selected feature deliberately introduces an optional local companion and
an explicit external-agent data-sharing session. Amend those absolute statements
without weakening ordinary offline operation, adding a hosted backend, creating
Tabelo accounts, or implying remote multi-user collaboration.

Record the narrow exception in the product definition and its decision index;
update the affected non-governance AGENTS sections, add the connection/session
vocabulary to CONTEXT, and amend ADR 0001 and ADR 0003 with the command and history
boundaries. The governance section's package inventory must be reconciled by
the owner-authorized implementation task when adding the private workspaces;
do not silently change project identifiers or publishing policy.

The existing menu, user-opened dialog, and notice patterns can supply Connect,
Pause/Resume, Disconnect, and operation outcomes. Do not add a chat panel,
new notification system, agent cursor, or claim to show the model's research
progress: the connector only knows requests it actually receives.

## Primary sources

All sources were checked on 2026-09-20. External protocol/browser documents can
change; repeat version checks before implementation.

- [MCP transports, 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports): local stdio and transport security boundaries.
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk): use the maintained SDK; stable registry version checked with npm metadata.
- [Codex MCP configuration](https://developers.openai.com/codex/mcp/): local command-based server configuration. Installed `codex-cli 0.154.0` also confirmed `codex mcp add <name> -- <command>` in its own help. No configuration was changed.
- [Chrome 147 release notes](https://developer.chrome.com/release-notes/147?hl=en#local-network-access-restrictions-for-websockets): local WebSocket connections are permission-gated.
- [Local Network Access draft, 2026-08-07](https://wicg.github.io/local-network-access/): loopback, mixed-content interaction, and local/loopback permission names.
- [WebMCP documentation, updated 2026-08-07](https://developer.chrome.com/docs/ai/webmcp): current origin-trial/testing requirements and discovery model.
- [Unpacked Chrome extensions](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked) and [Native Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging): alternative installation and process requirements.
- [MCP Apps overview](https://apps.extensions.modelcontextprotocol.io/api/documents/overview.html): host-embedded interface model.
- [MCP tool annotations](https://blog.modelcontextprotocol.io/posts/2026-03-16-tool-annotations/): risk hints are descriptive, not an enforcement mechanism.

## Read representation experiment during implementation

The first adapter returned ID-keyed cell objects and workspace discovery on
every page. A follow-up compared that shape with a compact typed matrix and
explicit column selection, using the same AgentSession read boundary.

The synthetic document had 200 rows and eight columns, drawn from the shared
sample roster and explicit string, number, boolean and null values. Results
were read in two pages of 100 rows. Byte counts are UTF-8 JSON bytes across
both result envelopes, not estimated tokens or model quality scores.

| Representation | Bytes | Identity and types |
| --- | ---: | --- |
| ID-keyed cells plus workspace on each page | 44,959 | Preserved |
| Compact typed matrix, all eight columns | 19,901 | Preserved; column metadata fixes value order |
| Compact typed matrix, Name and Age only | 9,373 | Preserved for the requested columns |
| Existing Markdown codec, text alone | 17,169 | No stable target IDs; native scalar distinctions are not carried |

The compact full-table response was 55.7% smaller than the earlier keyed
response. The two-column request demonstrates deliberate scope reduction, not
a comparison of identical content. Markdown is included to expose the tradeoff,
not as an equivalent representation: making it actionable and type-preserving
would require additional metadata. It did not replace the typed write contract.

The fixture mixed strings such as `"35"` with numbers such as `35`, booleans,
null, pipes and newlines. Behavioral tests additionally verify selected-column
ordering and refuse unknown/duplicate column IDs. The temporary measurement
script used the installed Jiti runtime to load the actual application modules
and was removed after measurement. No model invocation or additional paid API
was used; improved reasoning accuracy is unmeasured.

Results now use one validated JSON text block for compatibility with text-only
MCP hosts. No second full `structuredContent` copy is returned. A future choice
to use structured output must verify the target host's consumption behavior
before adding another representation.

[Anthropic's tool-design guidance](https://www.anthropic.com/engineering/writing-tools-for-agents),
checked 2026-09-20, supports returning relevant context and evaluating format
choices against tasks and models. It is not a Tabelo benchmark and does not
establish JSON, XML or Markdown as a universal winner.
