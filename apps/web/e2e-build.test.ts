import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	utimesSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BUILD_INPUTS, staleBuildInput } from "./e2e-build";

// A warm preview server serves whatever `dist` holds, so the question this
// module answers is whether a build input changed after the last build. The
// tree is synthetic and every time is set explicitly, so the answer never
// depends on how fast the file system or the machine is.
const INPUTS = ["src", "index.html"];
const BUILT = new Date("2026-01-01T12:00:00Z");
const BEFORE = new Date("2026-01-01T11:00:00Z");
const AFTER = new Date("2026-01-01T13:00:00Z");

let root: string;

function write(path: string, at: Date): void {
	const full = join(root, path);
	mkdirSync(dirname(full), { recursive: true });
	writeFileSync(full, "");
	utimesSync(full, at, at);
}

function touch(path: string, at: Date): void {
	utimesSync(join(root, path), at, at);
}

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "tabelo-e2e-build-"));
	write("src/main.ts", BEFORE);
	write("index.html", BEFORE);
	write("e2e/smoke.spec.ts", BEFORE);
	write("dist/index.html", BUILT);
	touch("src", BEFORE);
	touch("e2e", BEFORE);
});

afterEach(() => {
	rmSync(root, { recursive: true, force: true });
});

describe("staleBuildInput", () => {
	it("finds nothing when every input predates the last build", () => {
		expect(staleBuildInput(root, INPUTS)).toBeUndefined();
	});

	it("reports a missing build", () => {
		rmSync(join(root, "dist"), { recursive: true });
		expect(staleBuildInput(root, INPUTS)).toBe(join("dist", "index.html"));
	});

	it("reports a product file edited after the build", () => {
		touch("src/main.ts", AFTER);
		expect(staleBuildInput(root, INPUTS)).toBe(join("src", "main.ts"));
	});

	it("reports a top-level input edited after the build", () => {
		touch("index.html", AFTER);
		expect(staleBuildInput(root, INPUTS)).toBe("index.html");
	});

	it("ignores a spec edited after the build", () => {
		touch("e2e/smoke.spec.ts", AFTER);
		touch("e2e", AFTER);
		expect(staleBuildInput(root, INPUTS)).toBeUndefined();
	});

	it("reports a product file deleted after the build", () => {
		rmSync(join(root, "src/main.ts"));
		touch("src", AFTER);
		expect(staleBuildInput(root, INPUTS)).toBe("src");
	});

	it("skips installed dependencies inside an input", () => {
		write("src/node_modules/dep/index.js", AFTER);
		touch("src/node_modules", AFTER);
		touch("src", BEFORE);
		expect(staleBuildInput(root, INPUTS)).toBeUndefined();
	});
});

// A workspace package the app bundles that is missing here is how a warm
// round tests a stale build (#585).
describe("build inputs", () => {
	it("list every bundled workspace package", () => {
		const here = dirname(fileURLToPath(import.meta.url));
		const manifest = JSON.parse(
			readFileSync(join(here, "package.json"), "utf8"),
		) as { dependencies?: Record<string, string> };
		// Runtime dependencies are what the bundle contains; the development
		// ones (configuration, the local helper) are not built into it.
		const workspaceNames = Object.entries(manifest.dependencies ?? {})
			.filter(([, version]) => version.startsWith("workspace:"))
			.map(([name]) => name);
		const packagesRoot = join(here, "..", "..", "packages");
		// Only folders holding a manifest are packages: a checkout also gathers
		// Finder's .DS_Store and folders a removed package left behind.
		const directoryOf = new Map(
			readdirSync(packagesRoot)
				.filter((entry) =>
					existsSync(join(packagesRoot, entry, "package.json")),
				)
				.map((directory) => [
					(
						JSON.parse(
							readFileSync(
								join(packagesRoot, directory, "package.json"),
								"utf8",
							),
						) as { name: string }
					).name,
					directory,
				]),
		);
		expect(workspaceNames.length).toBeGreaterThan(0);
		for (const name of workspaceNames) {
			expect(BUILD_INPUTS).toContain(`../../packages/${directoryOf.get(name)}`);
		}
	});
});
