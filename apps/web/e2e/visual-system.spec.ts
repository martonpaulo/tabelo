import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

async function contrastBetween(
	page: Page,
	foreground: string,
	background: string,
): Promise<number> {
	return page.evaluate(
		({ foreground, background }) => {
			const styles = getComputedStyle(document.documentElement);
			const canvas = document.createElement("canvas");
			canvas.width = 1;
			canvas.height = 1;
			const context = canvas.getContext("2d", { willReadFrequently: true });
			if (!context) throw new Error("Canvas colour conversion is unavailable.");

			const rgb = (token: string) => {
				context.clearRect(0, 0, 1, 1);
				context.fillStyle = styles.getPropertyValue(token).trim();
				context.fillRect(0, 0, 1, 1);
				return [...context.getImageData(0, 0, 1, 1).data.slice(0, 3)];
			};
			const luminance = (channels: number[]) => {
				const [red, green, blue] = channels.map((channel) => {
					const value = channel / 255;
					return value <= 0.04045
						? value / 12.92
						: ((value + 0.055) / 1.055) ** 2.4;
				});
				return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
			};

			const foregroundLuminance = luminance(rgb(foreground));
			const backgroundLuminance = luminance(rgb(background));
			const lighter = Math.max(foregroundLuminance, backgroundLuminance);
			const darker = Math.min(foregroundLuminance, backgroundLuminance);
			return (lighter + 0.05) / (darker + 0.05);
		},
		{ foreground, background },
	);
}

test("interactive surfaces share one radius while table structure stays square", async ({
	page,
	tabelo,
}) => {
	const pane = tabelo.pane("Visual table");
	const fileButton = page.getByRole("button", { name: "File", exact: true });
	const emptyState = page.getByText("Start with an empty table").locator("..");

	await expect(fileButton).toHaveCSS("border-radius", "6px");
	await expect(emptyState).toHaveCSS("border-radius", "6px");
	await expect(tabelo.cell(1, 1)).toHaveCSS("border-radius", "0px");
	await expect(pane).toHaveCSS("border-radius", "0px");
	await expect(pane.getByRole("heading").first()).toHaveCSS(
		"font-size",
		"14px",
	);
	await expect(pane.getByRole("heading").first().locator("..")).toHaveCSS(
		"border-bottom-width",
		"0px",
	);

	await fileButton.click();
	const menu = page.getByRole("menu", { name: "File" });
	await expect(menu).toHaveCSS("border-radius", "6px");
	await expect(menu.getByRole("menuitem", { name: "New table" })).toHaveCSS(
		"font-size",
		"14px",
	);
});

test("a single pane keeps the same compact hierarchy without extra framing", async ({
	tabelo,
}) => {
	await tabelo.chooseLayout("Single");
	const panes = tabelo.workspace.getByRole("region");
	await expect(panes).toHaveCount(1);
	await expect(panes.first().getByRole("heading").first()).toHaveCSS(
		"font-size",
		"14px",
	);
	await expect(
		panes.first().getByRole("button", { name: /^Pane actions:/ }),
	).toBeVisible();
});

test("light and dark text and focus tokens meet their contrast floors", async ({
	page,
}) => {
	await page.goto("/");
	for (const dark of [false, true]) {
		await page.emulateMedia({ colorScheme: dark ? "dark" : "light" });
		expect(
			await contrastBetween(page, "--foreground", "--surface-panel"),
		).toBeGreaterThanOrEqual(4.5);
		expect(
			await contrastBetween(page, "--muted-foreground", "--surface-panel"),
		).toBeGreaterThanOrEqual(4.5);
		expect(
			await contrastBetween(page, "--selection-edge", "--surface-panel"),
		).toBeGreaterThanOrEqual(3);
	}
});

for (const viewport of [
	{ width: 1024, height: 768 },
	{ width: 1280, height: 720 },
	{ width: 1600, height: 900 },
]) {
	test(`four panes preserve readable labels at ${viewport.width}x${viewport.height}`, async ({
		page,
		tabelo,
	}) => {
		await page.setViewportSize(viewport);
		await tabelo.chooseLayout("Four panes");
		const panes = tabelo.workspace.getByRole("region");
		await expect(panes).toHaveCount(4);
		expect(
			await page.evaluate(
				() => document.documentElement.scrollWidth <= window.innerWidth,
			),
		).toBe(true);

		for (const pane of await panes.all()) {
			await expect(pane).toBeVisible();
			await expect(pane.getByRole("heading").first()).toHaveCSS(
				"font-size",
				"14px",
			);
			await expect(
				pane.getByRole("button", { name: /^Pane actions:/ }),
			).toBeVisible();
		}
	});
}
