import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

// Below the stacking width the 2x2 tiling is abandoned rather than squeezed.
// The defect this covers was subtle: the container became one column, but each
// pane still carried an inline grid area naming column two, and CSS obligingly
// created that column again — so two panes sat side by side on a phone.

const PRESETS = [
	"Single",
	"Two columns",
	"Two rows",
	"Split left",
	"Split right",
	"Split top",
	"Split bottom",
	"Four panes",
] as const;

// 300 is below any real device on purpose. The app header fits 320px with a
// few pixels to spare on a Mac and not at all on the CI runner, which renders
// the same labels wider, so a check pinned to 320 passed locally while failing
// there. Sampling a width no platform can fit keeps "nothing spills sideways"
// honest on both.
const NARROW = [300, 320, 390, 600, 800, 899];

async function paneWidths(page: Page): Promise<number[]> {
	return page.evaluate(() =>
		[...document.querySelectorAll('main section[aria-label$="pane"]')].map(
			(pane) => Math.round(pane.getBoundingClientRect().width),
		),
	);
}

for (const preset of PRESETS) {
	test(`${preset} stacks into one readable column below 900px`, async ({
		page,
		tabelo,
	}) => {
		await tabelo.chooseLayout(preset);
		const expected = await tabelo.workspace.getByRole("region").count();

		for (const width of NARROW) {
			await page.setViewportSize({ width, height: 700 });

			// Every pane spans the viewport: none is a sliver beside another.
			// Polled, because the media query and React's re-render land a frame
			// after the resize.
			await expect
				.poll(async () => Math.min(...(await paneWidths(page))), {
					message: `${preset} at ${width}px`,
				})
				.toBeGreaterThanOrEqual(width - 2);
			expect(await paneWidths(page), `${preset} at ${width}px`).toHaveLength(
				expected,
			);
			// And nothing spills sideways. Polled for its own reason: after the
			// viewport shrinks, the document keeps the wider scroll area it had
			// for a frame, so reading it once can report the previous width.
			await expect
				.poll(
					() =>
						page.evaluate(
							() => document.documentElement.scrollWidth - window.innerWidth,
						),
					{ message: `${preset} at ${width}px` },
				)
				.toBeLessThanOrEqual(0);
		}
	});
}

test("the tiling returns unchanged at 900px", async ({ page, tabelo }) => {
	await tabelo.chooseLayout("Two columns");
	await page.setViewportSize({ width: 390, height: 700 });
	await expect
		.poll(async () => Math.min(...(await paneWidths(page))))
		.toBeGreaterThanOrEqual(388);

	await page.setViewportSize({ width: 900, height: 700 });

	// Side by side again, each about half the width.
	await expect
		.poll(async () => Math.max(...(await paneWidths(page))))
		.toBeLessThan(600);
	expect(await paneWidths(page)).toHaveLength(2);
	await expect(page.getByRole("button", { name: /^Layout:/ })).toContainText(
		"Layout",
	);
});

test("a stacked workspace exposes no resizer for an axis that no longer splits", async ({
	page,
	tabelo,
}) => {
	await tabelo.chooseLayout("Four panes");
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
	await tabelo.chooseLayout("Four panes");
	await page.setViewportSize({ width: 390, height: 700 });

	// The workspace scrolls between panes rather than compressing them.
	const scrollable = await page.evaluate(() => {
		const main = document.querySelector("main");
		return main ? main.scrollHeight > main.clientHeight : false;
	});
	expect(scrollable).toBe(true);

	// Focusing scrolls the pane into view by itself, which is the behaviour that
	// matters: no pane is stranded below the fold and out of the tab order.
	for (const view of ["Visual table", "Markdown", "Rendered preview", "CSV"]) {
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
	await tabelo.chooseLayout("Two columns");
	// Move the split away from the middle so a reset would be obvious.
	const resizer = page.getByRole("separator", { name: "Resize columns" });
	await resizer.focus();
	for (let press = 0; press < 5; press += 1) {
		await page.keyboard.press("ArrowLeft");
	}
	const ratio = await resizer.getAttribute("aria-valuenow");
	expect(Number(ratio)).toBeLessThan(50);

	await page.setViewportSize({ width: 390, height: 700 });
	await expect(page.getByRole("separator")).toHaveCount(0);
	await page.setViewportSize({ width: 1280, height: 720 });

	await expect(page.getByRole("button", { name: /^Layout:/ })).toContainText(
		"Layout",
	);
	await expect(
		page.getByRole("separator", { name: "Resize columns" }),
	).toHaveAttribute("aria-valuenow", ratio ?? "");
});

test("a pending draft survives the responsive change", async ({
	page,
	tabelo,
}) => {
	const invalid = "| Name |\n| not a divider |\n| Ana |";
	await tabelo.source("Markdown").fill(invalid);
	await expect(tabelo.source("Markdown")).toHaveAttribute(
		"aria-invalid",
		"true",
	);

	await page.setViewportSize({ width: 390, height: 700 });

	// Stacking is presentation: it must not discard work in progress.
	await expect
		.poll(() =>
			tabelo
				.source("Markdown")
				.evaluate((element) =>
					Array.from(
						element.querySelectorAll(".cm-line"),
						(line) => line.textContent ?? "",
					).join("\n"),
				),
		)
		.toBe(invalid);
});

test("browser zoom at 200% still shows every view", async ({
	page,
	tabelo,
}) => {
	await tabelo.chooseLayout("Four panes");
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
