# Stay in one implementation language

## Context

Markdown is Tabelo's default view and its most expensive codec in both
directions. A performance study on 2026-08-20, at `39af8f3`, asked whether the
codecs should be rewritten in a compiled language and delivered as WebAssembly.
The question was worth asking: escaping and serializing a table is exactly the
tight string work Wasm is supposed to be good at, and the codecs are the one
part of the product with no DOM and no React in them, so the boundary is clean.

`AGENTS.md` lists what may not be added "without an explicit, demonstrated
need". Web Workers and virtualization are named there. A second implementation
language was not, so WebAssembly read as unconsidered rather than as decided,
and it would have come back.

## Decision

**Tabelo stays in TypeScript. No WebAssembly, no second implementation
language.**

The measurement is what closes it, not a preference. Node 24 / V8 on arm64,
reference machine A of `docs/performance.md`, a 200 x 6 table with escape-heavy
cells:

| measurement | figure |
| --- | --- |
| Markdown serialize, as shipped | 1.837 ms |
| The same serializer rewritten single-pass in TypeScript | 0.165 ms |
| `documentToMatrix` + `TextEncoder.encode`, the unavoidable toll before a Wasm module computes anything | ~0.18 ms |
| Marshalling cell by cell instead of one blob | 0.492 ms |

**On that workload and machine, the tuned TypeScript version is faster than
the floor cost of the Wasm equivalent.** Getting that table across the boundary
cost more than doing the whole job in JavaScript once the JavaScript stopped
doing the job twice. For this serializer at the target scale, a Wasm port had
no room to win, because what it had to beat was cheaper than its own entry fee.
The figures are one serializer, one table shape, one engine and one machine;
they are not a general claim about WebAssembly, other codecs, or other
workloads.

That single-pass rewrite is #264, and its parse-side counterpart is #263. The
work this ADR declines is the work those two make unnecessary.

## Consequences

The costs a port would have carried, all avoided:

- **A Rust toolchain** in the repository, in CI, and in every contributor's
  setup, for one module.
- **Asynchronous instantiation on a synchronous render path.** A source pane
  serializes during render. An offline-first PWA that must await a module before
  it can draw a table has a new loading state in its most common interaction.
- **Tens to hundreds of kilobytes in the service worker precache**, paid by
  every visitor on every deploy, to save fractions of a millisecond.
- **A second home for the escaping rules.** `docs/adr/0002` requires
  Markdown's escaping to be exactly reversible, and the property tests are what
  keep it that way. A compiled module's exports are callable from JavaScript,
  so those tests could still reach a port through its JavaScript boundary, and
  a port could keep one grammar owner. The cost is the work to get there: an
  adapter that marshals documents across the boundary, a test harness that
  instantiates the module, and a migration during which the TypeScript and
  compiled grammars coexist and must be proven equal. The escaping grammar is
  the last place in this product that should carry that risk without a
  measured gain.

What this does not decide:

- It is not a rule against measuring again. It is a rule against reopening this
  without a measurement that contradicts the table above.
- It says nothing about Web Workers, which `AGENTS.md` already declines
  separately and for a different reason.
- It does not make performance unimportant. It makes `docs/performance.md` the
  place performance work happens, with a committed baseline and a register of
  what has already been answered.
