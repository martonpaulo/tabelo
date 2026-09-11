#!/usr/bin/env bash
# Decides what a change needs from the pipeline, from the list of changed paths
# on standard input, one per line (a rename lists both its old and new path, so
# moving a file can never lower the result). CI uses it to select browser
# coverage and Deploy uses it to decide whether the built site can differ from
# the one already published, so the two cannot disagree about a path.
#
# Prints GitHub output lines:
#   run_e2e=true|false    whether any browser test runs
#   test_args=<specs>     empty for the full suite, else the spec files to run
#   affects_site=true|false  whether the built site can change
#
# An empty list is treated as unknown, which selects everything.
set -euo pipefail

level=2
level3_specs="smoke.spec.ts"
affects_site=false
seen=0

while IFS= read -r file; do
	[[ -z "$file" ]] && continue
	seen=1

	# The pipeline's own configuration: the full suite, and a rebuild, because a
	# change here can change what is built or how it is checked.
	if [[ "$file" == .github/workflows/* ]] ||
		[[ "$file" == .github/scripts/* ]] ||
		[[ "$file" == "apps/web/playwright.config.ts" ]] ||
		[[ "$file" == "apps/web/e2e-workers.ts" ]] ||
		[[ "$file" == "apps/web/worktree-ports.ts" ]]; then
		level=5
		affects_site=true
		continue
	fi

	# Documentation, agent guidance, and orchestration: nothing to run.
	if [[ "$file" == *.md ]] ||
		[[ "$file" == docs/* ]] ||
		[[ "$file" == "LICENSE" ]] ||
		[[ "$file" == .agents/* ]] ||
		[[ "$file" == .ao/* ]] ||
		[[ "$file" == .claude/* ]] ||
		[[ "$file" == .gemini/* ]] ||
		[[ "$file" == .github/instructions/* ]] ||
		[[ "$file" == .scratch/* ]]; then
		continue
	fi

	# Unit tests, benchmarks, fixtures, and their tooling: the Check job's unit
	# gate covers them and the built site does not contain them.
	if [[ "$file" =~ \.test\.tsx?$ ]] ||
		[[ "$file" =~ \.bench\.tsx?$ ]] ||
		[[ "$file" == "biome.json" ]] ||
		[[ "$file" =~ (^|/)vitest\..*\.ts$ ]] ||
		[[ "$file" =~ (^|/)fixtures/ ]]; then
		continue
	fi

	# Browser specs and their helpers: the suite runs, the site is unchanged.
	if [[ "$file" == apps/web/e2e/* ]]; then
		((level < 4)) && level=4
		continue
	fi

	affects_site=true

	if [[ "$file" == apps/web/src/copy/* ]]; then
		((level < 3)) && level=3
		continue
	fi

	if [[ "$file" == "apps/web/src/index.css" ]]; then
		((level < 3)) && level=3
		level3_specs="smoke.spec.ts visual-system.spec.ts"
		continue
	fi

	((level < 4)) && level=4
done

if ((seen == 0)); then
	level=5
	affects_site=true
fi

case "$level" in
2) echo "run_e2e=false" && echo "test_args=" ;;
3) echo "run_e2e=true" && echo "test_args=$level3_specs" ;;
*) echo "run_e2e=true" && echo "test_args=" ;;
esac
echo "affects_site=$affects_site"
