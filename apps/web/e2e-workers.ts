// Playwright validates `workers` before it resolves it, and the two steps
// disagree about what a string may hold. The resolver calls `parseInt` on any
// string that does not end in `%`, so it would read "1" as one worker. The
// validator runs first and accepts a string only when it does end in `%`, so a
// bare "1" is rejected as a malformed config before the resolver ever sees it.
// Handing over a number for the plain-integer form is therefore the whole fix,
// and the percentage form stays the string Playwright already wants.
// https://playwright.dev/docs/api/class-testconfig#test-config-workers

// Playwright computes its default worker count per process, with no awareness of
// the other worktrees running their own suites on the same machine. Halving the
// default halves the browser memory each run holds, which is what keeps several
// parallel checkouts inside the memory of one laptop. An agent that knows it is
// one of several can drop further by setting the variable rather than editing
// this file.
const DEFAULT_WORKERS = "25%";

const VARIABLE = "TABELO_E2E_WORKERS";

const PERCENTAGE = /^(\d+)%$/;

function rejected(raw: string): Error {
	return new Error(
		`${VARIABLE} must be a positive integer or a percentage like "25%", received "${raw}".`,
	);
}

// An empty value counts as unset, and the integer form goes through `Number`
// rather than `parseInt`, both to match `readPortOverride` in `worktree-ports`.
// Two readers of TABELO_* variables in one app that disagreed about `""` would
// be worse than whichever rule either of them picked alone.
export function parseWorkers(raw: string | undefined): number | string {
	if (raw === undefined || raw === "") return DEFAULT_WORKERS;

	const percentage = PERCENTAGE.exec(raw);
	if (percentage) {
		// Playwright floors a percentage against the CPU count and then clamps to
		// one, so any positive percentage resolves. Zero is the caller asking for
		// no workers at all, which is a mistake worth naming here.
		if (Number(percentage[1]) < 1) throw rejected(raw);
		return raw;
	}

	// Checked for a floor but not a ceiling. A port has a real range to validate
	// against; a worker count has no upper limit this project owns, so any cap
	// would be a number with no reason behind it.
	const workers = Number(raw);
	if (!Number.isInteger(workers) || workers < 1) throw rejected(raw);
	return workers;
}

export const e2eWorkers = parseWorkers(process.env[VARIABLE]);
