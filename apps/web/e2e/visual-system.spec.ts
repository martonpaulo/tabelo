import type { Page } from "@playwright/test";
import { copy } from "@/ui/copy";
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

test("controls, surfaces, and menus share their semantic visual hierarchy", async ({
	page,
	tabelo,
}) => {
	const pane = tabelo.pane("grid");
	const appButton = page.getByRole("button", {
		name: copy.actions.openAppMenu,
	});
	await expect(appButton.locator("img")).toHaveAttribute("src", /logo\.svg$/);
	await expect(appButton.locator("img")).toHaveJSProperty("complete", true);
	await expect(tabelo.workspace.getByRole("region")).toHaveCount(2);
	const appRadius = await appButton.evaluate(
		(element) => getComputedStyle(element).borderRadius,
	);
	const paneRadius = await pane.evaluate(
		(element) => getComputedStyle(element).borderRadius,
	);
	const cellRadius = await tabelo
		.cell(1, 1)
		.evaluate((element) => getComputedStyle(element).borderRadius);
	expect(appRadius).not.toBe(paneRadius);
	expect(cellRadius).not.toBe(paneRadius);
	await expect(pane.getByRole("heading").first().locator("..")).toHaveCSS(
		"border-bottom-style",
		"solid",
	);

	await appButton.click();
	const menu = page.getByRole("menu", { name: copy.actions.openAppMenu });
	expect(
		await menu.evaluate((element) => getComputedStyle(element).borderRadius),
	).toBe(paneRadius);
	expect(
		await menu
			.getByRole("menuitem", { name: copy.actions.newTable })
			.evaluate((element) => getComputedStyle(element).fontSize),
	).toBe(
		await pane
			.getByRole("heading")
			.first()
			.evaluate((element) => getComputedStyle(element).fontSize),
	);
	await expect(
		menu.getByRole("menuitem", { name: copy.actions.newTable }),
	).toHaveCSS("cursor", "pointer");
	expect(
		await menu.evaluate((element) => getComputedStyle(element).backdropFilter),
	).toContain("blur");
});

test("an empty first visit shows one centered start surface over an inert blurred workspace", async ({
	page,
}) => {
	await page.goto("/");
	const startSurface = page
		.getByRole("heading", { name: copy.empty.title })
		.locator("..");
	const overlay = startSurface.locator("..");

	await expect(startSurface).toBeVisible();
	await expect(page.locator("main").locator("..")).toHaveAttribute(
		"aria-hidden",
		"true",
	);
	await expect(
		page.getByRole("button", { name: copy.actions.openAppMenu }),
	).toHaveCount(0);
	expect(
		await overlay.evaluate(
			(element) => getComputedStyle(element).backdropFilter,
		),
	).toContain("blur");

	await page.getByRole("button", { name: copy.empty.emptyAction }).click();
	await expect(page.locator("main").locator("..")).not.toHaveAttribute(
		"aria-hidden",
		"true",
	);
	await expect(
		page.getByRole("button", { name: copy.actions.openAppMenu }),
	).toBeVisible();
});

test("source focus belongs to the pane while caret and line numbers share its metrics", async ({
	tabelo,
}) => {
	const pane = tabelo.pane("markdown");
	await tabelo.source("markdown").click();

	await expect(pane.locator(".cm-content")).toHaveCSS("outline-style", "none");
	await expect(pane.locator(".cm-cursor")).toHaveCSS(
		"border-left-style",
		"solid",
	);
	expect(
		await pane.evaluate((element) => getComputedStyle(element).boxShadow),
	).toContain("inset");

	const line = await pane.locator(".cm-line").first().boundingBox();
	const activeLine = await pane.locator(".cm-activeLine").boundingBox();
	const cursor = await pane.locator(".cm-cursor").boundingBox();
	const number = await pane
		.locator(".cm-lineNumbers .cm-gutterElement")
		.filter({ hasText: /^1$/ })
		.boundingBox();
	expect(line).not.toBeNull();
	expect(activeLine).not.toBeNull();
	expect(cursor).not.toBeNull();
	expect(number).not.toBeNull();
	expect(Math.abs((line?.y ?? 0) - (number?.y ?? 0))).toBeLessThanOrEqual(1);
	expect(cursor?.height ?? 0).toBeGreaterThanOrEqual(
		(line?.height ?? 0) * 0.85,
	);
	expect(cursor?.height ?? 0).toBeLessThanOrEqual(line?.height ?? 0);
	expect(
		Math.abs(
			(activeLine?.y ?? 0) +
				(activeLine?.height ?? 0) / 2 -
				((cursor?.y ?? 0) + (cursor?.height ?? 0) / 2),
		),
	).toBeLessThanOrEqual(1);

	await tabelo.page.keyboard.press("ControlOrMeta+A");
	const selectionColours = () =>
		pane.locator(".cm-editor").evaluate((editor) => {
			const drawn = editor.querySelector<HTMLElement>(
				".cm-selectionBackground",
			);
			const content = editor.querySelector<HTMLElement>(".cm-content");
			return {
				drawn: drawn ? getComputedStyle(drawn).backgroundColor : "",
				native: content
					? getComputedStyle(content, "::selection").backgroundColor
					: "",
			};
		});
	await expect
		.poll(async () => {
			const colours = await selectionColours();
			return colours.drawn === "" ? null : colours;
		})
		.not.toBeNull();
	const lightColours = await selectionColours();
	expect(lightColours.drawn).toBe(lightColours.native);

	await tabelo.page.emulateMedia({ colorScheme: "dark" });
	await expect
		.poll(async () => (await selectionColours()).drawn)
		.not.toBe(lightColours.drawn);
	const darkColours = await selectionColours();
	expect(darkColours.drawn).toBe(darkColours.native);
	expect(darkColours.drawn).not.toBe(lightColours.drawn);
});

test("read-only panes use a written cue and a distinct surface", async ({
	tabelo,
}) => {
	await tabelo.choosePaneView("markdown", "html-preview");
	const editablePane = tabelo.pane("grid");
	const readOnlyPane = tabelo.pane("html-preview");

	await expect(
		readOnlyPane.getByText(copy.workspace.readOnly, { exact: true }),
	).toBeVisible();
	const editableBackground = await editablePane
		.locator(":scope > div")
		.last()
		.evaluate((element) => getComputedStyle(element).backgroundColor);
	const readOnlyBackground = await readOnlyPane
		.locator(":scope > div")
		.last()
		.evaluate((element) => getComputedStyle(element).backgroundColor);
	expect(readOnlyBackground).not.toBe(editableBackground);
});

test("a single pane keeps the same compact hierarchy without extra framing", async ({
	tabelo,
}) => {
	await tabelo.chooseLayout("single");
	const panes = tabelo.workspace.getByRole("region");
	await expect(panes).toHaveCount(1);
	await expect(
		panes.first().getByRole("button", {
			name: new RegExp(`^${copy.workspace.paneActions}:`),
		}),
	).toBeVisible();
});

test("a three-pane preset keeps the same readable action hierarchy", async ({
	tabelo,
}) => {
	await tabelo.chooseLayout("left-split");
	const panes = tabelo.workspace.getByRole("region");
	await expect(panes).toHaveCount(3);
	const headingSizes = new Set<string>();
	for (const pane of await panes.all()) {
		headingSizes.add(
			await pane
				.getByRole("heading")
				.first()
				.evaluate((element) => getComputedStyle(element).fontSize),
		);
		await expect(
			pane.getByRole("button", {
				name: new RegExp(`^${copy.workspace.paneActions}:`),
			}),
		).toBeVisible();
	}
	expect(headingSizes.size).toBe(1);
});

test("critical document controls remain available at 200% text size", async ({
	page,
	tabelo,
}) => {
	await page.setViewportSize({ width: 1280, height: 720 });
	await page.evaluate(() => {
		document.documentElement.style.fontSize = "200%";
	});

	await expect(
		page.getByRole("button", { name: copy.actions.openAppMenu }),
	).toBeVisible();
	const menu = await tabelo.openAppMenu();
	await expect(
		menu.getByRole("menuitem", { name: copy.workspace.layout }),
	).toBeVisible();
	await expect(tabelo.workspace).toBeVisible();
	expect(
		await page.evaluate(
			() => document.documentElement.scrollWidth <= window.innerWidth,
		),
	).toBe(true);
});

test("light and dark text and focus tokens meet their contrast floors", async ({
	page,
}) => {
	await page.goto("/");
	const backgrounds: string[] = [];
	for (const dark of [false, true]) {
		await page.emulateMedia({ colorScheme: dark ? "dark" : "light" });
		backgrounds.push(
			await page
				.locator("body")
				.evaluate((element) => getComputedStyle(element).backgroundColor),
		);
		expect(
			await contrastBetween(page, "--foreground", "--surface-panel"),
		).toBeGreaterThanOrEqual(4.5);
		expect(
			await contrastBetween(page, "--muted-foreground", "--surface-panel"),
		).toBeGreaterThanOrEqual(4.5);
		expect(
			await contrastBetween(page, "--selection-edge", "--surface-panel"),
		).toBeGreaterThanOrEqual(3);

		const selectionFills = await page.evaluate(() => {
			const styles = getComputedStyle(document.documentElement);
			return [
				styles.getPropertyValue("--selection-fill").trim(),
				styles.getPropertyValue("--text-selection-fill").trim(),
				styles.getPropertyValue("--active-line-fill").trim(),
			];
		});
		expect(new Set(selectionFills).size).toBe(3);
	}
	expect(new Set(backgrounds).size).toBe(2);
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
		await tabelo.chooseLayout("quad");
		const panes = tabelo.workspace.getByRole("region");
		await expect(panes).toHaveCount(4);
		const headingSizes = new Set<string>();
		expect(
			await page.evaluate(
				() => document.documentElement.scrollWidth <= window.innerWidth,
			),
		).toBe(true);

		for (const pane of await panes.all()) {
			await expect(pane).toBeVisible();
			headingSizes.add(
				await pane
					.getByRole("heading")
					.first()
					.evaluate((element) => getComputedStyle(element).fontSize),
			);
			await expect(
				pane.getByRole("button", {
					name: new RegExp(`^${copy.workspace.paneActions}:`),
				}),
			).toBeVisible();
		}
		expect(headingSizes.size).toBe(1);
	});
}
