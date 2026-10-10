import { copy } from "@/copy/copy";
import { samplePeopleCsv, samplePerson } from "@/core/sample-data";
import { expect, test } from "./fixtures";
import { outsidePinnedHeader } from "./helpers";

const markdownTable = [
	"| name | city |",
	"| --- | --- |",
	"| Ingrid | Rio |",
	"| Paulo | Madrid |",
].join("\n");

// Changing a pane's view must reconfigure the editor rather than rebuild it:
// a rebuild paints an empty editor for a frame, which §7 forbids, and takes the
// caret and the local undo history with it.
test("changing a pane's view keeps the same editor rather than rebuilding it", async ({
	tabelo,
}) => {
	const markdown = tabelo.source("markdown");
	await markdown.fill(markdownTable);
	await expect(tabelo.cell(1, 1)).toHaveText("Ingrid");

	// An expando on the live editor element. It means nothing to the product and
	// lasts exactly as long as this CodeMirror instance does, so finding it again
	// afterwards is the assertion that nothing was torn down in between.
	await tabelo
		.pane("markdown")
		.locator(`.cm-editor${outsidePinnedHeader}`)
		.evaluate((element: HTMLElement) => {
			element.dataset.editorInstance = "before-view-change";
		});

	await tabelo.choosePaneView("markdown", "csv");

	const csvPane = tabelo.pane("csv");
	await expect(
		csvPane.locator(`.cm-editor${outsidePinnedHeader}`),
	).toHaveAttribute("data-editor-instance", "before-view-change");
	// The surviving editor still follows the view: it serves the new format's
	// text and answers to the new format's accessible name.
	await expect(tabelo.source("csv")).toBeVisible();
	await expect(
		csvPane.locator(`.cm-line${outsidePinnedHeader}`).first(),
	).toHaveText("name,city");
});

// The one thing the rebuild was accidentally providing. The text now means
// something else, so undo has to stop at the switch and fall through to the
// document timeline from there: see docs/adr/0003.
test("a view change resets the editor's local history and hands undo to the document", async ({
	tabelo,
}) => {
	const markdown = tabelo.source("markdown");
	await markdown.fill(markdownTable);
	await expect(tabelo.cell(1, 1)).toHaveText("Ingrid");

	await tabelo.choosePaneView("markdown", "csv");
	const csv = tabelo.source("csv");
	await expect(csv).toBeVisible();

	await csv.focus();
	await csv.press("ControlOrMeta+z");

	// Nothing local is left to undo, so the step falls through to the document
	// timeline and the table returns to the empty one this test started from.
	// Keystrokes from the pane's previous view still being here would undo those
	// instead, feeding Markdown back into a pane that now reads CSV.
	await expect(tabelo.cell(1, 1)).toHaveText("");
	await expect(tabelo.header(1)).not.toHaveText("name");
});

// Both editors in one workspace, so the surviving instance is confirmed to be
// this pane's rather than any editor on screen.
test("a view change in one pane leaves the other pane's editor alone", async ({
	tabelo,
}) => {
	await tabelo.paste(samplePeopleCsv(2));
	await tabelo.dismissNotices();
	await tabelo.showInSourcePane("markdown");
	await tabelo.addViewBySplit("markdown", "bottom", "csv");

	const stamp = (view: "markdown" | "csv", value: string) =>
		tabelo
			.pane(view)
			.locator(`.cm-editor${outsidePinnedHeader}`)
			.evaluate((element: HTMLElement, mark) => {
				element.dataset.editorInstance = mark;
			}, value);
	await stamp("markdown", "markdown-editor");
	await stamp("csv", "csv-editor");

	await tabelo.choosePaneView("csv", "tsv");

	await expect(
		tabelo.pane("markdown").locator(`.cm-editor${outsidePinnedHeader}`),
	).toHaveAttribute("data-editor-instance", "markdown-editor");
	await expect(
		tabelo.pane("tsv").locator(`.cm-editor${outsidePinnedHeader}`),
	).toHaveAttribute("data-editor-instance", "csv-editor");
});

test("source focus stays visible and reduced motion keeps the cursor solid", async ({
	page,
	tabelo,
}) => {
	await page.emulateMedia({ reducedMotion: "no-preference" });

	const pane = tabelo.pane("markdown");
	const editor = tabelo.source("markdown");
	const cursorLayer = pane.locator(".cm-tabeloCaretLayer");
	const paneIndicator = pane;
	await editor.focus();
	const normalCursorAnimation = await cursorLayer.evaluate((element) => {
		const style = getComputedStyle(element);
		return { name: style.animationName, duration: style.animationDuration };
	});
	expect(normalCursorAnimation.name).not.toBe("none");
	expect(normalCursorAnimation.duration).not.toBe("0.00001s");

	const focusBorder = await paneIndicator.evaluate((element) => {
		const style = getComputedStyle(element);
		return {
			color: style.borderTopColor,
			style: style.borderTopStyle,
			width: Number.parseFloat(style.borderTopWidth),
		};
	});
	expect(focusBorder.style).toBe("solid");
	expect(focusBorder.width).toBeGreaterThan(0);
	await expect(pane.locator(`.cm-content${outsidePinnedHeader}`)).toHaveCSS(
		"outline-style",
		"none",
	);

	await page.emulateMedia({ reducedMotion: "reduce" });
	await expect
		.poll(() =>
			cursorLayer.evaluate(
				(element) => getComputedStyle(element).animationName,
			),
		)
		.toBe("none");
	await expect
		.poll(() =>
			page
				.getByRole("button", { name: copy.actions.openAppMenu })
				.evaluate((element) =>
					Number.parseFloat(getComputedStyle(element).transitionDuration),
				),
		)
		.toBeLessThan(0.001);

	// Focus has to stay visible when motion is reduced, which is a different
	// question from whether it is visible at rest.
	await editor.focus();
	const reducedMotionFocus = await paneIndicator.evaluate((element) => {
		const style = getComputedStyle(element);
		return {
			style: style.borderTopStyle,
		};
	});
	expect(reducedMotionFocus.style).toBe("solid");
});

// A line whose dominant direction is left to right, ending in right-to-left
// text: End and Home must land on the logical line edges, so typed text joins
// the value at its logical end or start (#457, @codemirror/view 6.43.13). The
// greetings are words, not people, and every other byte must survive.
test("Home and End reach the logical line edges beside right-to-left text", async ({
	page,
	tabelo,
}) => {
	const first = samplePerson(0);
	const second = samplePerson(1);
	const greeting = "\u05e9\u05dc\u05d5\u05dd";
	const other = "\u0645\u0631\u062d\u0628\u0627";
	await tabelo.paste(
		[
			["Name", "Greeting"].join("\t"),
			[first.name, greeting].join("\t"),
			[second.name, other].join("\t"),
		].join("\n"),
	);
	await tabelo.showInSourcePane("csv");
	const editor = tabelo.source("csv");
	await expect(editor).toBeVisible();
	await expect(tabelo.cell(1, 2)).toHaveText(greeting);

	await editor.click();
	await page.keyboard.press("ControlOrMeta+Home");
	await page.keyboard.press("ArrowDown");
	await page.keyboard.press("End");
	await page.keyboard.type("!");
	await expect(tabelo.cell(1, 2)).toHaveText(`${greeting}!`);

	await page.keyboard.press("Home");
	await page.keyboard.type("Dr ");
	await expect(tabelo.cell(1, 1)).toHaveText(`Dr ${first.name}`);
	await expect(tabelo.cell(1, 2)).toHaveText(`${greeting}!`);
	await expect(tabelo.cell(2, 1)).toHaveText(second.name);
	await expect(tabelo.cell(2, 2)).toHaveText(other);
});
