import { copy } from "@/copy/copy";
import { expect, test } from "./fixtures";

// #404: the columns take the room the pane has, in one command, instead of
// leaving a gap after the last one or scrolling sideways for no reason.
test("fitting the columns fills the pane without overflowing it", async ({
	tabelo,
}) => {
	const surface = tabelo.pane("grid").locator("[data-grid-surface]");
	const room = () =>
		surface.evaluate((node) => {
			const scroller = node.closest<HTMLElement>('[data-slot="panel-body"]');
			return {
				overflow: scroller
					? scroller.scrollWidth - scroller.clientWidth
					: Number.NaN,
				gap: scroller
					? scroller.clientWidth - node.getBoundingClientRect().width
					: Number.NaN,
			};
		});

	const menu = await tabelo.openPaneMenu("grid");
	await menu
		.getByRole("menuitem", { name: copy.workspace.fitToPaneWidth })
		.click();
	await expect(menu).toBeHidden();

	await expect
		.poll(async () => {
			const { overflow, gap } = await room();
			// Direction, not geometry: nothing scrolls sideways any more, and the
			// table reaches the pane's edge rather than stopping short of it.
			return overflow <= 1 && gap <= 1;
		})
		.toBe(true);
});

// A text view cannot pad the file to fill a pane, so the same command scales
// the pane until the widest line fits (#404).
test("fitting a source pane scales it until its widest line fits", async ({
	tabelo,
}) => {
	const editor = tabelo.source("markdown");
	await editor.fill(
		[
			"| Name | Note |",
			"| --- | --- |",
			`| Ingrid | ${"long ".repeat(40)}|`,
		].join("\n"),
	);

	const menu = await tabelo.openPaneMenu("markdown");
	await menu
		.getByRole("menuitem", { name: copy.workspace.fitToPaneWidth })
		.click();
	await expect(menu).toBeHidden();

	await expect
		.poll(() =>
			tabelo.pane("markdown").evaluate((node) => {
				const scroller = node.querySelector(".cm-scroller");
				return scroller
					? scroller.scrollWidth - scroller.clientWidth <= 1
					: false;
			}),
		)
		.toBe(true);
});
