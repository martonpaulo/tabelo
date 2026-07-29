import type { Page } from "@playwright/test";
import { copy } from "@/ui/copy";
import { expect, test } from "./fixtures";

// Below the stacking width the 2x2 tiling is abandoned rather than squeezed.
// The defect this covers was subtle: the container became one column, but each
// pane still carried an inline grid area naming column two, and CSS obligingly
// created that column again — so two panes sat side by side on a phone.

const PRESETS = [
	"single",
	"columns",
	"rows",
	"left-split",
	"right-split",
	"top-split",
	"bottom-split",
	"quad",
] as const;

// 300 is below any real device on purpose. The interface barely fits at the
// next sampled width and not on every CI renderer, which draws the same labels
// wider. Sampling a width no platform can fit keeps "nothing spills sideways"
// honest on both.
const NARROW = [300, 320, 390, 600, 800, 899];

async function paneWidths(page: Page): Promise<number[]> {
	return page.evaluate(() =>
		[...document.querySelectorAll('main section[aria-label$="pane"]')].map(
			(pane) => Math.round(pane.getBoundingClientRect().width),
		),
	);
}

async function workspaceContentWidth(page: Page): Promise<number> {
	return page.evaluate(() => {
		const main = document.querySelector("main");
		if (!main) return 0;
		const style = getComputedStyle(main);
		return Math.round(
			main.clientWidth -
				Number.parseFloat(style.paddingLeft) -
				Number.parseFloat(style.paddingRight),
		);
	});
}

for (const preset of PRESETS) {
	test(`${copy.layouts[preset].label} stacks into one readable column below the compact breakpoint`, async ({
		page,
		tabelo,
	}) => {
		await tabelo.chooseLayout(preset);
		const expected = await tabelo.workspace.getByRole("region").count();

		for (const width of NARROW) {
			await page.setViewportSize({ width, height: 700 });

			// Every pane spans the workspace content box: none is a sliver beside
			// another. The app background remains visible as the designed inset.
			// Polled, because the media query and React's re-render land a frame
			// after the resize.
			await expect
				.poll(async () => Math.min(...(await paneWidths(page))), {
					message: `${preset} at viewport width ${width}`,
				})
				.toBeGreaterThanOrEqual((await workspaceContentWidth(page)) - 2);
			expect(
				await paneWidths(page),
				`${preset} at viewport width ${width}`,
			).toHaveLength(expected);
			// And nothing spills sideways. Polled for its own reason: after the
			// viewport shrinks, the document keeps the wider scroll area it had
			// for a frame, so reading it once can report the previous width.
			await expect
				.poll(
					() =>
						page.evaluate(
							() => document.documentElement.scrollWidth - window.innerWidth,
						),
					{ message: `${preset} at viewport width ${width}` },
				)
				.toBeLessThanOrEqual(0);
		}
	});
}

test("the tiling returns unchanged at the compact breakpoint", async ({
	page,
	tabelo,
}) => {
	await tabelo.chooseLayout("columns");
	await page.setViewportSize({ width: 390, height: 700 });
	await expect
		.poll(async () => Math.min(...(await paneWidths(page))))
		.toBeGreaterThanOrEqual((await workspaceContentWidth(page)) - 2);

	await page.setViewportSize({ width: 900, height: 700 });

	// Side by side again, each about half the width.
	await expect
		.poll(async () => Math.max(...(await paneWidths(page))))
		.toBeLessThan(600);
	expect(await paneWidths(page)).toHaveLength(2);
	await expect(
		page.getByRole("button", { name: copy.actions.openAppMenu }),
	).toBeVisible();
});

test("a stacked workspace exposes no resizer for an axis that no longer splits", async ({
	page,
	tabelo,
}) => {
	await tabelo.chooseLayout("quad");
	await expect(page.getByRole("separator")).toHaveCount(2);

	await page.setViewportSize({ width: 390, height: 700 });
	await expect(page.getByRole("separator")).toHaveCount(0);

	await page.setViewportSize({ width: 1280, height: 720 });
	await expect(page.getByRole("separator")).toHaveCount(2);
});

test("every stacked pane is reachable by scrolling and by keyboard", async ({
	page,
	tabelo,
}) => {
	await tabelo.chooseLayout("quad");
	await page.setViewportSize({ width: 390, height: 700 });

	// The workspace scrolls between panes rather than compressing them.
	await expect
		.poll(() =>
			page.evaluate(() => {
				const main = document.querySelector("main");
				return main ? main.scrollHeight > main.clientHeight : false;
			}),
		)
		.toBe(true);

	// Focusing scrolls the pane into view by itself, which is the behaviour that
	// matters: no pane is stranded below the fold and out of the tab order.
	for (const view of ["grid", "markdown", "html-preview", "csv"] as const) {
		const trigger = tabelo.paneMenuTrigger(view);
		await expect(trigger).toBeAttached();
		await trigger.focus();
		await expect(trigger).toBeFocused();
	}
});

test("the chosen preset and its ratios survive a trip through narrow", async ({
	page,
	tabelo,
}) => {
	await tabelo.chooseLayout("columns");
	// Move the split away from the middle so a reset would be obvious.
	const resizer = page.getByRole("separator", {
		name: copy.workspace.resizeColumns,
	});
	await resizer.focus();
	for (let press = 0; press < 5; press += 1) {
		await page.keyboard.press("ArrowLeft");
	}
	const ratio = await resizer.getAttribute("aria-valuenow");
	expect(Number(ratio)).toBeLessThan(50);

	await page.setViewportSize({ width: 390, height: 700 });
	await expect(page.getByRole("separator")).toHaveCount(0);
	await page.setViewportSize({ width: 1280, height: 720 });

	await expect(
		page.getByRole("button", { name: copy.actions.openAppMenu }),
	).toBeVisible();
	await expect(
		page.getByRole("separator", { name: copy.workspace.resizeColumns }),
	).toHaveAttribute("aria-valuenow", ratio ?? "");
});

test("a pending draft survives the responsive change", async ({
	page,
	tabelo,
}) => {
	const invalid = "| Name |\n| not a divider |\n| Inez |";
	const source = tabelo.source("markdown");
	const sourceText = () =>
		source.evaluate((element) =>
			Array.from(
				element.querySelectorAll(".cm-line"),
				(line) => line.textContent ?? "",
			).join("\n"),
		);

	// Use the editor's keyboard path here. Firefox can reduce Playwright's direct
	// contenteditable fill to a partial deletion under parallel test load, which
	// would make this test measure an unfinished setup action instead.
	await source.focus();
	await source.press("ControlOrMeta+a");
	await source.press("Backspace");
	await expect.poll(sourceText, { timeout: 10_000 }).toBe("");
	await page.keyboard.insertText(invalid);
	await expect.poll(sourceText, { timeout: 10_000 }).toBe(invalid);
	await expect(source).toHaveAttribute("aria-invalid", "true");

	await page.setViewportSize({ width: 390, height: 700 });

	// Stacking is presentation: it must not discard work in progress.
	await expect.poll(sourceText, { timeout: 10_000 }).toBe(invalid);
});

test("browser zoom at 200% still shows every view", async ({
	page,
	tabelo,
}) => {
	await tabelo.chooseLayout("quad");
	await page.setViewportSize({ width: 1280, height: 720 });
	await page.evaluate(() => {
		document.documentElement.style.fontSize = "200%";
	});

	await expect(tabelo.workspace.getByRole("region")).toHaveCount(4);
	await expect
		.poll(() =>
			page.evaluate(
				() => document.documentElement.scrollWidth - window.innerWidth,
			),
		)
		.toBeLessThanOrEqual(0);
});
