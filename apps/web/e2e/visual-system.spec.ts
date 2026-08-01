import type { Locator, Page } from "@playwright/test";
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

async function typographyOf(locator: Locator) {
	return locator.evaluate((element) => {
		const style = getComputedStyle(element);
		return {
			fontSize: Number.parseFloat(style.fontSize),
			lineHeight: Number.parseFloat(style.lineHeight),
		};
	});
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
	const menuBackground = await menu.evaluate(
		(element) => getComputedStyle(element).backgroundColor,
	);
	const paneBackground = await pane.evaluate(
		(element) => getComputedStyle(element).backgroundColor,
	);
	expect(menuBackground).not.toBe(paneBackground);
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

test("the app menu identity uses readable multi-line typography", async ({
	page,
	tabelo,
}) => {
	const menu = await tabelo.openAppMenu();
	const name = menu.getByText(copy.app.name, { exact: true });
	const tagline = menu.getByText(copy.app.tagline, { exact: true });

	const geometry = await Promise.all([
		name.boundingBox(),
		tagline.boundingBox(),
		typographyOf(name),
		typographyOf(tagline),
		page.evaluate(() =>
			Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
		),
	]);
	const [nameBox, taglineBox, nameType, taglineType, rootFontSize] = geometry;

	expect(nameBox).not.toBeNull();
	expect(taglineBox).not.toBeNull();
	expect(nameType.fontSize).toBeGreaterThanOrEqual(rootFontSize * 0.875);
	expect(taglineBox?.y).toBeGreaterThanOrEqual(
		(nameBox?.y ?? 0) + (nameBox?.height ?? 0),
	);
	expect(taglineType.lineHeight).toBeGreaterThan(taglineType.fontSize);
	expect(
		page.getByRole("menuitem").filter({ hasText: copy.app.name }),
	).toHaveCount(0);

	await page.keyboard.press("Escape");
	await expect(menu).toBeHidden();
	const trigger = page.getByRole("button", {
		name: copy.actions.openAppMenu,
	});
	await trigger.focus();
	await trigger.press("Enter");
	await expect(menu).toBeVisible();
	await expect(
		menu.getByRole("menuitem", { name: copy.actions.newTable }),
	).toBeFocused();
});

test("single-line menu labels keep their compact shared treatment", async ({
	page,
	tabelo,
}) => {
	const rootFontSize = await page.evaluate(() =>
		Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
	);
	const expectCompactLabel = async (label: Locator) => {
		const type = await typographyOf(label);
		expect(type.fontSize).toBeCloseTo(rootFontSize * 0.75, 5);
		expect(type.lineHeight).toBeCloseTo(type.fontSize, 5);
	};

	const layoutMenu = await tabelo.openLayoutMenu();
	await expectCompactLabel(
		layoutMenu.getByText(copy.workspace.layoutHint, { exact: true }),
	);
	await page.keyboard.press("Escape");
	await expect(layoutMenu).toBeHidden();
	await page.keyboard.press("Escape");

	const viewMenu = await tabelo.openPaneViewMenu("markdown");
	await expectCompactLabel(
		viewMenu.getByText(copy.workspace.changeView, { exact: true }),
	);
	await page.keyboard.press("Escape");
	await expect(viewMenu).toBeHidden();

	const paneMenu = await tabelo.openPaneMenu("markdown");
	const zoomLabel = paneMenu.getByText(copy.workspace.zoom(100), {
		exact: true,
	});
	await expectCompactLabel(zoomLabel);
	await expect(zoomLabel).toHaveAttribute("aria-live", "polite");
	await page.keyboard.press("Escape");
	await expect(paneMenu).toBeHidden();

	await tabelo
		.grid()
		.getByRole("button", {
			name: new RegExp(`^${copy.actions.columnActions}:`),
		})
		.first()
		.click();
	const columnMenu = page.getByRole("menu", {
		name: new RegExp(`^${copy.actions.columnActions}:`),
	});
	await expectCompactLabel(
		columnMenu.locator('[data-slot="dropdown-menu-label"]').first(),
	);
	await expectCompactLabel(
		columnMenu.getByText(copy.actions.alignment, { exact: true }),
	);
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

	await tabelo.choosePaneView("markdown", "html-preview");
	await expect(tabelo.pane("html-preview").locator("table")).toHaveCSS(
		"user-select",
		"text",
	);
});

test("the active pane boundary stays above its content without reflow", async ({
	page,
	tabelo,
}) => {
	await tabelo.cell(1, 1).click();
	const active = tabelo.pane("grid");
	const inactive = tabelo.pane("markdown");
	const indicator = active.locator(".tabelo-active-pane-indicator");
	await expect(indicator).toHaveCount(1);
	await expect(active).toHaveAttribute("aria-current", "true");
	await expect(active).toHaveAccessibleName(
		copy.a11y.pane(copy.views.grid.label),
	);
	await expect(inactive.locator(".tabelo-active-pane-indicator")).toHaveCount(
		0,
	);
	await expect(inactive).not.toHaveAttribute("aria-current");
	await expect(inactive).toHaveAccessibleName(
		copy.a11y.pane(copy.views.markdown.label),
	);

	const activeBox = await active.boundingBox();
	const indicatorBox = await indicator.boundingBox();
	expect(indicatorBox).toEqual(activeBox);

	const styles = await indicator.evaluate((element) => {
		const probe = document.createElement("span");
		probe.style.color = "var(--selection-edge)";
		probe.style.borderTop = "var(--pane-active-edge) solid";
		element.append(probe);
		const result = {
			borderWidths: [
				getComputedStyle(element).borderTopWidth,
				getComputedStyle(element).borderRightWidth,
				getComputedStyle(element).borderBottomWidth,
				getComputedStyle(element).borderLeftWidth,
			],
			borderColor: getComputedStyle(element).borderTopColor,
			position: getComputedStyle(element).position,
			pointerEvents: getComputedStyle(element).pointerEvents,
			zIndex: Number(getComputedStyle(element).zIndex),
			edgeToken: getComputedStyle(probe).borderTopWidth,
			token: getComputedStyle(probe).color,
		};
		probe.remove();
		return result;
	});
	expect(new Set(styles.borderWidths)).toEqual(new Set([styles.edgeToken]));
	expect(styles.borderColor).toBe(styles.token);
	expect(styles.position).toBe("absolute");
	expect(styles.pointerEvents).toBe("none");

	await tabelo.source("markdown").click();
	await expect(indicator).toHaveCount(0);
	await expect(inactive.locator(".tabelo-active-pane-indicator")).toHaveCount(
		1,
	);
	await expect(active).not.toHaveAttribute("aria-current");
	await expect(inactive).toHaveAttribute("aria-current", "true");
	expect(await active.boundingBox()).toEqual(activeBox);

	// The sticky grid corner is the pane's highest content layer. Scrolling it
	// under the overlay must not let it overtake the active boundary.
	await tabelo.cell(1, 1).click();
	await tabelo.grid().evaluate((grid) => {
		grid.scrollTo({ top: grid.scrollHeight, left: grid.scrollWidth });
	});
	const stickyCornerZIndex = await tabelo
		.grid()
		.locator("thead tr > th")
		.first()
		.evaluate((element) => Number(getComputedStyle(element).zIndex));
	expect(styles.zIndex).toBeGreaterThan(stickyCornerZIndex);

	await page.emulateMedia({ colorScheme: "dark" });
	await expect(indicator).toHaveCSS("border-top-color", "rgb(77, 166, 255)");
});

test("every layout and theme keeps the active boundary on all four edges", async ({
	page,
	tabelo,
}) => {
	test.setTimeout(60_000);
	await tabelo.cell(1, 1).click();
	for (const colorScheme of ["light", "dark"] as const) {
		await page.emulateMedia({ colorScheme });
		for (const preset of layoutPresets) {
			await tabelo.chooseLayout(preset.id);
			const pane = tabelo.pane("grid");
			const indicator = pane.locator(".tabelo-active-pane-indicator");
			const [paneBox, indicatorBox] = await Promise.all([
				pane.boundingBox(),
				indicator.boundingBox(),
			]);
			expect(indicatorBox).toEqual(paneBox);
			const widths = await indicator.evaluate((element) => {
				const style = getComputedStyle(element);
				return [
					style.borderTopWidth,
					style.borderRightWidth,
					style.borderBottomWidth,
					style.borderLeftWidth,
				];
			});
			expect(new Set(widths).size).toBe(1);
			expect(widths[0]).not.toBe("0px");
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
	await expect(pane.locator(".tabelo-active-pane-indicator")).toHaveCount(1);

	const assertEditorGeometry = async () => {
		await pane.evaluate(
			() =>
				new Promise<void>((resolve) => {
					requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
				}),
		);
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
		const logicalLineHeight = line?.height ?? 1;
		const visualLineHeight = await pane
			.locator(".cm-line")
			.first()
			.evaluate((element) =>
				Number.parseFloat(getComputedStyle(element).lineHeight),
			);
		expect(
			Math.abs((line?.y ?? 0) - (number?.y ?? 0)) / visualLineHeight,
		).toBeLessThan(0.1);
		expect((number?.height ?? 0) / logicalLineHeight).toBeGreaterThan(0.95);
		expect((number?.height ?? 0) / logicalLineHeight).toBeLessThan(1.05);
		// Caret remains font-sized (1.25rem) while the line box (2rem) is looser,
		// so it covers ~62.5% of the visual line and sits vertically centered.
		expect((cursor?.height ?? 0) / visualLineHeight).toBeGreaterThan(0.5);
		expect((cursor?.height ?? 0) / visualLineHeight).toBeLessThanOrEqual(1.05);
		const cursorLineOffset =
			((cursor?.y ?? 0) - (activeLine?.y ?? 0)) % visualLineHeight;
		expect(
			Math.min(
				Math.abs(cursorLineOffset),
				Math.abs(visualLineHeight - cursorLineOffset),
			) / visualLineHeight,
		).toBeLessThan(0.35);
	};

	await assertEditorGeometry();
	for (let step = 0; step < 5; step += 1) {
		await tabelo.page.keyboard.press("ControlOrMeta+-");
	}
	await assertEditorGeometry();
	for (let step = 0; step < 15; step += 1) {
		await tabelo.page.keyboard.press("ControlOrMeta+=");
	}
	await assertEditorGeometry();
	await tabelo.page.keyboard.press("ControlOrMeta+0");

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

test("unchecked menu choices keep a visible outline and clear label spacing", async ({
	page,
	tabelo,
}) => {
	await expect(tabelo.workspace).toBeVisible();
	for (const dark of [false, true]) {
		await page.emulateMedia({ colorScheme: dark ? "dark" : "light" });
		const menu = await tabelo.openLayoutMenu();
		const option = menu.getByRole("menuitemradio", {
			name: copy.layouts.single.label,
		});
		await expect(option).not.toBeChecked();
		const indicator = option.locator(
			'[data-slot="dropdown-menu-radio-item-indicator"]',
		);
		await expect(indicator).toBeVisible();

		const colors = await indicator.evaluate((element) => {
			const styles = getComputedStyle(document.documentElement);
			return {
				foreground: getComputedStyle(element).borderTopColor,
				background: styles.getPropertyValue("--popover").trim(),
			};
		});
		expect(
			await contrastBetweenColors(page, colors.foreground, colors.background),
		).toBeGreaterThanOrEqual(3);

		const geometry = await option.evaluate((element) => {
			const indicator = element.querySelector(
				'[data-slot="dropdown-menu-radio-item-indicator"]',
			);
			if (!(indicator instanceof HTMLElement)) {
				throw new Error("Menu choice indicator is unavailable.");
			}
			return {
				paddingRight: Number.parseFloat(getComputedStyle(element).paddingRight),
				indicatorWidth: indicator.getBoundingClientRect().width,
			};
		});
		expect(geometry.paddingRight).toBeGreaterThanOrEqual(
			geometry.indicatorWidth * 2,
		);

		await page.keyboard.press("Escape");
		await page.keyboard.press("Escape");
		await expect(menu).toHaveCount(0);
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

test("empty state actions share an alignment, avoid unpredictable wrapping, and preserve visual tab order across widths", async ({
	page,
}) => {
	await page.goto("/");

	const buttons = [
		page.getByRole("button", { name: copy.empty.emptyAction }),
		page.getByRole("button", { name: copy.empty.pasteHint }),
		page.getByRole("button", { name: copy.actions.importFile }),
	];

	for (const button of buttons) {
		await expect(button).toBeVisible();
	}

	const assertGeometryAndFocus = async (orientation: "row" | "column") => {
		const boxes = await Promise.all(buttons.map((b) => b.boundingBox()));

		for (let i = 1; i < boxes.length; i++) {
			const prev = boxes[i - 1];
			const curr = boxes[i];
			expect(prev).toBeTruthy();
			expect(curr).toBeTruthy();
			if (!prev || !curr) return;

			if (orientation === "column") {
				// Same left edge
				expect(curr.x).toBeCloseTo(prev.x, 1);
				// One below another
				expect(curr.y).toBeGreaterThan(prev.y + prev.height - 1);
			} else {
				// Same top edge
				expect(curr.y).toBeCloseTo(prev.y, 1);
				// One to the right of another
				expect(curr.x).toBeGreaterThan(prev.x + prev.width - 1);
			}
		}

		// Check Tab order matches visual order
		await page.keyboard.press("Shift+Tab"); // reset focus out of the group just in case
		await page.keyboard.press("Shift+Tab");
		await page.keyboard.press("Shift+Tab");
		await page.keyboard.press("Shift+Tab");
		await buttons[0].focus(); // Focus first button manually to start sequence predictably
		await expect(buttons[0]).toBeFocused();
		await page.keyboard.press("Tab");
		await expect(buttons[1]).toBeFocused();
		await page.keyboard.press("Tab");
		await expect(buttons[2]).toBeFocused();
	};

	// Test at narrow width (should be column)
	await page.setViewportSize({ width: 320, height: 568 });
	await assertGeometryAndFocus("column");

	// Test at medium width (should be row)
	await page.setViewportSize({ width: 800, height: 600 });
	await assertGeometryAndFocus("row");

	// Test at wide width (should be row)
	await page.setViewportSize({ width: 1200, height: 800 });
	await assertGeometryAndFocus("row");
});
