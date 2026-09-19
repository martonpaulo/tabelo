import { copy } from "@/copy/copy";
import { samplePerson } from "@/core/sample-data";
import { expect, test } from "./fixtures";
import { renderedSource } from "./helpers";

// One view failing must never blank the app. The failure is forced from the
// outside rather than through a hook in the product: the source editor
// watches the size of the element that holds CodeMirror as it mounts, so
// making that one call throw breaks exactly the source pane, the way an
// exception inside CodeMirror did before its pane had a boundary, and leaves
// the grid untouched.

declare global {
	interface Window {
		tabeloBreakSourceEditor?: boolean;
	}
}

test("a view that fails stays in its pane while the others keep working", async ({
	page,
	tabelo,
}) => {
	await page.addInitScript(() => {
		window.tabeloBreakSourceEditor = true;
		const observe = ResizeObserver.prototype.observe;
		ResizeObserver.prototype.observe = function (target, options) {
			if (
				window.tabeloBreakSourceEditor &&
				target instanceof Element &&
				target.firstElementChild?.classList.contains("cm-editor")
			) {
				throw new Error("forced source editor failure");
			}
			return observe.call(this, target, options);
		};
	});
	await page.reload();
	await tabelo.dismissWelcome();
	await expect(tabelo.workspace).toBeVisible();

	const markdown = tabelo.pane("markdown");
	const reload = markdown.getByRole("button", {
		name: copy.workspace.reloadView,
	});
	await expect(
		markdown.getByRole("status", { name: copy.a11y.failedView }),
	).toBeVisible();
	await expect(reload).toBeVisible();
	await expect(
		markdown.getByRole("button", { name: copy.workspace.changeView }),
	).toBeVisible();

	// The rest of the app is untouched: the grid still edits the document.
	const name = samplePerson(0).name;
	await tabelo.editCell(1, 1, name);
	await expect(tabelo.cell(1, 1)).toHaveText(name);

	// Reloading the view brings it back showing the table as it is now, so
	// nothing that happened while it was down was lost.
	await page.evaluate(() => {
		window.tabeloBreakSourceEditor = false;
	});
	await reload.click();
	await expect(tabelo.source("markdown")).toBeVisible();
	await expect.poll(() => renderedSource(markdown)).toContain(name);
});
