# Security

One row per item of the Workbench security standard (`skd-project-standards`
`references/security-standard.md`), as its item table defines. Recorded on
2026-11-15 for [#534](https://github.com/martonpaulo/tabelo/issues/534).

Tabelo's surfaces: a **web app** (a static single-page application on GitHub
Pages, with no backend, account or database; tables live in the browser's
`localStorage`) and a **CLI** (`@tabelo/agent-bridge`, an optional local helper
that listens on `127.0.0.1` only, for an explicitly paired tab,
[#405](https://github.com/martonpaulo/tabelo/issues/405)). There is no API,
database or server of Tabelo's own.

| # | Item | Applies | Status | Evidence | Smallest fix |
| --- | --- | --- | --- | --- | --- |
| 1 | No hard-coded key | Yes: every surface | Met | the item 1 scan over `git grep`: 2 findings, both a variable named `token` in `apps/web/e2e/visual-system.spec.ts` and `apps/web/src/formats/jira-inline.ts`, no value | None |
| 2 | No secret in Git history | Yes: the repository | Met | the item 2 scan over `git log -p --all`: the same 2 identifiers, no value | None |
| 3 | No privileged key in a client | Yes: web app, CLI | Met | the item 3 `rg` over the source: 0 findings; the project stores no secrets (`AGENTS.md`, release policy) | None |
| 4 | A public database key reaches only what row-level security allows | No: no database | Not applicable | tables stay in the user's own browser storage | None |
| 5 | Row-level security on every table with personal data | No: no database | Not applicable | as item 4 | None |
| 6 | No open policy in a multi-tenant project | No: no database, one user per browser | Not applicable | as item 4 | None |
| 7 | Least privilege for every role and service | Yes: CI | Met | Deploy uses the built-in `GITHUB_TOKEN` only; the `workflow-token` rule of the Workbench conventions check passes | None |
| 8 | No mass assignment | No: no API or database | Not applicable | agent commands are validated per field against the shared schema in `@tabelo/agent-protocol` | None |
| 9 | Parameterized queries | No: no database | Not applicable | as item 4 | None |
| 10 | Validate every input from outside | Yes: web app, CLI | Met | Zod validates paste, import, `localStorage` reads and agent messages (`AGENTS.md` `## Data and destructive operations`, `docs/agent-integration.md`) | None |
| 11 | No sensitive screen without authentication | No: no account | Not applicable | the agent pairing is an explicit, in-memory session ([#405](https://github.com/martonpaulo/tabelo/issues/405)) | None |
| 12 | Validate the session on the server | Partly: the local helper | Met | `apps/agent-bridge/src/bridge.ts` refuses a request whose `Host` is not its loopback address or whose `Origin` is not allowed | None |
| 13 | `HttpOnly`, `Secure` and `SameSite` cookies | No: no cookies | Not applicable | none set | None |
| 14 | Hashed passwords and limited sign-in attempts | No: no passwords | Not applicable | none stored | None |
| 15 | HTTPS everywhere | Yes: web app | Not checked | the item command could not reach `tabelo.martonpaulo.com` from the cloud session (proxy 403); GitHub Pages enforces HTTPS for the custom domain when enabled | Run the item 15 command from an open network |
| 16 | Security headers | Yes: web app | Not checked | as item 15; GitHub Pages cannot set custom headers, so a CSP would be a `<meta>` tag, and `apps/web/index.html` has none | Decide on a `<meta http-equiv="Content-Security-Policy">` |
| 17 | Rate limits on AI routes and sensitive endpoints | No: no API | Not applicable | the helper accepts one paired tab on loopback | None |
| 18 | Bot protection on public forms | No: no public form | Not applicable | none | None |
| 19 | Restricted uploads | Yes: file import | Met | import refuses oversized input before parsing (`AGENTS.md` `## Domain rules`, target scale); files never leave the browser | None |
| 20 | Trimmed API responses | Partly: the helper's replies | Met | agent reads are compact by contract (`docs/agent-integration.md`) | None |
| 21 | No leak in errors or logs | Yes: web app, CLI | Not checked | no telemetry or analytics by policy; the helper's logs were not reviewed in this pass | Review the helper's log lines |
| 22 | Check a package before installing it | Yes: every surface | Partial | `pnpm-lock.yaml` pins each package with an integrity hash; no weekly vulnerability scan workflow yet (owner-only, see `AGENTS.md` divergence `vulnerability-scan`) | Add `.github/workflows/scan.yml` |
| 23 | Sensitive data encrypted at rest | No: no tokens or third-party passwords stored | Not applicable | `localStorage` holds the user's own tables; session credentials and receipts stay in memory ([#405](https://github.com/martonpaulo/tabelo/issues/405)) | None |
| 24 | Audit row-level security before delivery | No: no database | Not applicable | as item 4 | None |
