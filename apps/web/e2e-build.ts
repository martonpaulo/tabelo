import { execFileSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

// Locally Playwright reuses a preview server that already answers, and then
// skips `webServer.command`, which is the only place the suite builds. The
// preview reads `dist` from disk on every request, so a warm server keeps
// serving whatever was built last: after a product edit, the next round would
// test the old build and report on code that was never exercised (#436).
//
// Playwright starts or reuses the web server before global setup runs, so this
// is the last moment before any test where `dist` can still be brought up to
// date. A cold run has just built it, and CI never reuses a server, so both
// find nothing newer and pay nothing.

const appRoot = dirname(fileURLToPath(import.meta.url));

// Everything the production build reads, relative to this app. A spec, the
// Playwright config, or a unit test is not here, so an edit to one of them keeps
// the warm round's skipped build. A new build input belongs in this list:
// leaving one out is how a stale build gets tested again.
const BUILD_INPUTS = [
	"src",
	"public",
	"index.html",
	"vite.config.ts",
	"worktree-ports.ts",
	"tsconfig.json",
	"package.json",
	"../../packages/ui",
];

const BUILT_MARKER = "dist/index.html";

const SKIPPED_DIRECTORIES = new Set(["node_modules"]);

function modifiedAt(path: string): number | undefined {
	try {
		return statSync(path).mtimeMs;
	} catch {
		return undefined;
	}
}

// A directory's own time counts too: deleting or renaming a file changes its
// parent and nothing else, and a removed source file is a product change.
function newerThan(path: string, builtAt: number): string | undefined {
	const time = modifiedAt(path);
	if (time === undefined) return undefined;
	if (time > builtAt) return path;
	if (!statSync(path).isDirectory()) return undefined;
	for (const entry of readdirSync(path)) {
		if (SKIPPED_DIRECTORIES.has(entry)) continue;
		const found = newerThan(join(path, entry), builtAt);
		if (found) return found;
	}
	return undefined;
}

// Returns the path, relative to `root`, that makes the build out of date, or
// undefined when the last build is still current. A missing build is reported
// as its own marker.
export function staleBuildInput(
	root: string,
	inputs: readonly string[] = BUILD_INPUTS,
): string | undefined {
	const builtAt = modifiedAt(join(root, BUILT_MARKER));
	if (builtAt === undefined) return BUILT_MARKER;
	for (const input of inputs) {
		const found = newerThan(join(root, input), builtAt);
		if (found) return relative(root, found);
	}
	return undefined;
}

export default function rebuildStalePreview(): void {
	const stale = staleBuildInput(appRoot);
	if (stale === undefined) return;
	console.log(`Rebuilding for the preview server: ${stale} changed.`);
	// The same command the web server runs, so a warm round and a cold one test
	// the same build.
	execFileSync("pnpm", ["build"], { cwd: appRoot, stdio: "inherit" });
}
