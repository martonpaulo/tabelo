# Mount the single page directly instead of routing to it

## Context

Tabelo was scaffolded with TanStack Router, and `AGENTS.md` froze that as
technical direction. The application never grew a second route. `routes/`
held two files: a root that rendered `HeadContent` and an `Outlet`, and an
index that rendered `TabeloApp`. There was no route parameter, no nested
route, and nothing to preload, yet the build still carried the router, its
Vite plugin, a generated route tree, `defaultPreload: "intent"`, and
`scrollRestoration: true` for a page that never navigates and whose panes own
their own scrolling.

Two behaviours were genuinely load-bearing rather than ceremonial:

- **Deep-path normalization.** GitHub Pages has no SPA rewrite rule, so the
  deploy workflow serves `index.html` as `404.html`. That gets a deep link to
  the application; `defaultNotFoundComponent: () => <Navigate to="/" replace />`
  then normalized the address bar to the canonical path.
- **Favicon links**, injected at runtime by `HeadContent` so they could be
  resolved against `BASE_URL`.

`AGENTS.md` says "prefer the smallest correct, readable, reversible solution"
and lists what may not be added "without an explicit, demonstrated need". A
routing framework for zero routes is the mirror image of that rule, so the
question was worth asking. Asking it well required a number, because the
argument cuts both ways: a dependency already installed and working is not
free to remove either.

## Decision

Remove the router. Mount `TabeloApp` directly with `createRoot`, normalize the
path with `history.replaceState` before React mounts, and move the two favicon
links into `index.html`, where Vite rewrites root-absolute `href` values
against `base` at build time.

The measurement that decided it, taken on a throwaway worktree at `e74a1cc`
with both sides built as `BASE_PATH=/tabelo/`:

| | with the router | without it | delta |
| --- | --- | --- | --- |
| Eager JavaScript | 707.62 kB raw / 221.05 kB gzip | 622.25 kB raw / 193.01 kB gzip | −85.37 kB raw / −28.04 kB gzip |
| Precache | 12 entries / 1305.72 KiB | 10 entries / 1221.16 KiB | −2 entries / −84.56 KiB |
| Modules transformed | 2334 | 2251 | −83 |

Read the raw column as the router's real cost: 85 kB is what tree-shaking no
longer has to keep. The gzip column is slightly flattered, because losing the
plugin also loses `autoCodeSplitting` and fewer, larger chunks compress
better.

Rejected alternatives:

- **Keep it for future optionality.** This is the only argument with real
  weight, and it fails on a fact rather than on principle: `AGENTS.md` states
  the application is its own landing page and there is no separate marketing
  site, so there is no second surface to keep cheap. Reversal costs one
  dependency and two files, which is what makes deciding now safe.
- **Keep the router, drop the plugin.** Removes the build-time cost and none
  of the runtime cost, which is where the 85 kB is.
- **Swap for a smaller router.** A dependency to replace a dependency, for
  zero routes.

## Consequences

The canonical-path contract now has an owner in application code rather than
in a framework default, and it is covered by `e2e/canonical-path.spec.ts`,
written against the router-based build first so it records the behaviour that
existed rather than the behaviour that replaced it. The workflow's half of
that contract, `cp dist/index.html dist/404.html`, is untouched.

Chunking became explicit. `autoCodeSplitting` had been splitting a route tree
of one leaf, and without it every eager module landed in a single 622 kB
chunk that tripped Vite's size warning. A `react` group in
`build.rolldownOptions.output.codeSplitting` restores a cache line for the
dependency that changes least often. Splitting further would fragment code
that changes together with the application, so it was left alone.

`defaultPendingComponent` was the only consumer of `components/loader.tsx`,
and route resolution was the only thing that could show it. Both are gone;
the application shell mounts synchronously and has no loading state to
replace.

Adding a router back is now a decision rather than a default, and
`AGENTS.md` asks for the second page it would serve to be named first.
