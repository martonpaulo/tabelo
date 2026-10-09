# Local agent helper: scoped agent policy

Applies to `apps/agent-bridge`, the optional local MCP helper
(`@tabelo/agent-bridge`). The root `AGENTS.md` still governs everything this
file does not change: governance, Git, data preservation, and the em dash and
comment rules.

## Read first

`docs/agent-integration.md` is canonical for this helper: its single owners,
the command-authoring procedure, pairing and admission, limits, and the
performance contract. Read it before editing here. This file adds only what
differs in this subtree.

## What differs here

- This is a Node.js 24 process, not part of the web bundle. Node runs its
  TypeScript sources directly, and those of `@tabelo/agent-protocol`, by
  stripping types: keep the `.ts` extension on relative imports and use only
  erasable TypeScript syntax (no `enum`, `namespace`, or parameter
  properties). The web app's `@/` alias does not exist here.
- The root's React, DOM, design-system, copy, and grid rules do not apply.
  Nothing here imports `apps/web` or application state.
- Tests use Node's own runner (`node --test`), not Vitest. Run them with
  `pnpm --filter @tabelo/agent-bridge test`; the root `pnpm test` includes
  them, and `pnpm check-types` covers this package.
- A change that crosses the transport or the browser pairing also runs the
  browser flow in `apps/web/e2e/agent.spec.ts`, focused as
  `docs/testing.md` describes.
