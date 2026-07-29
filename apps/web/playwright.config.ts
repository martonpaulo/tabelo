import { defineConfig, devices } from "@playwright/test";

const serverUrl = "http://127.0.0.1:4173";

// Chromium owns the complete behavioural suite. Firefox repeats only contracts
// where browser engines materially differ, so cross-browser confidence does not
// require running every product assertion twice.
const firefoxContractSpecs = [
	"**/clipboard.spec.ts",
	"**/download.spec.ts",
	"**/grid-keyboard.spec.ts",
	"**/history.spec.ts",
	"**/persistence.spec.ts",
	"**/responsive.spec.ts",
	"**/smoke.spec.ts",
	"**/source-geometry.spec.ts",
	"**/source-sync.spec.ts",
];

export default defineConfig({
	testDir: "./e2e",
	fullyParallel: true,
	forbidOnly: Boolean(process.env.CI),
	retries: process.env.CI ? 1 : 0,
	workers: process.env.CI ? 1 : undefined,
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
		command:
			"pnpm build && pnpm serve --host 127.0.0.1 --port 4173 --strictPort",
		url: serverUrl,
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
	},
});
