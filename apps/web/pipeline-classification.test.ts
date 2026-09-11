import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// The pipeline's path rules: which browser tests a change runs, and whether the
// built site can differ so Deploy has to publish. CI and Deploy both read this
// one script, so a wrong answer here either spends runners for nothing or,
// worse, lets an interface change skip the browser suite or the deploy.
const script = fileURLToPath(
	new URL("../../.github/scripts/classify-changes.sh", import.meta.url),
);

function classify(paths: readonly string[]) {
	const result = spawnSync("bash", [script], {
		input: paths.join("\n"),
		encoding: "utf8",
	});
	expect(result.status).toBe(0);
	return Object.fromEntries(
		result.stdout
			.trim()
			.split("\n")
			.map((line) => line.split("=") as [string, string]),
	);
}

const nothing = { run_e2e: "false", test_args: "", affects_site: "false" };
const fullSuite = { run_e2e: "true", test_args: "" };

describe("classify-changes", () => {
	it("runs nothing and publishes nothing for documentation and guidance", () => {
		expect(
			classify(["README.md", "docs/testing.md", ".agents/skills/x/SKILL.md"]),
		).toEqual(nothing);
	});

	it("leaves unit tests, fixtures, and their tooling to the unit gate", () => {
		expect(
			classify([
				"apps/web/src/core/matching-cells.test.ts",
				"apps/web/src/formats/fixtures/roster.csv",
				"apps/web/vitest.config.ts",
				"biome.json",
			]),
		).toEqual(nothing);
	});

	it("runs the full suite for a browser spec without publishing", () => {
		expect(classify(["apps/web/e2e/smoke.spec.ts"])).toEqual({
			...fullSuite,
			affects_site: "false",
		});
	});

	it("runs the smoke suite for interface copy, and publishes it", () => {
		expect(classify(["apps/web/src/copy/copy.ts"])).toEqual({
			run_e2e: "true",
			test_args: "smoke.spec.ts",
			affects_site: "true",
		});
	});

	it("adds the visual-system suite for the global stylesheet", () => {
		expect(classify(["apps/web/src/index.css"])).toEqual({
			run_e2e: "true",
			test_args: "smoke.spec.ts visual-system.spec.ts",
			affects_site: "true",
		});
	});

	it("runs the full suite and publishes for application code", () => {
		expect(classify(["apps/web/src/ui/grid/table-grid.tsx"])).toEqual({
			...fullSuite,
			affects_site: "true",
		});
	});

	it("treats the pipeline's own configuration as the highest level", () => {
		for (const path of [
			".github/workflows/deploy.yml",
			".github/scripts/classify-changes.sh",
			"apps/web/playwright.config.ts",
		]) {
			expect(classify([path])).toEqual({ ...fullSuite, affects_site: "true" });
		}
	});

	it("uses the highest level of a mixed change", () => {
		expect(
			classify([
				"docs/product.md",
				"apps/web/src/copy/copy.ts",
				"apps/web/src/ui/app-menu.tsx",
			]),
		).toEqual({ ...fullSuite, affects_site: "true" });
	});

	it("selects everything when the change is unknown", () => {
		expect(classify([])).toEqual({ ...fullSuite, affects_site: "true" });
	});
});
