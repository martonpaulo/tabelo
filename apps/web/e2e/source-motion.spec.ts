import { copy } from "@/copy/copy";
import { samplePeopleCsv } from "@/core/sample-data";
import { expect, test } from "./fixtures";

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
		.locator(".cm-editor")
		.evaluate((element: HTMLElement) => {
			element.dataset.editorInstance = "before-view-change";
		});

	await tabelo.choosePaneView("markdown", "csv");

	const csvPane = tabelo.pane("csv");
	await expect(csvPane.locator(".cm-editor")).toHaveAttribute(
		"data-editor-instance",
		"before-view-change",
	);
	// The surviving editor still follows the view: it serves the new format's
	// text and answers to the new format's accessible name.
	await expect(tabelo.source("csv")).toBeVisible();
	await expect(csvPane.locator(".cm-line").first()).toHaveText("name,city");
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
	await tabelo.addViewBySplit("markdown", "bottom", "csv");

	const stamp = (view: "markdown" | "csv", value: string) =>
		tabelo
			.pane(view)
			.locator(".cm-editor")
			.evaluate((element: HTMLElement, mark) => {
				element.dataset.editorInstance = mark;
			}, value);
	await stamp("markdown", "markdown-editor");
	await stamp("csv", "csv-editor");

	await tabelo.choosePaneView("csv", "tsv");

	await expect(tabelo.pane("markdown").locator(".cm-editor")).toHaveAttribute(
		"data-editor-instance",
		"markdown-editor",
	);
	await expect(tabelo.pane("tsv").locator(".cm-editor")).toHaveAttribute(
		"data-editor-instance",
		"csv-editor",
	);
});

test("source focus stays visible and reduced motion keeps the cursor solid", async ({
	page,
	tabelo,
}) => {
	await page.emulateMedia({
		colorScheme: "light",
		reducedMotion: "no-preference",
	});

	const pane = tabelo.pane("markdown");
	const editor = tabelo.source("markdown");
	const cursorLayer = pane.locator(".cm-cursorLayer");
	const paneIndicator = pane;
	await editor.focus();
	const normalCursorAnimation = await cursorLayer.evaluate((element) => {
		const style = getComputedStyle(element);
		return { name: style.animationName, duration: style.animationDuration };
	});
	expect(normalCursorAnimation.name).not.toBe("none");
	expect(normalCursorAnimation.duration).not.toBe("0.00001s");

	const lightFocus = await paneIndicator.evaluate((element) => {
		const style = getComputedStyle(element);
		return {
			color: style.borderTopColor,
			style: style.borderTopStyle,
			width: Number.parseFloat(style.borderTopWidth),
		};
	});
	expect(lightFocus.style).toBe("solid");
	expect(lightFocus.width).toBeGreaterThan(0);
	await expect(pane.locator(".cm-content")).toHaveCSS("outline-style", "none");

	await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
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

	await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
	await editor.focus();
	const darkFocus = await paneIndicator.evaluate((element) => {
		const style = getComputedStyle(element);
		return {
			style: style.borderTopStyle,
		};
	});
	expect(darkFocus.style).toBe("solid");
});
