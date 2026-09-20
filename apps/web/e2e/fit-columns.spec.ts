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
		.getByRole("menuitem", { name: copy.workspace.fitColumnsToPane })
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
