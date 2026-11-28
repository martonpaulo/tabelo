import { test as base, expect } from "@playwright/test";
import { TabeloPage } from "./helpers";

interface TabeloFixtures {
	readonly tabelo: TabeloPage;
}

export const test = base.extend<TabeloFixtures>({
	// The built page declares a Content-Security-Policy (#570). Chromium
	// reports each refusal on the console, so any test that makes the page
	// load something the policy does not allow fails here.
	page: async ({ page }, use) => {
		// Playwright starts intercepting file choosers when the first
		// `filechooser` listener is added, without waiting for the browser to
		// confirm it, so a `waitForEvent("filechooser")` right before the press
		// that opens one can lose the race under load and wait forever (#595).
		// One listener for the page's whole life turns interception on before
		// the first navigation, long before any test opens a chooser.
		page.on("filechooser", () => {});
		const violations: string[] = [];
		page.on("console", (message) => {
			if (/Content Security Policy/i.test(message.text()))
				violations.push(message.text());
		});
		await use(page);
		expect(violations).toEqual([]);
	},
	tabelo: async ({ page }, use) => {
		const tabelo = new TabeloPage(page);
		await tabelo.open();
		await use(tabelo);
	},
});

export { expect };
