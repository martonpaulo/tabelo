# External agent integration

Canonical implementation and extension contract for #405. The research note at
`docs/research/local-agent-connection.md` explains the alternatives and initial
transport experiment; it is not a second specification.

## Use the connection

The editor remains a static site. Only this optional feature needs a Node.js 24+
process on the same computer as the browser and agent application. There is no
hosted backend, table database, account, extension, or marketplace registration.
The external agent may send tool results to its model provider.

The supported scenario is Tabelo at its GitHub Pages address and an MCP-capable
terminal/desktop agent on the same computer. **The website stays online; only
the MCP connector runs locally.** Do not run `pnpm dev` for this setup.

The current [ChatGPT Desktop MCP settings](https://learn.chatgpt.com/docs/extend/mcp)
support local stdio servers and share configuration with Codex CLI on the same
host. Use a local conversation that loads that host's MCP tools. A hosted chat
does not become a local MCP client merely because it appears in a desktop
window. This local route needs neither an API key nor a tunnel.

Two ordinary tabs, ChatGPT Web and Tabelo, with no local process or additional
hosted component are not supported. Hosted ChatGPT developer-mode connections
expect a remote MCP endpoint, and OpenAI's secure tunnel needs a local client;
neither is a Pages-only substitute. No tunnel or cloud relay is part of this
implementation. See the official
[developer-mode](https://developers.openai.com/api/docs/guides/developer-mode)
and [tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)
requirements before proposing a different deployment.

The connection dialog opens on the code field. **First-time setup** expands the
installation steps and **Copy commands** button when needed; this guide is a
reference, not a prerequisite to use the feature.

1. Install this repository's dependencies with `pnpm install`.
2. Configure a local MCP client to start `node` with the absolute path to
   `apps/agent-bridge/src/index.ts`. From the repository root, with Codex:

   ```sh
   codex mcp add tabelo -- "$(node -p process.execPath)" "$PWD/apps/agent-bridge/src/index.ts"
   ```

3. In ChatGPT Desktop, open **Settings → MCP servers**, find **tabelo**, and
   select **Restart**. Start a new local conversation and ask it to call
   `tabelo_connect`. In the open online Tabelo table, choose
   **Connect AI** from the app menu, paste the returned code and choose **Connect**.
4. Allow the browser's local-network permission if prompted. Read the sharing
   scope before connecting. The connection reaches this tab and its browser library.
5. Ask for a table edit or library operation. Use **AI connected** in the app menu to pause or
   disconnect. Undo/redo pauses agent writes; resume explicitly from that menu.

The MCP host owns process startup. Starting the helper in an ordinary terminal
just waits for MCP on standard input; it is not a chat program. Keep stdout for
MCP messages and stderr for sanitized diagnostics. The helper has no model key.

If Tabelo's tools are missing, run `codex mcp get tabelo` and verify that the
configured Node executable and connector path still exist. Registration alone
does not refresh a conversation's tool catalog: restart the server and use a
new local conversation. Do not create a tunnel or pay for API access to repair
missing local tools. The seven tools listed below must be available before
browser pairing can begin.

For local development, append `--origin http://127.0.0.1:<port>` (or the exact
localhost origin) to the helper's arguments, using the app's actual worktree
port. Production origin is allowed by default. Never use a wildcard, disable
browser security, or bind the helper to a LAN interface. Use one editing tab;
this feature does not synchronize documents across browser tabs.

A connection code expires after two minutes and is consumed by pairing. A
reload, document replacement, lost helper, or Disconnect requires
a new pairing. If the browser denied local access, allow it in the site's
permissions and request a fresh code. The normal editor remains usable without
that permission or without the helper.

Switching tables keeps the authorized library connection. Document, workspace
and library revisions remain monotonic across switches, and a command for a
previous active table is refused. Protocol version 2 requires fresh pairing
with the expanded library disclosure; an older helper/browser fails closed.

## Architecture and single owners

```text
MCP client -> local transport helper -> paired browser adapter
                                           |
                        existing operations and application state
                                           |
                           history, views, browser persistence
```

| Responsibility | Canonical owner |
| --- | --- |
| Wire envelope, tool inputs, schema limits, descriptions | `packages/agent-protocol/src/index.ts` |
| MCP SDK registration and process lifecycle | `apps/agent-bridge/src/index.ts` |
| Pairing, authenticated loopback transport, request routing | `apps/agent-bridge/src/bridge.ts` |
| Live revisions, command admission, outcomes, receipts | `apps/web/src/agent/session.ts` |
| Stable-ID batch preparation and selection preservation | `apps/web/src/agent/table-commands.ts` |
| Browser connection, input guards, lifetime and feedback | `apps/web/src/agent/connection.ts` |
| Document behavior | Existing pure core operations |
| View choice rules | `apps/web/src/views/availability.ts`, using the view registry |
| Commit, chronological history and save behavior | Existing store, history and persistence owners |

MCP and the private browser transport are different protocols. The Node helper
is not a second document store. It has no shell, filesystem, remote-fetch,
clipboard, or arbitrary-JavaScript tool. The web bundle does not import it.

## Adding or changing a command

Every exposed capability needs a declared input and meaning, like an API
endpoint. A function does not become available to the model merely by existing
in the source tree. Follow this procedure for each change:

1. **Choose the owner and exposure.** Find the existing operation, invariant,
   and UI entrypoint. State whether the behavior belongs in an existing tool,
   needs a separate tool, or stays intentionally internal. Domain rules belong
   to their existing core/state/registry owner, never inside the MCP callback.
2. **Define one contract.** Add or amend the Zod schema and description in the
   shared protocol package. MCP registers that same schema, which the helper and
   browser validate again at their respective trust boundaries. Infer types
   from it. Do not maintain separate hand-written JSON Schema, OpenAPI, tool
   parameter interfaces, or parallel browser/server command lists.
   An incompatible wire change must advance the internal protocol version and
   fail explicitly with an older peer; do not guess at another version's shape.
3. **Implement through the application.** Convert stable IDs to current domain
   targets after admission checks. Reuse the canonical operation and return an
   explicit applied/no-change/refused result. If UI and agent need the same rule,
   extract it to the existing domain owner and make both callers use it. Do not
   copy a UI handler, mutate the user's selection to target an action, write
   localStorage directly, or duplicate the document in the helper.
4. **Preserve the complete contract.** Check stale revisions, active table,
   unfinished input, all-or-nothing batch application, byte/shape limits,
   history, focus, and persistence outcomes. Updates to representations or
   capabilities must be derived from the live registries, not enumerated again.
5. **Prove the behavior and document it.** Add a focused domain/state test for
   the actual rule and a browser/MCP test when the running interface or transport
   is crossed. Test refusals and their lack of side effects, not just success.
   Update descriptions, examples, this guide when the public contract changes,
   and the canonical product/ADR owner when a decision changes.

Validation at two boundaries is deliberate, not duplicated business logic:
messages can be malformed or hostile at either process. The validator is the
same schema. Likewise, the UI can translate a refusal into user-facing copy
while the agent receives a stable code, but both use the same rule to decide it.

Do not turn this into a generic command framework for every click. Formatting,
hover, focus traversal, and private helpers do not need MCP tools. Transport
concerns such as pairing and expiry do not belong in pure document functions.

## Current tool surface

| Tool | Purpose |
| --- | --- |
| `tabelo_connect` | Request pairing or inspect the paired session identity |
| `tabelo_list_tables` | Page through table IDs and names without loading contents |
| `tabelo_manage_tables` | Create, open or rename a table through the normal library operations |
| `tabelo_read` | Read committed table data, revisions and available workspace choices |
| `tabelo_edit_table` | Apply a typed, atomic document-operation batch |
| `tabelo_edit_workspace` | Perform one legal view/layout operation |
| `tabelo_operation_status` | Resolve a possibly lost mutation response |

The schemas returned by `tools/list` are authoritative for exact parameters.

Results use one JSON text content block, validated by the shared result schema.
This remains readable in MCP clients that consume only text. Do not add a full
`structuredContent` copy by default: first verify how the intended host presents
both fields to the model. Transport validation is not evidence that a host
deduplicates them or that a particular representation improves reasoning.

`tabelo_read` defaults to a compact typed table. Columns carry IDs, headers and
their editing metadata once; each row carries its ID and a `values` array in
exactly that column order. `columnIds` selects and orders the relevant columns.
Unknown or duplicate column IDs are refused. `includeWorkspace: true` adds view
choices, capabilities, layouts and split options only when that context is
needed. Row pagination and its revision guard apply to either scope.

`views[].capabilities.tableOperations` describes structural command support in
that view: the grid supports it, editable source views derive it from their
codec's row mapping, and the preview does not. It is not a guarantee that a
particular caret, selection, draft or paused session currently admits an action,
nor does it determine clipboard availability.

This is a read projection, not a second document or a new write format. Values
remain typed, including null and normalized inline content. Do not replace the
write contract with Markdown or infer types from displayed text. Compare data
volume, preservation and representative tasks before changing presentation;
smaller responses do not prove better model reasoning. See the research note
for the measured comparison and its limits.

Tool descriptions must explain scope, targeting, destructive effects, retry
behavior and relevant limitations. MCP annotations are hints, not enforcement.
Table text and tool results containing it are untrusted data, never instructions.

Document operations include explicit cell/header replacement, data-row/column
insertion and deletion, movement and alignment. A request-local reference such
as `$category` names a newly inserted column later in the same batch. Tabelo
allocates the actual IDs. Scalar values retain their JSON types; strings never
implicitly become numbers, booleans or null. Replacing inline-rich content with
plain text requires the explicit `replaceInline` parameter.

Table deletion, whole-document replacement/import, source-buffer edits,
clipboard, download, agent-issued undo, column-wide conversions and global
settings remain outside this tool surface. The user can still perform their
normal UI actions; session changes invalidate any obsolete authorization.

Library mutations carry the current active table ID, document revision and
library revision, plus a request ID. Creating or opening returns a compact
snapshot in `data.table`, ready for the next edit without another read. If a
table opens into recovery, `data.tableError` replaces that snapshot: the agent
must not mistake an unreadable payload for empty content. Renaming can target
an inactive table without opening it. Failed saves refuse creation/switching;
unreadable bytes require the user's recovery flow. Listing returns names and
IDs only, with a revision guard for continuation pages.

## Admission and recovery

A table command carries a session, table ID and document revision. A workspace
command additionally carries its workspace revision. Revisions advance on real
changes, including undo/redo; they are not restored from history or persisted.
A paged read must use the first page's document revision for every continuation.
A stale request is rejected in full, even if the human edit was elsewhere in the
table. The agent must reread and reconsider the facts used to compute values.

Unfinished grid/header input, source drafts, IME composition and open choices
block mutations. An actively focused source editor also blocks writes. Merely
leaving DOM focus behind when moving to the external agent does not block them.
No refused request is queued to execute unexpectedly later.

Each successful table batch creates one ordinary undo step. Human and agent
changes share chronological history. Workspace-only actions keep the existing
workspace history semantics. Pause does not undo a command already committed.

Pairing, credentials and bounded receipts live in memory. The helper checks
Host and Origin before WebSocket upgrade and authenticates before sharing data.
The browser independently validates commands and session identity. Byte limits
are checked before parsing/expanding data. A connection reaching its limits
fails explicitly; never weaken these checks to make a test pass.

Retries keep the same mutation ID and arguments. A repeated successful request
returns its receipt, not another edit. A conflicting reused ID is refused.
Old sequence numbers cannot execute after their receipts expire. An unknown
outcome means the response may have been lost after application: inspect the
receipt and current state, never blindly submit a fresh mutation ID.

Application and persistence are separate outcomes. An edit can be applied while
saving fails. The normal storage warning remains visible, and retrying the
original request does not duplicate the edit. Never report a failed save as if
nothing changed or roll back subsequent user edits to hide it.

## Verification

Run focused protocol/connector and state tests first, then the real MCP/Chromium
flow in `apps/web/e2e/agent.spec.ts`. It starts a real stdio MCP process and
connects through the product's pairing UI. No global browser profile or real
user table is used. The repository's normal validation, build and browser gates
remain required, with scope determined by `AGENTS.md`.

The initial implementation at `e67d92d` passed
[the full validation run](https://github.com/martonpaulo/tabelo/actions/runs/35542163611)
(1,977 web tests, seven connector tests, and 740 Chromium tests) and
[deployed successfully](https://github.com/martonpaulo/tabelo/actions/runs/35542530901).
Nine SDK/browser scenarios subsequently passed on the actual production HTTPS
origin in isolated contexts, including explicit local/loopback permission denial
with ordinary editing still available. The temporary production harness was
removed. This evidence does not exercise an installed agent's approval UI or a
model conversation. Four existing unit skips and the non-blocking social-card
CSS and Vite future-loader warnings remain; listener bind failure was inspected
but not separately fault-injected.

Client-specific permission prompts and model behavior are separate from SDK
transport coverage. Report exactly which MCP clients and browser permission
paths were exercised. Never call the feature verified in a host solely because
its SDK client test passed. Never add manual screen-reader verification as a
closure gate.

SDK/browser tests prove command execution, not end-to-end conversation latency.
Batching and compact reads reduce avoidable work but do not establish that an
agent conversation is faster than manual editing or generating a table in chat.
No paid model evaluation is part of this implementation's verification.

## Performance contract

Keep the connector event-driven. An idle paired session has no polling loop,
heartbeat, repeated serialization, or background table upload. Its store
subscription compares references and revision counters; DOM input guards run
only when a request needs admission. Disconnect removes listeners and releases
bounded receipts. Timers exist only for pairing and pending requests.

Read only the required rows and columns; workspace metadata is opt-in. Count
UTF-8 page bytes incrementally instead of repeatedly serializing the growing
page. A table batch prepares pure operations and commits once, yielding one
history step and one persistence flush rather than one per cell. Reuse core
operations before inventing a second mutation engine. Receipt count and bytes,
message bytes, and pending requests are bounded by the shared protocol.

When extending tools, check idle cost, allocation growth, serialization, store
notifications, and writes. Measure suspected hotspots with the existing
benchmark method before adding caches, indexes, workers, or a new abstraction.
`session.bench.ts` covers a 100-row typed read and a 200-cell batch at the target
scale; `docs/performance.md` owns its measurements. These timings exclude model
reasoning, network transport, browser rendering, and persistence latency.
