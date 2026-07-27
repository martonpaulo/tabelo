import { expect, test } from "./fixtures";

test("first paint follows the system before application JavaScript runs", async ({
	browser,
}) => {
	const backgroundFor = async (colorScheme: "light" | "dark") => {
		const context = await browser.newContext({
			colorScheme,
			serviceWorkers: "block",
		});
		const page = await context.newPage();
		await page.addInitScript(() => {
			localStorage.setItem("tabelo.theme", "light");
		});
		await page.route(/\.js(?:\?|$)/, (route) => route.abort());
		await page.goto("/", { waitUntil: "domcontentloaded" });
		const result = await page.locator("body").evaluate((body) => ({
			background: getComputedStyle(body).backgroundColor,
			rootClass: document.documentElement.className,
		}));
		await context.close();
		return result;
	};

	const light = await backgroundFor("light");
	const dark = await backgroundFor("dark");
	expect(light.background).not.toBe(dark.background);
	expect(light.rootClass).not.toContain("dark");
	expect(dark.rootClass).not.toContain("dark");
});

test("system changes apply live and the retired preference is cleared", async ({
	page,
}) => {
	await page.emulateMedia({ colorScheme: "light" });
	await page.addInitScript(() => {
		localStorage.setItem("tabelo.theme", "dark");
	});
	await page.goto("/");
	await page.getByRole("main", { name: "Workspace" }).waitFor();

	expect(
		await page.evaluate(() => localStorage.getItem("tabelo.theme")),
	).toBeNull();
	await expect(page.getByRole("button", { name: /^Theme:/ })).toHaveCount(0);
	const lightBackground = await page
		.locator("body")
		.evaluate((body) => getComputedStyle(body).backgroundColor);

	await page.emulateMedia({ colorScheme: "dark" });
	await expect
		.poll(() =>
			page
				.locator("body")
				.evaluate((body) => getComputedStyle(body).backgroundColor),
		)
		.not.toBe(lightBackground);
	expect(
		(await page.locator("html").getAttribute("class")) ?? "",
	).not.toContain("dark");
});
