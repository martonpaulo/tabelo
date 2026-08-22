# Performance

Canonical for how Tabelo measures speed, what it currently costs, and which
suspicions have already been answered.

**A performance claim in an issue, a pull request, or a review cites a number
from this method.** `AGENTS.md` says "Measure before claiming a performance
problem"; this document is the address that rule points at. Runtime performance
is fifth in the product priority order and nothing here justifies trading data
preservation, synchronization, keyboard interaction, or interface calm for it.

## The command

```sh
pnpm bench
```

It prints numbers and never fails a build. It is an instrument, not a gate:
there is no threshold, no CI job, and no assertion on a duration. Hosted runners
are far too noisy for a threshold that would not produce false failures, and a
flaky performance gate gets disabled within a month.

## Method

The benchmarks live beside the code they measure, as `*.bench.ts`:

| file | what it covers |
| --- | --- |
| `apps/web/src/formats/codecs.bench.ts` | every codec's `parse` and `serialize`, driven from the registry |
| `apps/web/src/formats/markdown.bench.ts` | Markdown's cell escaping and unescaping on their own |
| `apps/web/src/core/document.bench.ts` | `documentFromMatrix`, `documentToMatrix`, `reconcileDocument` |
| `apps/web/src/core/operations.bench.ts` | the pure table operations, and the timer floor |

`apps/web/src/testing/bench-fixtures.ts` owns the fixtures and the timing
options. Both are deliberately in one place: a bench that builds its own table
or sets its own iteration count produces a figure that cannot be compared with
the ones beside it.

**Fixed iterations after a fixed warm-up.** Twenty warm-up calls, then 200 timed
calls at 200 rows and 50 at 1000. Tinybench's task loop runs
`while (totalTime < time || samples.length < iterations)`, so `time: 0` makes
the iteration count exact. Vitest's own default is a clock-driven loop whose
sample count depends on how fast the machine is, which is not comparable across
time or across machines.

Twenty warm-up calls rather than five: at five, the first 1000-row bench in a
process measured slower than the identical one after it, which is V8 still
tiering up rather than anything about the code.

**Fixtures are deterministic and come from the shared roster.** Rows cycle
`samplePeople`, so two runs measure the same bytes. Two shapes: `plain`, the
roster as it stands, and `escapeHeavy`, whose extra column carries a pipe, an
embedded newline, a backslash, a literal ampersand, and a `<br>`. The escape
path is where Markdown's cost lives, and a fixture without it hides the
difference. Two sizes: 200 rows, the documented target scale, and 1000, one step
past it to expose growth that is not linear.

**Read the `min` column.** Noise only ever adds time, so the fastest observed
call is the closest estimate of what the code costs. Across four runs on the
same machine, `min` varied by a median of 2.5% where the mean varied by 6.1%,
and the mean's worst cases were single garbage-collection pauses moving a
50-sample average by half.

**Take a baseline on an idle machine, one run at a time.** Two `pnpm bench`
processes back to back contend on an 8 GB laptop and produce figures that differ
from each other by more than any change worth making.

### The timer floor

Tinybench times each call individually, so an operation faster than the clock's
resolution reads as noise rather than as a small number. The `timer floor`
bench measures an empty body. Its `min` rounds below the printed precision,
so read its mean: **about 0.0001 ms**, or 100 ns.

Anything within roughly an order of magnitude of that is not a measurement.
`moveColumns` at 0.0007 ms is seven times the floor and should not be used to
judge a small change; `setCell` at 0.0017 ms is seventeen times it.

### Known gaps and instabilities

- **HTML `parse` is not measured.** It goes through the platform's `DOMParser`,
  which in a test runner means happy-dom, and happy-dom retains about 12 MB per
  parse of a 29 KB table and never releases it: a fixed-iteration loop exhausts
  a 2 GB heap after roughly 150 calls. That figure would measure happy-dom's
  allocation behaviour rather than the codec, and the product never runs
  happy-dom. HTML `serialize` is pure string building and is measured.
- **`csv` and `tsv` parse are the least stable figures here**, varying by up to
  57% between runs even on `min`. Both go through Papa Parse. Whether that is
  delimiter detection, V8 tiering, or the harness has not been established. Do
  not use either to judge a change smaller than about 2x until it has been.

## Baseline

Apple M1, 8 cores, 8 GB, macOS 26.5.2, Node v24.18.0, Vitest 4.1.10, 2026-08-22.
Milliseconds per call, `min` of 200 or 50 samples. Every figure except the
Markdown rows was taken at commit `8de6641`; the Markdown rows and the cell
table below were re-taken after #263 and #264, on the same machine and in the
same session as a run that reproduced the `8de6641` figures for every other
codec to within noise.

A figure is comparable with another figure from this same table and this same
machine. It is not comparable with one taken on different hardware, and the
hardware is recorded here for exactly that reason.

### Codec serialize

| codec | 200 plain | 200 escaped | 1000 plain | 1000 escaped |
| --- | ---: | ---: | ---: | ---: |
| `markdown` | 0.114 | 0.361 | 0.565 | 1.810 |
| `csv` | 0.118 | 0.115 | 0.582 | 0.560 |
| `tsv` | 0.117 | 0.113 | 0.580 | 0.557 |
| `html` | 0.217 | 0.266 | 1.102 | 1.351 |
| `jira` | 0.118 | 0.145 | 0.581 | 0.723 |
| `json` | 0.071 | 0.075 | 0.357 | 0.369 |
| `records` | 0.205 | 0.231 | 1.008 | 1.120 |

### Codec parse

| codec | 200 plain | 200 escaped | 1000 plain | 1000 escaped |
| --- | ---: | ---: | ---: | ---: |
| `markdown` | 0.303 | 0.392 | 1.494 | 1.926 |
| `csv` | 0.142 | 0.355 | 0.691 | 0.775 |
| `tsv` | 0.143 | 0.355 | 0.689 | 0.775 |
| `html` | not measured | not measured | not measured | not measured |
| `jira` | 0.309 | 0.392 | 1.518 | 1.966 |
| `json` | 0.162 | 0.164 | 0.793 | 0.804 |
| `records` | 0.333 | 0.365 | 1.615 | 1.814 |

Markdown is still the codec most shaped by its escape path: an escape-heavy
table costs it three times what a plain one does to serialize, where no other
codec moves by more than a quarter. It is no longer the most expensive codec in
either direction. #263 and #264 brought serialize down 5.4x on plain content
and 2.0x on escape-heavy content, and parse down 2.0x throughout.

### Markdown cells

`markdown.bench.ts` times one call over every cell of a 200-row table, because a
single cell sits too close to the timer floor to read. Same machine and session;
`before` is commit `8de6641`.

| call | plain, before | plain, after | escaped, before | escaped, after |
| --- | ---: | ---: | ---: | ---: |
| `escapeCell` | 0.339 | 0.343 | 0.423 | 0.424 |
| `escapeAndMeasure` | not present | 0.054 | not present | 0.306 |
| `unescapeCell` | 0.366 | 0.081 | 0.470 | 0.126 |

`escapeCell` is unchanged by design and measures unchanged, which is what makes
the rest of the table attributable: the serializer got faster because it stopped
measuring every cell twice and started skipping the loop for cells that need no
escaping, not because the escaping grammar moved.

### Document

| call | 200 rows | 1000 rows |
| --- | ---: | ---: |
| `documentFromMatrix` | 0.0866 | 0.4176 |
| `documentToMatrix` | 0.0720 | 0.2488 |
| `reconcileDocument`, unchanged | 0.0784 | 0.3893 |
| `reconcileDocument`, one cell changed | 0.0778 | 0.3855 |
| `reconcileDocument`, column added | 0.0703 | 0.3513 |

### Operations

| call | 200 rows | 1000 rows |
| --- | ---: | ---: |
| `setCell` | 0.0017 | 0.0068 |
| `insertRows` | 0.0015 | 0.0052 |
| `deleteRows` | 0.0029 | 0.0147 |
| `moveColumns` | 0.0007 | 0.0007 |
| `fillRange` | 0.0235 | 0.0318 |
| `clearCells` | 0.0319 | 0.1285 |
| `pasteMatrix` | 0.0150 | 0.0840 |

## Register of answered suspicions

**Read this before investigating a performance suspicion.** Every entry below
was measured and settled, and the whole point of writing them down is that the
next reader finds the answer instead of re-deriving it. That has already
happened once: `textForView` memoization was measured and rejected in #59, then
proposed again in August 2026 by a study that had no way to know.

The first four entries are imported from #59, measured on a 200 x 4 table.

| suspicion | measured | verdict |
| --- | --- | --- |
| `reconcileDocument`'s double pass is expensive | 0.040 ms | **Disproved.** 7% of the pipeline and 0.04% of a keystroke. The second pass is what lets it return `current` unchanged and preserve referential identity for every downstream memo; removing it would make rendering worse. |
| `textForView` re-serializes per pane | 0.069 to 0.139 ms per pane | **Disproved.** Four panes is under half a millisecond. A memo would add a cache with an invalidation rule to save nothing measurable. |
| `buildTableActions` runs for every closed axis menu | probe body ran 0 times | **Disproved, and the mechanism was wrong.** Base UI does not render menu content while the menu is closed. The per-row cost is real but belongs to `Menu.Root` and its trigger, filed as #164. |
| The per-keystroke data pipeline is the cost | under 0.6 ms for the four-pane worst case | **Disproved.** React rendering the grid is, by roughly 50x. |

Measured since, on the fixtures above.

| suspicion | measured | verdict |
| --- | --- | --- |
| `unescapeCell` copies the rest of the cell at every character | 0.366 ms per 200-row table, 0.081 ms after | **Confirmed, and fixed in #263.** The `value.slice(index)` inside the character loop was the whole of it. A sticky regex reached from a switch on the three characters that can begin an escape removed it: 4.5x on plain cells, 3.8x on escape-heavy ones. |
| `serializeMarkdown` measures every cell twice | 0.622 ms per 200-row table, 0.114 ms after | **Confirmed, and fixed in #264.** Escaping and measuring in one pass, plus a fast path for cells needing no escaping, is 5.4x on plain content and 2.0x on escape-heavy content. |
| Markdown serialize grows faster than its input | 4.9x for 5x the rows, before and after | **Disproved on this harness.** The 8.6x growth reported in #264 came from the 2026-08-20 study's own fixture and does not reproduce on the fixtures here, which were already linear before the fix. The constant was the problem, not the growth. Do not reopen this without a fixture that shows it. |
| Measuring escaped cells by `.length` would be cheaper than `string-width` | not timed; wrong for CJK, emoji, combining accents, and tabs | **Refused, not measured.** #186 chose `string-width` so those align in a monospaced editor. The fast path in #264 uses `.length` only for `U+0020` to `U+007E`, where the two provably agree, and the property tests in `markdown-fast-path.test.ts` hold it there. |

Also measured in #59 and found innocent, recorded so nobody investigates them
again: `cn()` across 1000 cells at 2 ms; CodeMirror compartment reconfiguration
at 0.1 ms per dispatch; the focus-following `querySelector` at 35 microseconds;
a plain CodeMirror insert into a 202-line document at 1.6 ms.

A second implementation language was considered and rejected on measurement.
See `docs/adr/0009`.

### Adding an entry

An entry belongs here when a suspicion has been measured, whatever the answer.
Name the suspicion, the measurement, the verdict, and the issue. A disproved
suspicion is the more valuable kind, because it is the one somebody will
otherwise propose again.
