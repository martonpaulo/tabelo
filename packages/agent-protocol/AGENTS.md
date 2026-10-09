# Agent protocol: scoped agent policy

Applies to `packages/agent-protocol` (`@tabelo/agent-protocol`), the one wire
and tool-schema contract shared by the local helper and the browser adapter.
The root `AGENTS.md` still governs everything this file does not change.

## Read first

`docs/agent-integration.md` is canonical for this package: what the schema
owns, how a command is added or changed, when the wire version advances, and
the limits. Read it before editing here. This file adds only what differs in
this subtree.

## What differs here

- The package holds schemas, limits, and descriptions, never table rules or
  application behavior; those stay with their existing owners in `apps/web`.
- Both the Node helper and the Vite web app import this source as it is, so it
  follows the helper's Node constraints: `.ts` extensions on relative imports
  and erasable TypeScript syntax only.
- It has no tests of its own. Validate a change with `pnpm check-types` and
  the suites of its consumers: `pnpm test` (the web app's agent tests and the
  helper's tests) and, when the wire contract changes behavior, the browser
  flow in `apps/web/e2e/agent.spec.ts`.
