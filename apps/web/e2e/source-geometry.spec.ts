import { expect, test } from "./fixtures";

// Line one always aligns, so a check that looks only at the top of the document
// cannot see gutter drift: the error appears further down and accumulates. The
// caret and line-one metrics are already covered in visual-system.spec.ts; this
// covers every line of a document long enough for accumulation to show, at
// several zoom rungs, because the drift is invisible at the default zoom.
const lineCount = 32;

const source = [
	"| Number |",
	"| ---: |",
	...Array.from({ length: lineCount - 2 }, (_, index) => `| ${index + 1} |`),
].join("\n");

// Tall enough that all 32 lines stay inside CodeMirror's viewport even at 200%,
// so the assertion measures the whole document rather than the first screenful.
test.use({ viewport: { width: 1280, height: 1800 } });

test("every line number stays aligned with its line across pane zoom levels", async ({
	tabelo,
}) => {
	const pane = tabelo.pane("markdown");
	await tabelo.source("markdown").fill(source);
	await pane
		.locator(".cm-line")
		.nth(lineCount - 1)
		.click();

	const measure = async () =>
		await pane.evaluate((root) => {
			// Scoped to this pane: other panes host their own CodeMirror instances,
			// and a document-wide query would mix their geometry into the result.
			const lines = [...root.querySelectorAll<HTMLElement>(".cm-line")];
			// The line-number gutter carries a zero-height spacer used to reserve
			// width, which has no line to align with.
			const numbers = [
				...root.querySelectorAll<HTMLElement>(
					".cm-lineNumbers .cm-gutterElement",
				),
			].filter(
				(element) =>
					/^\d+$/.test(element.textContent ?? "") &&
					element.getBoundingClientRect().height > 0,
			);

			const lineHeight = lines[0]
				? Number.parseFloat(getComputedStyle(lines[0]).lineHeight)
				: Number.NaN;

			let worst = 0;
			let measured = 0;
			for (const number of numbers) {
				const line = lines[Number(number.textContent) - 1];
				// Mid-remeasure a number can briefly outrun its line. `pairs` below is
				// what holds the assertion to the whole document.
				if (!line) continue;
				measured += 1;
				const offset = Math.abs(
					line.getBoundingClientRect().top - number.getBoundingClientRect().top,
				);
				if (offset > worst) worst = offset;
			}

			const activeLine = root.querySelector<HTMLElement>(".cm-activeLine");
			const activeGutter = root.querySelector<HTMLElement>(
				".cm-activeLineGutter",
			);

			return {
				pairs: measured,
				// Offsets are reported against the line's own rhythm rather than as a
				// pixel budget, so sub-pixel rounding at a fractional font size cannot
				// decide the result.
				worst: worst / lineHeight,
				// The active-line gutter highlight shares this geometry, so it is
				// displaced by exactly the same defect.
				active:
					activeLine && activeGutter
						? Math.abs(
								activeLine.getBoundingClientRect().top -
									activeGutter.getBoundingClientRect().top,
							) / lineHeight
						: Number.NaN,
				activeNumber: activeGutter?.textContent ?? "",
			};
		});

	// Polled rather than read once. CodeMirror remeasures asynchronously after a
	// zoom step, and this contract is about geometry that stays wrong: the frame
	// it takes to settle is #58. Polling also keeps the assertion honest on a
	// loaded machine, where a fixed frame budget only measures scheduler luck.
	const assertAlignment = async () => {
		await expect.poll(async () => (await measure()).worst).toBeLessThan(0.1);
		const settled = await measure();
		expect(settled.pairs).toBe(lineCount);
		expect(settled.active).toBeLessThan(0.1);
		expect(settled.activeNumber).toBe(String(lineCount));
	};

	// The rungs matter more than the count: 100% is where the defect hides, and
	// the fractional steps are where it showed.
	await assertAlignment();
	await tabelo.page.keyboard.press("ControlOrMeta+=");
	await assertAlignment();
	await tabelo.page.keyboard.press("ControlOrMeta+=");
	await tabelo.page.keyboard.press("ControlOrMeta+=");
	await assertAlignment();
	await tabelo.page.keyboard.press("ControlOrMeta+0");
	for (let step = 0; step < 5; step += 1) {
		await tabelo.page.keyboard.press("ControlOrMeta+-");
	}
	await assertAlignment();
	for (let step = 0; step < 15; step += 1) {
		await tabelo.page.keyboard.press("ControlOrMeta+=");
	}
	await assertAlignment();
});

// The first source line is the table's header row. A gap above it would
// separate table data from the pane, which is what this measures away.
// Positions are compared rather than pinned, so the assertion survives a change
// of scale.
test("the first source line meets the pane header without a gap", async ({
	tabelo,
}) => {
	const pane = tabelo.pane("markdown");
	const header = pane.locator("header");
	const firstLine = pane.locator(".cm-line").first();

	await expect(firstLine).toHaveClass(/cm-tableHeaderLine/);

	const headerBox = await header.boundingBox();
	const lineBox = await firstLine.boundingBox();
	expect(headerBox).not.toBeNull();
	expect(lineBox).not.toBeNull();

	const gap =
		(lineBox?.y ?? 0) - ((headerBox?.y ?? 0) + (headerBox?.height ?? 0));
	expect(gap).toBeLessThanOrEqual(0.5);
	expect(gap).toBeGreaterThanOrEqual(-0.5);

	// The line number stayed with its line, rather than the content sliding out
	// from under the gutter.
	const number = await pane
		.locator(".cm-lineNumbers .cm-gutterElement")
		.filter({ hasText: /^1$/ })
		.boundingBox();
	expect(Math.abs((number?.y ?? 0) - (lineBox?.y ?? 0))).toBeLessThan(1);

	// Clicking below the last line still focuses the editor, which is what the
	// bottom padding is for and why it was kept.
	const content = await pane.locator(".cm-content").boundingBox();
	await tabelo.page.mouse.click(
		(content?.x ?? 0) + 20,
		// Stay clear of the pane's bottom-edge add control while still clicking
		// well below the final source line.
		(content?.y ?? 0) + (content?.height ?? 0) - 32,
	);
	await expect(tabelo.source("markdown")).toBeFocused();
});
