import { defineConfig, devices } from "@playwright/test";
import { e2eWorkers } from "./e2e-workers";
import { previewServerPort } from "./worktree-ports";

const serverUrl = `http://127.0.0.1:${previewServerPort}`;

// Chromium owns the complete behavioural suite. Firefox repeats only contracts
// where browser engines materially differ, so cross-browser confidence does not
// require running every product assertion twice.
const firefoxContractSpecs = [
	"**/clipboard.spec.ts",
	"**/download.spec.ts",
	"**/grid-keyboard.spec.ts",
	"**/header-import.spec.ts",
	"**/history.spec.ts",
	"**/import.spec.ts",
	"**/new-table.spec.ts",
	"**/overscroll.spec.ts",
	"**/pane-move.spec.ts",
	"**/persistence.spec.ts",
	// Recovery places focus in the grid across a closing dialog or menu, which
	// races each engine's own focus restoration.
	"**/precondition-recovery.spec.ts",
	"**/responsive.spec.ts",
	"**/smoke.spec.ts",
	"**/source-geometry.spec.ts",
	// Multiple selection, the primary range, and where focus stays after a
	// command are exactly where the two engines' selection handling differs.
	"**/source-occurrences.spec.ts",
	"**/source-sync.spec.ts",
	"**/system-theme.spec.ts",
];

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
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
		{
			name: "firefox",
			testMatch: firefoxContractSpecs,
			use: { ...devices["Desktop Firefox"] },
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
