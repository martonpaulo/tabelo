import { expect, test } from "@playwright/test";
import { copy } from "@/copy/copy";

// GitHub Pages has no SPA rewrite rule, so the deploy workflow serves
// index.html as 404.html. That gets a deep link to the application, but leaves
// the deep path in the address bar. Normalizing it back to the canonical path
// is the other half of the contract, and it is the half that lives in the
// application rather than in the workflow.

// The canonical path is whatever BASE_PATH the build used, so the expectation
// is read from the running build instead of assuming the deployed "/tabelo/"
// or the local "/".
function canonicalPathname(baseURL: string | undefined): string {
	if (!baseURL) {
		throw new Error("The Playwright base URL is required.");
	}

	return new URL(baseURL).pathname;
}

test("a deep path reaches the application", async ({ page, baseURL }) => {
	const canonical = canonicalPathname(baseURL);

	await page.goto(`${canonical}some/deep/path`);

	await expect(
		page.getByRole("region", { name: copy.empty.title }),
	).toBeVisible();
});

test("a deep path is normalized to the canonical path", async ({
	page,
	baseURL,
}) => {
	const canonical = canonicalPathname(baseURL);

	await page.goto(`${canonical}some/deep/path`);
	await page.getByRole("region", { name: copy.empty.title }).waitFor();

	expect(new URL(page.url()).pathname).toBe(canonical);
});

test("normalization replaces the deep path instead of stacking onto it", async ({
	page,
	baseURL,
}) => {
	const canonical = canonicalPathname(baseURL);
	const deepPath = `${canonical}some/deep/path`;

	await page.goto(deepPath);
	await page.getByRole("region", { name: copy.empty.title }).waitFor();
	await page.goBack();

	// Going back must not land on the deep path again. Whether the browser can
	// go back at all depends on how the test arrived, so the assertion is about
	// where it does not end up.
	expect(new URL(page.url()).pathname).not.toBe(deepPath);
});
