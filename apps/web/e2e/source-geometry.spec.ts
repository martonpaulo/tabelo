import { copy } from "@/copy/copy";
import { expect, test } from "./fixtures";

const longValue = Array.from(
	{ length: 7 },
	() =>
		"It comes from a real book by a Roman writer named Cicero. The words are mixed up and not real Latin",
).join(" ");
const wideRows = ["Column1", longValue, longValue].join("\n");

test("wrapped source line numbers belong to the first visual line before focus", async ({
	tabelo,
}) => {
	await tabelo.paste(wideRows);
	await tabelo.choosePaneView("markdown", "tsv");
	const menu = await tabelo.openPaneMenu("tsv");
	await menu
		.getByRole("menuitemcheckbox", { name: copy.workspace.wrapSource })
		.click();
	await tabelo.paneMenuTrigger("tsv").click();
	await tabelo.chooseLayout("quad");
	const source = tabelo.source("tsv");
	await expect(source).toBeVisible();
	await expect(source).not.toBeFocused();

	const numbersStartOnTheirLogicalLine = () =>
		tabelo.pane("tsv").evaluate((pane) => {
			const editor = pane.querySelector(".cm-editor");
			const numbers = editor
				? [
						...editor.querySelectorAll<HTMLElement>(
							".cm-lineNumbers .cm-gutterElement",
						),
					].filter(
						(element) => getComputedStyle(element).visibility !== "hidden",
					)
				: [];
			const lines = editor
				? [...editor.querySelectorAll<HTMLElement>(".cm-content .cm-line")]
				: [];
			const scroller = editor?.querySelector(".cm-scroller");
			const firstVisualLineHeight = scroller
				? Number.parseFloat(getComputedStyle(scroller).lineHeight)
				: 0;

			return (
				numbers.length === lines.length &&
				numbers.length > 1 &&
				numbers.every((number, index) => {
					const text = number.firstChild;
					const line = lines[index];
					if (!text || !line || firstVisualLineHeight <= 0) return false;
					const range = document.createRange();
					range.selectNodeContents(text);
					const glyph = range.getBoundingClientRect();
					const logicalLine = line.getBoundingClientRect();
					return (
						glyph.top >= logicalLine.top &&
						glyph.bottom <= logicalLine.top + firstVisualLineHeight
					);
				})
			);
		});

	// This is an ownership assertion, not an exact-size assertion: every number
	// must occupy the first visual line of the logical line it identifies.
	expect(await numbersStartOnTheirLogicalLine()).toBe(true);

	await source.focus();
	expect(await numbersStartOnTheirLogicalLine()).toBe(true);
});

const peopleTable = [
	"| name | city |",
	"| --- | --- |",
	"| Ingrid | Rio |",
	"| Paulo | Madrid |",
	"| Mabel | Buenos Aires |",
	"| Felix | Mexico City |",
	"| Amora | Tokyo |",
].join("\n");

interface ZoomSample {
	readonly fontSize: number;
	readonly gutterWidth: number;
	readonly onTheirLines: boolean;
}

// The scale reaches the text, the gutter, and the caret through one CSS
// variable, but where CodeMirror *places* a line number or the caret comes from
// metrics it measured and cached, and a zoom step changes those from outside
// anything it can observe. So the assertion is that the two agree: after the
// step, every number still sits inside the line it identifies and the caret
// inside the line it is on, at the larger size.
//
// Each sample reads the scale and the placement together, from inside an
// animation frame, and the first sample showing the new scale is the one
// asserted on. Reading at frame time is what makes this a statement about what
// the user sees: CodeMirror remeasures in the same frame the new scale is
// painted in, and between a style change and that frame there is a moment when
// the two disagree in the DOM and nothing has been drawn yet. A sample taken
// outside a frame would catch that moment and call a correct editor broken.
test("a zoom step carries the line numbers and the caret onto the resized lines", async ({
	tabelo,
}) => {
	const source = tabelo.source("markdown");
	await source.fill(peopleTable);
	await expect(tabelo.cell(5, 1)).toHaveText("Amora");

	// The caret goes to the last line, where a stale line height has had every
	// row above it to accumulate into an offset worth seeing.
	await source.focus();
	await source.press("ControlOrMeta+End");
	await expect(tabelo.pane("markdown").locator(".cm-activeLine")).toHaveCount(
		1,
	);

	const pane = tabelo.pane("markdown");
	const probe = (): Promise<ZoomSample> =>
		pane.evaluate((node) => {
			const read = () => {
				const editor = node.querySelector(".cm-editor");
				const lines = editor
					? [...editor.querySelectorAll<HTMLElement>(".cm-content .cm-line")]
					: [];
				const numbers = editor
					? [
							...editor.querySelectorAll<HTMLElement>(
								".cm-lineNumbers .cm-gutterElement",
							),
						].filter(
							(element) => getComputedStyle(element).visibility !== "hidden",
						)
					: [];
				const content = editor?.querySelector(".cm-content");
				const caret = editor?.querySelector(".cm-cursor-primary");
				const activeLine = editor?.querySelector(".cm-activeLine");

				const encloses = (outer: DOMRect, inner: DOMRect) =>
					inner.top >= outer.top && inner.bottom <= outer.bottom;

				return {
					fontSize: content
						? Number.parseFloat(getComputedStyle(content).fontSize)
						: 0,
					gutterWidth: numbers[0]?.getBoundingClientRect().width ?? 0,
					// Enclosure rather than size: what is being checked is that measured
					// placement and styled scale still describe the same rows.
					onTheirLines:
						numbers.length === lines.length &&
						caret !== null &&
						caret !== undefined &&
						activeLine !== null &&
						activeLine !== undefined &&
						encloses(
							activeLine.getBoundingClientRect(),
							caret.getBoundingClientRect(),
						) &&
						numbers.every((number, index) => {
							const line = lines[index];
							return (
								line !== undefined &&
								encloses(
									line.getBoundingClientRect(),
									number.getBoundingClientRect(),
								)
							);
						}),
				};
			};
			return new Promise<ZoomSample>((resolve) => {
				requestAnimationFrame(() => resolve(read()));
			});
		});

	const before = await probe();
	expect(before.onTheirLines).toBe(true);

	// The keyboard shortcut rather than the pane menu: opening a menu takes the
	// focus, and an unfocused editor draws no caret to check.
	await source.press("ControlOrMeta+Alt+=");

	let resized = before;
	const deadline = Date.now() + 5000;
	while (resized.fontSize === before.fontSize && Date.now() < deadline) {
		resized = await probe();
	}

	// Direction only: the step has to have actually reached the text and the
	// gutter, or the placement check below proves nothing.
	expect(resized.fontSize).toBeGreaterThan(before.fontSize);
	expect(resized.gutterWidth).toBeGreaterThan(before.gutterWidth);
	expect(resized.onTheirLines).toBe(true);
});

// The band between the gutter and the first character used to belong to
// `.cm-line`'s left padding, which `drawSelection` never paints over: a
// selected line was highlighted from its first character while the active line
// beside it was highlighted from the gutter. Containment rather than a
// distance, for the same reason as the checks above: what matters is that the
// highlight starts no later than the line it covers, not how wide either is.
test("a selected line is highlighted from the same edge the line starts at", async ({
	tabelo,
}) => {
	const source = tabelo.source("markdown");
	await source.fill(peopleTable);
	await expect(tabelo.cell(5, 1)).toHaveText("Amora");

	await source.focus();
	await source.press("ControlOrMeta+A");

	const highlightReachesTheLineStart = () =>
		tabelo.pane("markdown").evaluate((node) => {
			const editor = node.querySelector(".cm-editor");
			const line = editor?.querySelector(".cm-content .cm-line");
			const highlights = editor
				? [...editor.querySelectorAll(".cm-selectionBackground")]
				: [];
			if (!line || highlights.length === 0) return false;
			const start = line.getBoundingClientRect().left;
			return highlights.every(
				(highlight) => highlight.getBoundingClientRect().left <= start,
			);
		});

	await expect.poll(highlightReachesTheLineStart).toBe(true);
});
