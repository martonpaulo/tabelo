import { test as base, expect } from "@playwright/test";
import { TabeloPage } from "./helpers";

interface TabeloFixtures {
	readonly tabelo: TabeloPage;
}

export const test = base.extend<TabeloFixtures>({
	tabelo: async ({ page }, use) => {
		const tabelo = new TabeloPage(page);
		await tabelo.open();
		await use(tabelo);
	},
});

export { expect };
