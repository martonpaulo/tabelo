import type { Page } from "@playwright/test";
import { copy } from "@/copy/copy";
import { layoutPresets } from "@/workspace/layout";
import { expect, test } from "./fixtures";

async function contrastBetween(
	page: Page,
	foreground: string,
	background: string,
): Promise<number> {
	const colors = await page.evaluate(
		({ foreground, background }) => {
			const styles = getComputedStyle(document.documentElement);
			return {
				foreground: styles.getPropertyValue(foreground).trim(),
				background: styles.getPropertyValue(background).trim(),
			};
		},
		{ foreground, background },
	);
	return contrastBetweenColors(page, colors.foreground, colors.background);
}

async function contrastBetweenColors(
	page: Page,
	foreground: string,
	background: string,
): Promise<number> {
	return page.evaluate(
		({ foreground, background }) => {
			const canvas = document.createElement("canvas");
			canvas.width = 1;
			canvas.height = 1;
			const context = canvas.getContext("2d", { willReadFrequently: true });
			if (!context) throw new Error("Canvas colour conversion is unavailable.");

			const rgb = (color: string, backdrop?: string) => {
				context.clearRect(0, 0, 1, 1);
				if (backdrop) {
					context.fillStyle = backdrop;
					context.fillRect(0, 0, 1, 1);
				}
				context.fillStyle = color;
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

			const foregroundLuminance = luminance(rgb(foreground, background));
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
	// Both surfaces are filled by the shared hairline treatment, so the fill is
	// the custom property rather than a background colour.
	const surfaceFill = (locator: typeof menu) =>
		locator.evaluate((element) =>
			getComputedStyle(element).getPropertyValue("--hairline-fill").trim(),
		);
	expect(await surfaceFill(menu)).not.toBe(await surfaceFill(pane));
	await expect(
		menu.getByRole("menuitem", { name: copy.actions.newTable }),
	).toHaveCSS("cursor", "pointer");
	expect(
		await menu.evaluate((element) => getComputedStyle(element).backdropFilter),
	).toContain("blur");
});

// Every rounded boundary in the product is drawn the same way, and the reasons
// are geometric rather than stylistic: a ring is painted behind the element so
// the background's antialiased corner eats it, a second stroke at a different
// radius doubles the arc, and a translucent background under a border muddies
// it. Walking the live DOM is the only way to catch a component that opts out.
async function roundedOffenders(page: Page): Promise<string[]> {
	return page.evaluate(() =>
		[...document.querySelectorAll<HTMLElement>("*")]
			.flatMap((element) => {
				const style = getComputedStyle(element);
				const radius = Number.parseFloat(style.borderTopLeftRadius) || 0;
				const rect = element.getBoundingClientRect();
				if (radius <= 0 || rect.width < 8 || rect.height < 8) return [];

				const borders = [
					style.borderTopWidth,
					style.borderRightWidth,
					style.borderBottomWidth,
					style.borderLeftWidth,
				].map((width) => Number.parseFloat(width) || 0);
				const hasBorder = borders.some((width) => width > 0);
				const shadow = style.boxShadow === "none" ? "" : style.boxShadow;
				const ring = /^[^,]*\b0px 0px 0px [\d.]+px/.test(shadow);
				const outlined =
					style.outlineStyle !== "none" &&
					(Number.parseFloat(style.outlineWidth) || 0) > 0;
				const translucent = /rgba?\([^)]*,\s*0?\.\d+\)/.test(
					style.backgroundColor,
				);

				const faults: string[] = [];
				if (ring) faults.push("ring on a rounded surface");
				if (ring && hasBorder) faults.push("two strokes on one edge");
				if (outlined && hasBorder) faults.push("outline over a border");
				if (
					translucent &&
					hasBorder &&
					!style.backgroundClip.includes("padding")
				)
					faults.push("translucent background under a border");
				if (faults.length === 0) return [];
				const name =
					element.getAttribute("data-slot") ??
					element.getAttribute("role") ??
					element.tagName.toLowerCase();
				return [`${name}: ${faults.join(", ")}`];
			})
			.filter((value, index, all) => all.indexOf(value) === index),
	);
}

test("every rounded boundary is drawn as one filled stroke", async ({
	page,
	tabelo,
}) => {
	await page.emulateMedia({ colorScheme: "dark" });
	expect(await roundedOffenders(page)).toEqual([]);

	const menu = await tabelo.openPaneMenu("markdown");
	await expect(menu).toBeVisible();
	expect(await roundedOffenders(page)).toEqual([]);
	await page.keyboard.press("Escape");

	const dialog = await tabelo.openLayoutDialog();
	await expect(dialog).toBeVisible();
	expect(await roundedOffenders(page)).toEqual([]);
	await dialog.getByRole("button", { name: copy.actions.cancel }).click();

	await tabelo.paste("Name\tRole\nInez\tDesigner");
	await expect(tabelo.notice().first()).toBeVisible();
	expect(await roundedOffenders(page)).toEqual([]);
});

test("shared motion stays brief, cancellable, and reduced-motion safe", async ({
	page,
	tabelo: _tabelo,
}) => {
	await page.emulateMedia({ reducedMotion: "no-preference" });
	const trigger = page.getByRole("button", {
		name: copy.actions.openAppMenu,
	});
	const controlMotion = await trigger.evaluate((element) => {
		const style = getComputedStyle(element);
		return {
			properties: style.transitionProperty.split(", "),
			durations: style.transitionDuration
				.split(", ")
				.map((duration) => Number.parseFloat(duration)),
		};
	});
	expect(controlMotion.properties).not.toContain("all");
	expect(controlMotion.durations.every((duration) => duration > 0)).toBe(true);

	await trigger.click();
	const menu = page.getByRole("menu", { name: copy.actions.openAppMenu });
	const popupMotion = await menu.evaluate((element) => {
		const style = getComputedStyle(element);
		return {
			animation: style.animationName,
			properties: style.transitionProperty.split(", "),
		};
	});
	expect(popupMotion.animation).toBe("none");
	expect(popupMotion.properties).toContain("opacity");
	expect(popupMotion.properties).toContain("transform");
	await page.keyboard.press("Escape");

	await page.emulateMedia({ reducedMotion: "reduce" });
	const reducedDurations = await trigger.evaluate((element) =>
		getComputedStyle(element)
			.transitionDuration.split(", ")
			.map((duration) => Number.parseFloat(duration)),
	);
	expect(reducedDurations.every((duration) => duration <= 0.001)).toBe(true);
});

test("the pane zoom label is announced", async ({ tabelo }) => {
	const paneMenu = await tabelo.openPaneMenu("markdown");
	const zoomLabel = paneMenu.getByText(copy.workspace.zoom(100), {
		exact: true,
	});
	await expect(zoomLabel).toHaveAttribute("aria-live", "polite");
});

test("only view content participates in native text selection", async ({
	tabelo,
}) => {
	const markdownPane = tabelo.pane("markdown");
	await expect(markdownPane.getByRole("heading").first()).toHaveCSS(
		"user-select",
		"none",
	);
	await expect(markdownPane.locator(".cm-gutters")).toHaveCSS(
		"user-select",
		"none",
	);
	await expect(markdownPane.locator(".cm-content")).toHaveCSS(
		"user-select",
		"text",
	);

	const appMenu = await tabelo.openAppMenu();
	await expect(appMenu.getByText(copy.app.name, { exact: true })).toHaveCSS(
		"user-select",
		"none",
	);
	await expect(appMenu.getByText(copy.app.tagline, { exact: true })).toHaveCSS(
		"user-select",
		"none",
	);
	await tabelo.page.keyboard.press("Escape");

	await tabelo.choosePaneView("markdown", "html-preview");
	await expect(tabelo.pane("html-preview").locator("table")).toHaveCSS(
		"user-select",
		"text",
	);
});

// The active edge is the pane's own border wearing the accent, not a second
// stroke inside it: one stroke, so the rounded corners stay one arc, and the
// same width in both states, so activating a pane moves nothing.
test("the active pane boundary replaces the resting one", async ({
	page,
	tabelo,
}) => {
	await page.emulateMedia({ colorScheme: "dark" });
	await tabelo.cell(1, 1).click();
	const active = tabelo.pane("grid");
	const inactive = tabelo.pane("markdown");
	await expect(active).toHaveAttribute("data-pane-active", "true");
	await expect(active).toHaveAttribute("aria-current", "true");
	await expect(inactive).not.toHaveAttribute("data-pane-active");
	await expect(inactive).not.toHaveAttribute("aria-current");

	// The stroke's colour is the hairline custom property: the border itself is
	// transparent, because the stroke is painted as a filled ring so a curve
	// keeps its colour on a low-density display.
	const edges = async (pane: typeof active) =>
		pane.evaluate((element) => {
			const style = getComputedStyle(element);
			return {
				widths: [
					style.borderTopWidth,
					style.borderRightWidth,
					style.borderBottomWidth,
					style.borderLeftWidth,
				],
				stroke: style.getPropertyValue("--hairline-color").trim(),
				accent: style.getPropertyValue("--selection-edge").trim(),
				subtle: style.getPropertyValue("--line-subtle").trim(),
			};
		});

	const activeEdges = await edges(active);
	const inactiveEdges = await edges(inactive);
	// One stroke, all four edges, and only its colour changed with the state.
	expect(activeEdges.stroke).toBe(activeEdges.accent);
	expect(inactiveEdges.stroke).toBe(inactiveEdges.subtle);
	expect(activeEdges.widths).toEqual(inactiveEdges.widths);
	expect(new Set(activeEdges.widths).size).toBe(1);

	await tabelo.source("markdown").click();
	await expect(active).not.toHaveAttribute("data-pane-active");
	await expect(inactive).toHaveAttribute("data-pane-active", "true");

	// The sticky grid corner is the pane's highest content layer. A pane clips
	// its content to the padding box, so no content layer can reach the border
	// the boundary is drawn on.
	await tabelo.cell(1, 1).click();
	await tabelo.grid().evaluate((grid) => {
		grid.scrollTo({ top: grid.scrollHeight, left: grid.scrollWidth });
	});
	await expect(active).toHaveCSS("overflow", "hidden");
});

test("multi-pane layouts and themes keep the active boundary on all four edges", async ({
	page,
	tabelo,
}) => {
	test.setTimeout(60_000);
	await tabelo.cell(1, 1).click();
	for (const colorScheme of ["dark", "light"] as const) {
		await page.emulateMedia({ colorScheme });
		for (const preset of layoutPresets) {
			await tabelo.chooseLayout(preset.id);
			const pane = tabelo.pane("grid");
			if (preset.id === "single") {
				await expect(pane).not.toHaveAttribute("data-pane-active");
				continue;
			}
			await expect(pane).toHaveAttribute("data-pane-active", "true");
			const edge = await pane.evaluate((element) => {
				const style = getComputedStyle(element);
				return {
					widths: [
						style.borderTopWidth,
						style.borderRightWidth,
						style.borderBottomWidth,
						style.borderLeftWidth,
					],
					stroke: style.getPropertyValue("--hairline-color").trim(),
					accent: style.getPropertyValue("--selection-edge").trim(),
				};
			});
			expect(new Set(edge.widths).size).toBe(1);
			expect(edge.widths[0]).not.toBe("0px");
			expect(edge.stroke).toBe(edge.accent);
		}
	}
});

test("the initial surface accepts the standard paste event directly", async ({
	page,
}) => {
	await page.goto("/");
	await expect(
		page.getByRole("heading", { name: copy.empty.title }),
	).toBeVisible();
	await page.evaluate(() => {
		const clipboardData = new DataTransfer();
		clipboardData.setData("text/plain", "Name\tRole\nInez\tDesigner");
		const event = new Event("paste", { bubbles: true, cancelable: true });
		Object.defineProperty(event, "clipboardData", { value: clipboardData });
		window.dispatchEvent(event);
	});

	await expect(
		page.getByRole("heading", { name: copy.empty.title }),
	).toHaveCount(0);
	await expect(page.getByRole("columnheader", { name: "Name" })).toBeVisible();
	await expect(page.getByRole("gridcell").first()).toContainText("Inez");
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

test("source focus belongs to the pane and selection follows the theme", async ({
	tabelo,
}) => {
	const pane = tabelo.pane("markdown");
	await tabelo.source("markdown").click();

	await expect(pane.locator(".cm-content")).toHaveCSS("outline-style", "none");
	await expect(pane.locator(".cm-cursor")).toHaveCSS(
		"border-left-style",
		"solid",
	);
	await expect(pane).toHaveAttribute("data-pane-active", "true");

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
		.locator('[data-slot="panel-body"]')
		.evaluate((element) => getComputedStyle(element).backgroundColor);
	const readOnlyBackground = await readOnlyPane
		.locator('[data-slot="panel-body"]')
		.evaluate((element) => getComputedStyle(element).backgroundColor);
	expect(readOnlyBackground).not.toBe(editableBackground);
});

test("a two-pane layout keeps the same compact hierarchy without extra framing", async ({
	tabelo,
}) => {
	await tabelo.chooseLayout("rows");
	const panes = tabelo.workspace.getByRole("region");
	await expect(panes).toHaveCount(2);
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

// Dark first, because dark is the interface this product is used in and the
// one a contrast regression has to be caught in soonest. Light follows in the
// same run, since neither theme may regress.
test("dark and light text and focus tokens meet their contrast floors", async ({
	page,
}) => {
	await page.goto("/");
	const backgrounds: string[] = [];
	for (const colorScheme of ["dark", "light"] as const) {
		await page.emulateMedia({ colorScheme });
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
		expect(
			await contrastBetween(page, "--control-outline", "--popover"),
		).toBeGreaterThanOrEqual(3);
		// The filled dialog confirm sits on --popover, not on the welcome
		// surface, so its contrast is not inherited from that use.
		expect(
			await contrastBetween(page, "--primary-foreground", "--primary"),
		).toBeGreaterThanOrEqual(4.5);
		expect(
			await contrastBetween(page, "--primary", "--popover"),
		).toBeGreaterThanOrEqual(3);
		expect(
			await contrastBetween(page, "--destructive", "--popover"),
		).toBeGreaterThanOrEqual(4.5);
		// A floating layer has to be identifiable against everything it can
		// cover, which is WCAG 1.4.11's 3:1 for non-text. Its own surface is
		// close in tone to the surfaces underneath by design, so the boundary is
		// what carries that job.
		for (const covered of [
			"--surface-floating",
			"--surface-panel",
			"--surface-app",
			"--surface-header",
		]) {
			expect(
				await contrastBetween(page, "--line-floating", covered),
			).toBeGreaterThanOrEqual(3);
		}
		// The warning colour is a graphical object: it draws the source
		// underline and the syntax tokens that carry no second cue of their own.
		expect(
			await contrastBetween(page, "--status-warning", "--surface-panel"),
		).toBeGreaterThanOrEqual(4.5);

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
			await expect(pane.locator("header")).toHaveCSS("overflow-x", "hidden");
		}
		expect(headingSizes.size).toBe(1);
	});
}

test("start actions keep the shared one-row priority order across widths", async ({
	page,
}) => {
	await page.goto("/");

	const buttons = [
		page.getByRole("button", { name: copy.empty.pasteHint }),
		page.getByRole("button", { name: copy.actions.importFile }),
		page.getByRole("button", { name: copy.empty.emptyAction }),
	];

	for (const button of buttons) {
		await expect(button).toBeVisible();
	}
	await expect(buttons[0]).toHaveAttribute("data-variant", "ghost");
	await expect(buttons[1]).toHaveAttribute("data-variant", "ghost");
	await expect(buttons[2]).toHaveAttribute("data-variant", "default");

	const group = buttons[0].locator("..");
	const assertActionPriority = async () => {
		await expect(group).toHaveCSS("flex-direction", "row");
		await expect(group).toHaveCSS("flex-wrap", "nowrap");
		await expect(group).toHaveCSS("justify-content", "flex-end");
		expect(
			await group.evaluate(
				(element) => Number.parseFloat(getComputedStyle(element).marginTop) > 0,
			),
		).toBe(true);
		await buttons[0].focus();
		await expect(buttons[0]).toBeFocused();
		await page.keyboard.press("Tab");
		await expect(buttons[1]).toBeFocused();
		await page.keyboard.press("Tab");
		await expect(buttons[2]).toBeFocused();
	};

	await page.setViewportSize({ width: 320, height: 568 });
	await assertActionPriority();

	await page.setViewportSize({ width: 800, height: 600 });
	await assertActionPriority();

	await page.setViewportSize({ width: 1200, height: 800 });
	await assertActionPriority();
});
