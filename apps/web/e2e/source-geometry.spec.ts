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
