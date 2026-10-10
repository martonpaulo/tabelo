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
`samplePeople`, so two runs measure the same bytes. Three shapes: `plain`, the
roster as it stands; `escapeHeavy`, whose extra column carries a pipe, an
embedded newline, a backslash, a literal ampersand, and a `<br>`; and
`formatted`, which carries inline content (#306), so the codecs that spell it
run their inline grammar. The escape path is where Markdown's cost lives, and a
fixture without it hides the difference. Two sizes: 200 rows, the documented
target scale, and 1000, one step past it to expose growth that is not linear.

**Read the `min` column.** Noise only ever adds time, so the fastest observed
call is the closest estimate of what the code costs. Across four runs on the
same machine, `min` varied by a median of 2.5% where the mean varied by 6.1%,
and the mean's worst cases were single garbage-collection pauses moving a
50-sample average by half.

**Take a baseline on an idle machine, one run at a time.** Two `pnpm bench`
processes back to back contend for memory on a laptop and produce figures that
differ from each other by more than any change worth making.

### Name the machine, do not describe it

A figure is comparable with another taken on the same machine and meaningless
beside one from different hardware, so a baseline has to identify the machine it
came from. It identifies it by a **label**: `Reference machine A` is whatever it
was the last time, and the exact chip, core count, memory, and operating system
build stay in `docs/performance.local.md`, which is deliberately untracked.

This is a privacy rule, not a formatting one. A full specification published in
a public repository is an inventory of the maintainer's hardware and operating
system patch level, permanently attached to the name and address in every
commit, and an operating system build number is precisely what someone shops for
exploits with. It also buys the reader nothing: `min` on machine A compared with
`min` on machine A is exactly as valid without it.

Keep only what changes how a number is read: the processor architecture, because
V8 generates different code for it, and the major versions of Node and Vitest.
Not the model, not the core count, not the memory, and never the operating
system build. When a second machine ever appears here, it becomes machine B in
the same untracked file, and never a second specification.

### The timer floor

Tinybench times each call individually, so an operation faster than the clock's
resolution reads as noise rather than as a small number. The `timer floor`
bench measures an empty body. Its `min` rounds below the printed precision,
so read its mean: **about 0.0001 ms**, or 100 ns.

Anything within roughly an order of magnitude of that is not a measurement.
`moveColumns` at 0.0007 ms is seven times the floor and should not be used to
judge a small change; `setCell` at 0.0017 ms is seventeen times it.

### In the browser

A cost that is rendering rather than computation is invisible to `pnpm bench`,
so it is measured in the product itself. The method for #364, reproducible
without keeping its disposable driver:

- **Build and browser.** The production build served by `vite preview`, driven
  by the Playwright library (not the test runner) in a headed Chromium at a
  1440 x 860 viewport. One browser, one scenario at a time, nothing else
  running Playwright on the machine.
- **Scenario.** A fresh context whose stored workspace puts the grid beside the
  view under test (the grid alone for `grid`). A cell is typed into and cleared
  first so the paste keeps that arrangement instead of opening the import one.
  Then, in order: paste a synthetic roster table of 200 or 480 rows by 8
  columns into the grid and answer the header question with a real click;
  type five characters into a grid cell and press Enter; click line 5 of the
  source view, go to its end and two characters left, so the caret is inside
  a cell rather than after a closing pipe, and type five characters; wheel the view's scroller to the end
  and back; click the view and then a grid cell, twice.
- **Instruments.** `PerformanceObserver` for `longtask` entries and for Event
  Timing `event` entries at a 16 ms threshold, reduced to the slowest
  interaction (INP-style, rounded to 8 ms by the browser), plus a
  `requestAnimationFrame` loop for the worst frame while scrolling. For
  attribution, one extra run of the cell with CDP `Tracing`
  (`devtools.timeline`, its stack and invalidation-tracking variants) and the
  CDP sampling profiler at 0.1 ms.
- **Runs.** Three per cell, median reported.

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

Reference machine A, an arm64 laptop, on Node 24 and Vitest 4, 2026-08-22.
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

### Clipboard

`clipboard.bench.ts` times the two halves of the clipboard transport. `copy` is
the whole write path a grid copy runs: the TSV, the HTML table, and the private
payload spliced into it. `paste` is the transport half of the read path: the
strip every reader of the HTML flavour runs, and the decode that turns the
payload back into a selection. The public HTML parse is excluded for the same
`DOMParser` reason as the codec table above.

| call | 200 plain | 200 escaped | 1000 plain | 1000 escaped |
| --- | ---: | ---: | ---: | ---: |
| `copy` | 0.621 | 0.713 | 3.090 | 3.551 |
| `paste` | 0.700 | 0.875 | 3.585 | 4.473 |

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

One entry was measured in the browser rather than on the bench, because the cost
was rendering rather than computation. The harness was a disposable Playwright
spec driving 180 rAF-paced scroll steps over a 200-row Markdown table, timing a
forced style-and-layout of the viewport at each step and reading the CDP
`Performance` domain across the run. Three repetitions per arm, back to back on
one machine.

| suspicion | measured | verdict |
| --- | --- | --- |
| Scroll lag with space indicators comes from the number of decoration spans | span count identical at 996 before and after; forced style+layout median 15.5 ms to 9.9 ms in `all` mode, layout 1.20 s to 0.45 s | **Disproved as stated, and the real cause fixed in #275.** The spans were never the cost. Each one was, because the theme gave it a `position: relative` block, a pseudo-element box, and the shaping of a `·`. Painting the dot as a background left the count untouched and made `all` mode as cheap as `boundary`, which it had never been. Do not reach for a run-matching decorator that collapses spans: the layout inside each span was the cost, not the span. |

Also measured in #59 and found innocent, recorded so nobody investigates them
again: `cn()` across 1000 cells at 2 ms; CodeMirror compartment reconfiguration
at 0.1 ms per dispatch; the focus-following `querySelector` at 35 microseconds;
a plain CodeMirror insert into a 202-line document at 1.6 ms.

A second implementation language was considered and rejected on measurement.
See `docs/adr/0009`.

### A private clipboard flavour would be faster, and is not available

**Suspicion:** the payload rides inside the HTML flavour as a base64 comment,
so every copy encodes and splices and every paste scans and decodes. A custom
MIME flavour would carry the JSON directly and skip all of it. #266 proposed it
on the grounds that the comment existed only because Firefox refused a custom
flavour, and Firefox is no longer supported.

**Measured, 2026-09-07, reference machine A.** The gain is real: with the
payload in `web application/x-tabelo+json`, `copy` fell to 0.467 / 0.522 / 2.330
/ 2.602 and `paste` to 0.171 / 0.180 / 0.841 / 0.890 against the table above.
About 1.3x on the write and about 4x on the read.

**It is not available anyway.** Chromium keeps a custom type written through
`DataTransfer.setData` in a different store from a "web "-prefixed type written
through `ClipboardItem`, and neither reader sees the other's. Reproduced on all
four combinations in real Chromium: a payload written on the copy event is
absent from `navigator.clipboard.read()`, and one written through
`ClipboardItem` is absent from the paste event. Tabelo copies and pastes from
both a keyboard event and a menu command, so the flavour would drop every type
on two of those four paths. The HTML flavour is the only carrier both transports
share.

**Do not re-open this without first showing that Chromium has unified the two
stores.** The speed was never in doubt; the interoperability is what fails.
`e2e/clipboard-transports.spec.ts` holds the result, and fails on exactly the
two crossing combinations if the transport is moved again.

### Row boundaries in source views

#296 draws a hairline under every semantic row of a source view, and two
suspicions follow from how: one pseudo-element per bounded line is the shape
#275 found expensive for whitespace spans, and a pane with no draft parses its
projection once per document change to learn where the rows are. Both measured
on 2026-09-11, same machine, with the method of the #275 entry for the first.

| suspicion | measured | verdict |
| --- | --- | --- |
| A `position: relative` line with an `::after` stroke costs what #275's spans did | 180 rAF-paced scroll steps over a 200-row Markdown table, three runs per arm: layout 12.1 to 13.7 ms with strokes, 12.4 to 12.9 ms without; style recalculation 33 to 38 ms in both | **Disproved.** One empty pseudo-element per line, at most 199 of them and no glyph to shape, is not what made #275's spans expensive. |
| Parsing each projection for its rows is a new per-edit cost | `pnpm bench` parse, 200 rows: Markdown 0.33 ms (0.55 ms escape-heavy), Jira 0.31 ms, CSV and TSV 0.18 ms | **Accepted.** Under 0.6 ms per source pane per document change, only for the four formats that declare row mapping, and never while a draft owns the pane (its own parse already carries the rows). |
| Reading CSV and TSV row by row to get each row's end is slower | the same bench before and after the step-mode parse: 0.129 ms and 0.131 ms at 200 rows, 0.60 ms both at 1000 | **Disproved.** Within the run-to-run noise. |

### Column alignment in source views (#396)

CSV, TSV, and Jira panes draw alignment padding after every field, computed
from every row on each edit and parse. Measured on 2026-09-19, reference
machine A, with the browser method under `## Method` except that Chromium ran
headless: the view beside the grid, a pasted roster of 200 or 480 rows by 8
columns, alignment off and on in the same build. Milliseconds, median of three
runs; paste is long task and INP, typing is INP and long task.

| view | rows | paste off | paste on | typing off | typing on | scroll worst frame |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `csv` | 200 | 83 / 160 | 87 / 160 | 40 / 0 | 48 / 0 | 33 both |
| `tsv` | 200 | 82 / 136 | 91 / 152 | 48 / 0 | 56 / 0 | 33 both |
| `jira` | 200 | 87 / 152 | 93 / 152 | 48 / 0 | 48 / 0 | 33 both |
| `csv` | 480 | 158 / 208 | 167 / 216 | 48 / 0 | 56 / 0 | 33 both |
| `tsv` | 480 | 160 / 208 | 166 / 216 | 48 / 0 | 56 / 0 | 33 both |
| `jira` | 480 | 163 / 216 | 169 / 216 | 56 / 0 | 64 / 0 | 33 both |

| suspicion | measured | verdict |
| --- | --- | --- |
| Recomputing every column's width on each keystroke makes typing slow | Typing INP moves by at most one 8 ms step and no long task appears at either size. The padding pass itself costs about 1 ms at 480 rows in Node | **Accepted.** Within one rounding step of the browser's INP. |
| Alignment adds to the paste commit | 4 to 9 ms more long task at both sizes, the layout of a few hundred padding boxes in the viewport | **Accepted.** Small beside the commit it joins, which is the grid's own first layout. |
| Measuring a TSV delimiter goes through the grapheme scan | A first profile at 480 rows spent about 45 ms in `string-width`, called once per tab: a tab is not printable ASCII, so the fast path in `displayWidth` refused it | **Confirmed, and fixed** before the figures above: a run of printable ASCII and tabs is counted directly, a tab as nothing. |

### Committing a pasted 200-row table (#364)

The owner reports views feeling slow after pasting a long table. Measured on
2026-09-11 in the production build, headless Chromium, by pasting 200 rows by
8 columns into a blank table, answering the header question, and sampling the
CPU at 0.1 ms across the answer with the CDP profiler.

| suspicion | measured | verdict |
| --- | --- | --- |
| Tabelo's data path (parse, identifiers, reconciliation) is the paste freeze | one long task of 153 to 168 ms. React render and commit about 50 ms; a forced synchronous style and layout of about 45 ms inside the new source editor's first selection read, and about 58 ms under a later `focus()`; garbage collection about 20 ms. No Tabelo function above 3 ms self time | **Disproved.** The freeze is the first layout of the freshly rendered grid and editor, forced synchronously by the editor's constructor and by focus, not computation. Editing, typing, and scrolling afterwards produced no long task in the earlier measurement on the issue. Still open: the owner's exact view and action, which was not reproduced. |

The owner then reported the slowness in every view, so every registered view
was measured on 2026-09-19 at commit `3fbcea6`, with the browser method under
`## Method` on reference machine A (arm64, Chromium 1243 headed). Milliseconds,
median of three runs. "Long task" is the longest task for paste and typing and
the sum of all long tasks for the four focus clicks; INP is the slowest
interaction in the step. `records` pastes a roster whose first column is
unique, because Records refuses duplicate titles; every other view pastes the
same table.

| view | rows | paste: long task | paste: INP | grid edit: INP | typing: INP | typing: long task | scroll: worst frame | focus: long tasks | focus: INP |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `grid` | 200 | 89 | 136 | 56 | n/a | n/a | 19 | n/a | n/a |
| `markdown` | 200 | 104 | 168 | 72 | 104 | 52 | 33 | 132 | 96 |
| `csv` | 200 | 99 | 152 | 64 | 56 | 0 | 33 | 185 | 96 |
| `tsv` | 200 | 98 | 152 | 72 | 64 | 0 | 33 | 184 | 96 |
| `html` | 200 | 105 | 168 | 56 | 64 | 0 | 33 | 180 | 96 |
| `jira` | 200 | 100 | 152 | 72 | 96 | 0 | 33 | 193 | 96 |
| `json` | 200 | 101 | 168 | 80 | 64 | 0 | 33 | 202 | 104 |
| `records` | 200 | 103 | 168 | 64 | 64 | 0 | 33 | 116 | 96 |
| `html-preview` | 200 | 120 | 184 | 56 | n/a | n/a | 19 | 295 | 120 |
| `grid` | 480 | 162 | 232 | 72 | n/a | n/a | 19 | n/a | n/a |
| `markdown` | 480 | 183 | 272 | 96 | 144 | 79 | 50 | 297 | 144 |
| `csv` | 480 | 176 | 256 | 88 | 64 | 0 | 33 | 273 | 128 |
| `tsv` | 480 | 175 | 256 | 72 | 64 | 0 | 33 | 277 | 128 |
| `html` | 480 | 184 | 256 | 72 | 72 | 0 | 32 | 286 | 144 |
| `jira` | 480 | 177 | 256 | 80 | 128 | 60 | 33 | 306 | 144 |
| `json` | 480 | 190 | 272 | 88 | 64 | 0 | 33 | 310 | 144 |
| `records` | 480 | 191 | 272 | 72 | 72 | 0 | 33 | 286 | 128 |
| `html-preview` | 480 | 246 | 320 | 80 | n/a | n/a | 19 | 495 | 168 |

Scrolling is free in every view. What the owner feels "in every view" is the
one cost that is the same in every view: moving between the grid and the pane
beside it.

| suspicion | measured | verdict |
| --- | --- | --- |
| Moving focus between two panes is slow when one holds a long grid | 60 to 100 ms long tasks on each pane change, growing with rows, in every view. The trace: about 30 ms of `UpdateLayoutTree` per change at 200 rows, forced by the fill handle's `getBoundingClientRect`. Invalidation tracking names one change, the active pane's class, which sets `--hairline-color` for its edge. A custom property inherits, so every element in the pane, all 1,600 cells, had its style recomputed | **Confirmed, and fixed in #364.** Registering `--hairline-color` and `--hairline-fill` with `inherits: false` confines the change to the pane's own box; nothing inside reads either. Focus long tasks, `csv`: 185 to 0 at 200 rows, 273 to 0 at 480; focus INP 96 to 64 and 128 to 64. `html-preview`: 295 to 0 and 495 to 0; INP 120 to 48 and 168 to 64. Paste, typing, and scrolling unchanged. |
| Typing in Markdown or Jira re-renders the whole grid | 52 to 79 ms long task and 104 to 144 ms INP on the first keystroke, only in those two views. A render count showed all 200 grid rows and the columns array replaced on that keystroke, then one row per keystroke after it | **Disproved: the scenario's own edit.** The driver typed after a row's closing pipe, which adds a column, and a new column is a new cell in every row. Typing inside a cell (the method now steps two characters left of the line end) costs 64 to 80 ms INP and no long task, the same as every other source view. |
| The paste commit is slow in every view | one long task of 88 to 118 ms at 200 rows and 164 to 247 ms at 480, INP 136 to 184 and 232 to 336, the same order in every view and highest beside the rendered preview, which lays out a second full table. The trace at 200 rows beside Markdown: about 31 ms of script (React render and commit, CodeMirror), 27 ms of style, 15 ms of layout, and 6 ms of pre-paint, the style and layout forced early by the fill handle's measurement | **Confirmed, not fixable inside the scale rules.** It is the first style and layout of about 1,600 freshly created cells plus the pane beside them. Forcing it early moves it and does not add to it. Removing it means rendering less of the table at once, a design decision the target-scale rule reserves for the owner. |

The whole matrix again after the fix, same method and machine, typing inside a
cell:

| view | rows | paste: long task | paste: INP | grid edit: INP | typing: INP | typing: long task | scroll: worst frame | focus: long tasks | focus: INP |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `grid` | 200 | 88 | 136 | 56 | n/a | n/a | 19 | n/a | n/a |
| `markdown` | 200 | 105 | 168 | 72 | 72 | 0 | 33 | 0 | 64 |
| `csv` | 200 | 95 | 152 | 72 | 56 | 0 | 33 | 0 | 64 |
| `tsv` | 200 | 101 | 168 | 72 | 64 | 0 | 33 | 0 | 64 |
| `html` | 200 | 96 | 152 | 64 | 72 | 0 | 33 | 0 | 64 |
| `jira` | 200 | 99 | 152 | 72 | 64 | 0 | 33 | 0 | 64 |
| `json` | 200 | 103 | 168 | 80 | 56 | 0 | 33 | 0 | 64 |
| `records` | 200 | 110 | 168 | 56 | 64 | 0 | 33 | 0 | 48 |
| `html-preview` | 200 | 118 | 184 | 56 | n/a | n/a | 19 | 0 | 48 |
| `grid` | 480 | 164 | 232 | 72 | n/a | n/a | 33 | n/a | n/a |
| `markdown` | 480 | 186 | 272 | 88 | 80 | 0 | 50 | 0 | 64 |
| `csv` | 480 | 176 | 256 | 80 | 64 | 0 | 33 | 0 | 64 |
| `tsv` | 480 | 175 | 256 | 80 | 64 | 0 | 33 | 0 | 64 |
| `html` | 480 | 187 | 272 | 80 | 104 | 56 | 33 | 0 | 64 |
| `jira` | 480 | 177 | 272 | 72 | 64 | 0 | 33 | 0 | 64 |
| `json` | 480 | 191 | 288 | 88 | 56 | 0 | 33 | 0 | 64 |
| `records` | 480 | 191 | 272 | 72 | 64 | 0 | 33 | 0 | 64 |
| `html-preview` | 480 | 247 | 336 | 80 | n/a | n/a | 19 | 0 | 64 |

Nothing but the paste commit is above 100 ms at the target scale. The one
figure above it past the target, typing in HTML at 480 rows, was not traced.

### `content-visibility` for the paste commit (#393)

#393 asked whether CSS `content-visibility: auto` with `contain-intrinsic-size`
on grid rows and preview rows would let the browser skip style and layout of
the rows outside the viewport, and bring the paste commit under 100 ms at the
target scale. Measured on 2026-09-19 at commit `097be50`, reference machine A,
with the browser method under `## Method` for the paste step only (headed
Chromium, beside Markdown and beside Rendered Preview, median of three runs).
Each arm injected its rule into the production build; one pass interleaved all
arms, on a machine at a load average of about 3, so a single run moves by up to
30 ms. Milliseconds, long task / INP.

| beside | rows | none | rows (`tr`) | cell contents (`td > *`) |
| --- | ---: | ---: | ---: | ---: |
| Markdown | 200 | 112 / 168 | 115 / 168 | 78 / 168 |
| Markdown | 480 | 175 / 272 | 195 / 288 | 164 / 272 |
| Rendered Preview | 200 | 124 / 184 | 99 / 168 | 121 / 184 |
| Rendered Preview | 480 | 253 / 336 | 259 / 336 | 227 / 336 |

| suspicion | measured | verdict |
| --- | --- | --- |
| `content-visibility: auto` on grid and preview rows skips the rows off screen | The rule computes to `auto` on every `tr`, yet no cell below one was skipped (`checkVisibility({ contentVisibilityAuto: true })`), every `contentvisibilityautostatechange` reported the row as shown, row heights stayed as they were, and the long task stayed within noise of the unchanged build. Both the grid and the preview are HTML tables: a table row, row group, or cell is an internal table box, and CSS containment, which `content-visibility` relies on, has no effect on one | **Disproved: it cannot apply.** Getting containment onto a row means leaving table layout for both tables, a rewrite of the grid's structure and its sticky and ARIA contracts, not a CSS candidate. |
| Putting it on each cell's contents instead holds the contracts | Skips about 1,500 of 1,600 cell contents at 200 rows. Long task beside Markdown 112 to 78 at 200 rows and 175 to 164 at 480; beside the preview no gain outside noise; INP unchanged in every cell of the table. A skipped box takes its `contain-intrinsic-size` until it has been rendered once, so a wrapped row off screen is one line tall until it scrolls in: the grid's row heights, and the offsets jump-to-cell, find, and the pinned rows read from them, would be wrong until then | **Rejected.** It trades the wrapped-row-height contract for a saving that never brings INP under 100 ms and does nothing beside the preview. |
| Something new since #364 is the cost | A trace of the commit at 200 rows: beside Markdown a 93 ms task of 25 ms style over 9,174 elements, 24 ms script (React render and commit), 14 ms layout, 5 ms pre-paint; beside the preview 40 ms style over 16,262 elements and 25 ms layout. Style and layout are forced early by a layout effect in the grid, which moves them and does not add to them. Each grid cell is three elements, the cell, a two-column CSS grid that keeps room for its type mark, and the value; setting that wrapper to `display: block` saved 10 to 15 ms at 200 rows beside Markdown | **Confirmed as the #364 cause, nothing cheaper found.** The cost is still the first style and layout of every cell the paste creates. The per-cell grid wrapper is the one measurable part, and removing it changes how the type mark is laid out, a markup decision on its own and not enough to reach 100 ms. |

#393 is closed as not planned on this evidence. Reaching the target now needs
rendering fewer cells at once, which the target-scale rule in `AGENTS.md`
reserves for the owner.

### Flicker and redraw

The owner reports the screen "blinking" and redrawing visibly. A flash is a
frame, not a duration, so it is measured by what was painted. Measured on
2026-09-19, reference machine A, production build served by `vite preview`,
headed Chromium at 1440 x 860 driven by the Playwright library, with a restored
roster-shaped table of 100 rows by 7 columns. Instruments: a CDP screencast
(`Page.startScreencast`, every frame) and, where a frame could be dropped, a
CDP trace with compositor screenshots
(`disabled-by-default-devtools.screenshot`); `PerformanceObserver` for
`layout-shift` with its sources, `longtask`, and `paint`; and, for the source
editor, a sampler that compares each line number's top with its line's top when
the editor is created and on the frames after it.

| suspicion | measured | verdict |
| --- | --- | --- |
| A source pane's first frame draws its line numbers squashed | When the editor is created, the numbers sit 14 px apart at the top while the lines are already 32 px: worst offset 126 px over eight lines. CodeMirror corrects it in the measure it schedules for the next animation frame. Changing a grid pane to Markdown and adding a Markdown view both reported a `layout-shift` of the gutter elements (0.0156 and 0.004), so the uncorrected state was laid out; whether a frame paints it depends on where the commit falls in the frame | **Confirmed, and fixed.** Reading a line block right after creating the editor runs the pending measure inside the commit. Offset at creation 126 px to 0 in both flows, gutter layout shift gone in three runs of each; the long task of the commit unchanged (71 to 97 ms before, 74 to 79 ms after). |
| Every load flashes a page of text before the application | The static introduction #362 put in the shell was painted as the first frame and replaced by the application on its first render: on screen from 131 to 293 ms on a first visit and from 78 to 168 ms on a cached reload of a saved table | **Confirmed, and fixed.** With scripting enabled the introduction is `visibility: hidden`; it stays in the HTML for crawlers and for readers without JavaScript, who still see it. After: no frame shows it, the first painted frame is the empty app background. |
| A restored source pane, or the first pane of a lazy view, shows a loading state | On a cached reload of grid beside Markdown, the grid painted at 123 to 235 ms beside a "Loading" pane and the editor replaced it at 435 to 466 ms, although its code had arrived by 90 ms. React.lazy suspends the first render even of a loaded module, and React keeps a fallback on screen for at least 300 ms (`FALLBACK_THROTTLE_MS`). The first switch of a pane to the rendered preview showed the same state for 308 ms. Separately, the first render ran on the default workspace before hydration replaced it, which mounted a throwaway Markdown pane and loaded the source editor for every session, a grid-only one included | **Confirmed, and fixed.** The store hydrates before the first render, the code of the lazy views the restored workspace shows loads before it, and a lazy view whose module is already loaded renders directly instead of through React.lazy. Every other lazy view loads after the first paint. After: the reload paints the whole workspace in one frame at 239 to 322 ms with no loading state; switching to the preview shows no loading state. The first render now carries the editor too, so it is one long task of 103 to 199 ms instead of two smaller ones. A first visit, which opens on the welcome surface, waits for nothing. |
| A pane dialog changes while it closes | Confirming Change view re-rendered the closing dialog from the new state: its hint line dropped out, the dialog jumped 19 px (`layout-shift` 0.0034), and the chosen view turned "In use". Add view jumped its footer (0.0003) and moved the selection to another view as the one just added became unavailable. Move pane reads the same cleared subject | **Confirmed, and fixed.** The three pane dialogs keep the content they showed while open until they have gone. After: no layout shift in either flow over two runs, and the closing frames show the dialog as it was confirmed. Layout had the same cause in its closing frames, its Apply button dimming to disabled once the layout it names was applied, and Rename table likewise disables its confirm on the saved name and resets a cancelled field: both keep their content the same way. The Tabelo menu did it too: after Transpose table its closing frames showed the new size under the table's name and a newly enabled Undo; it now keeps its content as well. |
| A source view's column letters and pinned header trail the text while scrolling sideways | Compositor screenshots of a 600 px horizontal scroll gesture at 1200 px/s: in every frame of the gesture the letters, and the pinned header when shown, stood about 20 px, one frame's travel, behind the columns under them, then caught up once scrolling stopped. Both were repositioned by a scroll listener, a frame after the compositor had already moved the text | **Confirmed, and fixed.** Both now move on a scroll-driven animation over the editor's own scroller (`ui/source/follow-scroll.ts`), which the browser advances in the same frame as the scroll. After: letters and pinned header in line with the text in all 24 frames of the same gesture; the pinned copy's text within 0.05 px of the editor's at rest. The first frame of pinning, where the real header has moved up a few pixels before the copy appears, was still drawn by a listener: see the next row. |
| A source view's pinned header appears a frame after the real header starts to leave | Compositor screenshots (`disabled-by-default-devtools.screenshot`) of four small wheel scrolls down and back on a 100-row Markdown pane, comparing the header line's box in every frame with the frame at rest: 4 of 33 frames differed, one per scroll, each the first frame after the header had moved, drawn before a scroll listener created the copy | **Confirmed, and fixed.** The copy exists whenever there is a header to pin, and the scroll reveals it: a scroll-driven opacity animation over the editor's vertical timeline (`tabelo-pin-reveal`), which the compositor runs in the frame it scrolls. After: 0 of 27 frames differ in the same gesture. |
| The grid's fill handle on a pinned row or column trails a scroll | A per-frame sampler (`requestAnimationFrame`) comparing the handle's centre with its pinned corner cell's corner during a headed wheel scroll on both axes, 90 frames: 12 frames off, by the full step of one wheel event (40 px across, 60 px down), while a scroll listener placed the handle a frame after the cell had stuck | **Confirmed, and fixed.** The handle stands where the cell does at the scroll origin and follows the scroll on a scroll-driven animation per pinned axis (`follow-scroll-hold-x` and `-y` in `index.css`); the listener stays only to settle where a sticky cell stops at its table's end. After: 0 of 90 frames off in the same gesture. |
| On a first visit the source pane behind the welcome surface shows its loading state | A first visit with the default grid beside Markdown, a MutationObserver on the pane's loading status: its text was on screen, through the welcome backdrop, from 93 to 425 ms, until the editor replaced it. The session opens on the welcome surface, which deliberately waits for no view's code | **Confirmed, and fixed.** The loading state is invisible while its pane is inert behind something that covers it (`in-[[inert]]:invisible` on the status), so the pane keeps its empty surface until the editor arrives; out from under the welcome surface it shows as before. After: the status exists from 124 to 456 ms and is never visible. |
| The menu button pops in after the workspace | On a reload the workspace painted one frame without the floating menu button's logo, which appeared in the next frame 4 ms later: the only difference between the two frames. The logo is an image the browser fetched only when the button mounted | **Confirmed, and fixed.** The shell preloads the logo, so it is ready when the first frame is drawn. After: two runs, cold and cached, each paint the workspace in a single frame with the button in it. |
| The Figtree web font swaps in after first paint (`font-display: swap`) | Resource timing: the font arrived at 49 to 80 ms cold and 62 to 66 ms cached, before the application's first render at 123 ms or later; no `layout-shift` entry at load names text | **Disproved.** The font is in before any interface text is painted. |
| Opening and closing menus, tooltips, typing in a cell or a source view, undo, scrolling the grid, starting an empty table | No `layout-shift` above 0.0001 in any of them, and the Tabelo menu's frames show only its own open and close transition | **Disproved.** Nothing to fix. |

Still open from the same survey, because it would change a visual decision
or lies with another owner: pasting on the welcome surface removes it before
the header question opens, so the empty starting table shows for a frame and
then sits under the question.

### Formatted content at the target scale (#306)

Inline content adds a grammar to three codecs, a validated payload to the
clipboard, and semantic elements to every grid cell and preview cell, so the
target scale was measured with it. `pnpm bench` now carries a third fixture
shape, `formatted`: a bold name, a linked city, and a note holding marks alone
and combined, inline code, an email link, and an image. Reference machine A,
2026-09-19, same Node and Vitest majors as the baseline, `min` of 200 samples
at 200 rows; `plain` is the same run's figure for comparison.

| call | plain | formatted |
| --- | ---: | ---: |
| `markdown` serialize | 0.144 | 1.306 |
| `markdown` parse | 0.375 | 2.313 |
| `html` serialize | 0.260 | 1.009 |
| `jira` serialize | 0.480 | 1.405 |
| `jira` parse | 0.347 | 2.200 |
| `csv` serialize | 0.122 | 0.186 |
| clipboard `copy` | 0.629 | 3.794 |
| clipboard `paste` | 0.707 | 9.163 |

At 1000 rows the formatted figures grow linearly (Markdown serialize 7.1,
parse 12.0; clipboard copy 20.4, paste 45.7). The plain `jira` serialize figure
is four times the August baseline (0.480 against 0.118): the inline escaping
of slice 2 checks every marker, and half a millisecond per table is not worth
pursuing.

In the browser, with the method under `## Method` (production build, headed
Chromium 1243 at 1440 x 860, median of three runs, commit `468aafa`): paste a
200-row, 8-column Markdown table into the grid beside the view, format a whole
column with `Mod`+`B`, type five characters into the rich cell editor, commit
with `Enter`, and scroll the grid to the end and back. `plain` pastes the same
table with every marker removed. Milliseconds.

| beside | content | paste: long task | format column: INP | format column: long task | typing: INP | commit: INP | scroll: worst frame |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Markdown | plain | 80 | 88 | 0 | 88 | 72 | 19 |
| Markdown | formatted | 156 | 136 | 61 | 88 | 120 | 19 |
| Rendered Preview | plain | 104 | 72 | 0 | 72 | 56 | 19 |
| Rendered Preview | formatted | 161 | 88 | 0 | 32 | 80 | 19 |

| suspicion | measured | verdict |
| --- | --- | --- |
| Formatted content makes the target scale slow | Every interaction stays under 200 ms INP and scrolling keeps its 19 ms worst frame. Formatting adds about 60 ms to the paste commit, the one figure that was already above 100 ms, and brings formatting a whole column beside Markdown and committing a cell beside it to 136 and 120 ms INP, from 88 and 72 | **Accepted, not traced.** Nothing crosses the 200 ms line, and the codec and clipboard figures above account for under 10 ms of any of it, so the rest is rendering the semantic elements and the source editor's update. Trace the Markdown column format first if a report names it. |

### Unclosed inline candidates in one long cell (#417)

A valid cell holding thousands of `[` or `![` that never complete used to be
rescanned to its end from every opener: Markdown's label search and Jira's
construct search (also run by the Jira row splitter at every offset) were
quadratic in the cell's length, independently of row count. `inline-scan.bench.ts`
doubles one cell from 2,000 to 16,000 characters beside a plain `x` control.
Node, Vitest bench, mean of 50 samples, milliseconds; `before` is commit
`6e951b5`, same machine and session.

| cell | call | 2,000 | 4,000 | 8,000 | 16,000 |
| --- | --- | ---: | ---: | ---: | ---: |
| plain control | `markdown` parse | 0.10 | 0.10 | 0.17 | 0.31 |
| `[` before | `markdown` parse | 8.3 | 29.7 | 125.4 | 508.7 |
| `[` after | `markdown` parse | 0.23 | 0.46 | 1.35 | 2.35 |
| `![` before | `markdown` parse | 9.2 | 39.9 | 153.7 | 568.4 |
| `![` after | `markdown` parse | 0.29 | 0.36 | 0.61 | 1.30 |
| plain control | `jira` parse | 0.08 | 0.09 | 0.16 | 0.32 |
| `[` before | `jira` parse | 14.8 | 64.9 | 260.3 | 996.2 |
| `[` after | `jira` parse | 0.39 | 0.66 | 1.26 | 3.59 |
| `![` before | `jira` parse | 7.3 | 33.0 | 132.1 | 504.7 |
| `![` after | `jira` parse | 0.55 | 0.97 | 1.61 | 3.52 |

| suspicion | measured | verdict |
| --- | --- | --- |
| One long literal cell of unclosed link syntax can block the main thread | Before, each doubling multiplied the time by about four, up to a second for one 16 KB Jira cell. After, each doubling roughly doubles it, like the control | **Fixed.** A per-cell memo of where each label and destination closes (Markdown) and a per-line table of the next unescaped `]`, `\|` and `!` (Jira) replace the rescans; the grammar is unchanged. |

### Large cells (#441)

A browser audit on 2026-09-22 saw one permitted long plain cell produce a long
task after the handler: 107 ms at 16,384 characters, 294 ms at 131,072 and
1,349 ms at 900,000. #441 asked which part owns it. Measured on 2026-10-10 on
reference machine B, an x86_64 cloud container, Node 22 and Vitest 4 (not
comparable with the machine A figures above), at commit `0575440`, with a disposable Vitest bench driver that was not kept: the
200-row plain bench table with its row 100 note cell replaced by a long value,
`min` of 8 timed calls after 3 warm-ups, one run per scenario. The value is an
ASCII sentence repeated to length (`plain`), lines of 64 characters
(`multiline`), or alternating bold and plain runs of 64 characters
(`formatted`). Parse is `parse(text, { limited: true })`, the source-pane
path, on the codec's own output; HTML parse is excluded for the `DOMParser`
reason above. Milliseconds, `plain` shape.

| call | 16,384 | 131,072 | 900,000 |
| --- | ---: | ---: | ---: |
| `markdown` serialize | 2.5 | 30.5 | 414 |
| `markdown` parse | 35.0 | 280 | 1,999 |
| `jira` serialize | 1.9 | 13.2 | 230 |
| `jira` parse | 1.2 | 4.6 | 67.2 |
| `records` serialize | 0.66 | 2.6 | 57.1 |
| `records` parse | 1.2 | 3.3 | 59.5 |
| `html` serialize | 0.47 | 0.86 | 3.5 |
| `json` serialize | 0.35 | 0.82 | 3.9 |
| `json` parse | 0.74 | 1.3 | 3.9 |
| `csv` serialize | 0.17 | 0.15 | 0.31 |
| `csv` parse | 0.38 | 0.43 | 3.4 |
| `tsv` serialize / parse | 0.16 / 0.36 | 0.15 / 0.41 | 0.28 / 3.3 |

At 900,000 characters `multiline` and `formatted` stay within about 20% of
these, except formatted `html` serialize (12.2), formatted `jira` parse (100)
and multiline `json` parse (9.6); at the two smaller sizes Markdown serialize
runs up to 1.8x higher for them. At 900,000
characters the rest of the per-change work stays small in every shape:
`setCell` 0.005, `reconcileDocument` 0.23 (0.84 formatted), CSV
`alignmentPadding` over every row 0.73, `JSON.stringify` of the save payload
2.7 (3.4 formatted), and `JSON.parse` with `validatePersistedState` 1.2 (13.9
formatted).

The Markdown rows are not a per-character cost. Markdown pads every row of a
column to its widest cell, so one long cell is written once per row: the
projection is 3,319,061 characters at 16,384 and about 182 million at 900,000.
Per character of text it parses, Markdown is as cheap as the others.

A source-pane paste above the 1 MB import budget (#441 comment 6091390520),
measured as a limited parse of unpadded text with one long cell: Markdown 82,
137 and 297 ms at 1, 2 and 4 MB; Jira 86, 172 and 382; CSV 1.4 to 1.7. The
paste is accepted. Projecting the result back as Markdown is what fails: a
300-row table with a 2,000,000-character cell throws
`RangeError: Invalid string length` in `serialize`, and a 500-row table with a
1,048,576-character cell builds 526 million characters, just under V8's
limit, in 3.7 s.

| suspicion | measured | verdict |
| --- | --- | --- |
| Codec work owns the large-cell stall | Markdown serialize 414 ms and parse 2.0 s at 900,000 characters; every other codec under 70 ms except Jira serialize at 230 ms. A Markdown pane with no draft parses its projection on every document change (#296), so the parse is paid on each edit anywhere in the table | **Confirmed for Markdown, by output size.** Column padding multiplies the longest cell by the row count, and at the top of the shape limits reaches the engine's string limit, which `AGENTS.md` calls a defect. Captured as #496, which needs the owner's choice of padding rule because #401 recorded the current one. No cell limit and no truncation. |
| Jira and Records are slow per character | Linear: Jira serialize 230 ms and parse 67 ms, Records about 58 ms each way, at 900,000 characters | **Accepted for now.** Linear and well under the Markdown figure. Revisit only after #496 if a browser trace still names them. |
| Persistence is part of the stall | Save payload stringify 2.7 to 3.4 ms at 900,000 characters, after the autosave debounce rather than in the edit's task; load validation 1.2 to 13.9 ms, at startup only | **Disproved.** |
| The pure per-change passes grow with the cell | `setCell`, `reconcileDocument`, `alignmentPadding` and `minimalChange` all under 5 ms at 900,000 characters | **Disproved.** |
| A source-pane paste above 1 MB needs a byte budget | Limited parse 137 ms (Markdown) and 172 ms (Jira) at 2 MB, linear; each keystroke in that pane parses the draft again | **No budget recommended.** Source text is free (#294) and the parse is linear. The hazard is the Markdown projection after the commit, which #496 owns. |

Not measured: the source editor's view work and layout or paint, which need a
browser trace and were outside this run. The evidence above already sets
their input: beside a Markdown pane the editor receives rows times the
longest cell, so a trace taken before #496 lands would measure the padding
again. Trace grid beside Markdown, Jira and the rendered preview with the
browser method under `## Method` after #496 if a large-cell stall remains.

### Adding an entry

An entry belongs here when a suspicion has been measured, whatever the answer.
Name the suspicion, the measurement, the verdict, and the issue. A disproved
suspicion is the more valuable kind, because it is the one somebody will
otherwise propose again.

## Local agent command path (#405)

Measured on Reference machine A, arm64, Node 24 and Vitest 4.1.11, using the
shared 200-row plain fixture, 20 warm-ups and 200 samples. Command:

```sh
pnpm --filter web exec vitest bench --run --project=unit src/agent/session.bench.ts
```

| Operation | Before, minimum ms | After, minimum ms |
| --- | ---: | ---: |
| Read 100 typed rows | 1.6196 | 0.0939 |
| Prepare 200 cell writes (unchanged implementation) | 0.4647 | 0.4043 |

The read previously re-encoded every accumulated row on each iteration to
check the byte limit. It now counts each encoded row once and reserves metadata
space, retaining the same UTF-8 limit and refusing an indivisible oversized
value. The unchanged write result illustrates run noise, not an optimization.
Its cost did not justify a separate mutation engine or persistent index.

These are in-process microbenchmarks in happy-dom: no real model, transport,
DOM rendering, or persistence timing. They do not predict chat latency. Tool
payload-size comparisons and their limitations are recorded in
[the connection research](research/local-agent-connection.md). The operational
rules for idle work, batching, and bounded memory are in
[the agent integration contract](agent-integration.md#performance-contract).

### Sparse batch writes, 2026-09-24

On the same arm64 machine with Node 24.21.0 and Vitest 4.1.11, the command
above measured 200 writes before and after switching the adapter to one
short-lived ID lookup per batch and the core's sparse `setCellValues` operation.
It copies each affected row once, preserves final-write ordering and typed
values, and introduces no persistent cache or second document owner.

| Operation | Before mean ms | After mean ms |
| --- | ---: | ---: |
| Prepare 200 cell writes | 0.4045 | 0.0724 |
| Read 100 typed rows | 0.0748 | 0.0758 |

There were 20 warm-ups and 200 samples per operation. Write relative error was
8.75% before and 7.57% after: about 5.6 times faster for preparation in this
run, not a claim about whole-chat latency. The baseline invocation also ran
the property project; this comparison uses its unit-project result. Separate
production HTTPS checks measured individual SDK read/edit round trips around
2–9 ms, excluding model reasoning; they are spot checks, not latency percentiles.
