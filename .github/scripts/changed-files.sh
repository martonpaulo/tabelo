#!/usr/bin/env bash
# Prints every path changed between two commits of a repository, one per line,
# a rename as both its old and its new path. Prints nothing when the answer is
# not trustworthy, which classify-changes.sh reads as "select everything": the
# head is not a descendant of the base (a rewritten history), or the change is
# at the compare API's 300-file ceiling, past which it silently truncates.
#
# Usage: changed-files.sh <owner/repo> <base sha> <head sha>
set -euo pipefail

repo="$1"
base="$2"
head="$3"

compare=$(gh api "repos/$repo/compare/$base...$head")
status=$(jq -r '.status' <<<"$compare")
count=$(jq '.files | length' <<<"$compare")

if [[ "$status" != "ahead" && "$status" != "identical" ]] || ((count >= 300)); then
	exit 0
fi

jq -r '.files[] | .filename, (.previous_filename // empty)' <<<"$compare"
