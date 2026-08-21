import { defineConfig, devices } from "@playwright/test";
import { e2eWorkers } from "./e2e-workers";
import { previewServerPort } from "./worktree-ports";

const serverUrl = `http://127.0.0.1:${previewServerPort}`;

export default defineConfig({
	testDir: "./e2e",
	fullyParallel: true,
	forbidOnly: Boolean(process.env.CI),
	retries: process.env.CI ? 1 : 0,
	// A shard past ten red tests is reporting one broken thing many times, not
	// ten findings. Stop there rather than paying for the rest of the suite.
	maxFailures: process.env.CI ? 10 : 0,
	// A hosted runner has four cores and ran this suite one test at a time,
	// which is the scaffold's starting value rather than a measured one. Two is
	// what Playwright documents for CI: https://playwright.dev/docs/test-parallel
	workers: process.env.CI ? 2 : e2eWorkers,
	reporter: process.env.CI ? [["line"], ["blob"]] : "list",
	outputDir: "test-results",
	use: {
		baseURL: serverUrl,
		screenshot: "only-on-failure",
		trace: "retain-on-failure",
	},
	// Chromium is the only engine the project supports, and the only one the
	// suite runs. The project stays named because the workspace scripts and the
	// CI matrix both select it with `--project=chromium`.
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
	],
	webServer: {
		// The port lives in the Vite config, so the preview server binds the same
		// value whether Playwright starts it or `pnpm test:e2e:serve` did.
		command: "pnpm build && pnpm serve --host 127.0.0.1",
		url: serverUrl,
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
	},
});
