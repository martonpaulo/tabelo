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
			`| Ingrid | ${"long ".repeat(20)}|`,
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

test("fitting an oversized source stops at minimum zoom and preserves its text", async ({
	tabelo,
}) => {
	const editor = tabelo.source("markdown");
	const value = "long ".repeat(40).trim();
	await editor.fill(`| Name | Note |\n| --- | --- |\n| Ingrid | ${value} |`);
	await expect(tabelo.cell(1, 2)).toHaveText(value);
	const menu = await tabelo.openPaneMenu("markdown");
	await menu
		.getByRole("menuitem", { name: copy.workspace.fitToPaneWidth })
		.click();
	await expect(menu).toBeHidden();
	const reopened = await tabelo.openPaneMenu("markdown");
	await expect(
		reopened.getByRole("menuitem", {
			name: copy.workspace.zoomOut,
			exact: true,
		}),
	).toBeDisabled();
	await expect(tabelo.cell(1, 2)).toHaveText(value);
});

// #467: every column takes the width its own content needs, in one command.
test("fitting columns to content resizes every column at once", async ({
	tabelo,
}) => {
	const value = "long ".repeat(14).trim();
	await tabelo
		.source("markdown")
		.fill(`| A | Note |\n| --- | --- |\n| 1 | ${value} |`);
	await expect(tabelo.cell(1, 2)).toHaveText(value);

	const width = (column: number) =>
		tabelo
			.header(column)
			.evaluate((node) => node.getBoundingClientRect().width);
	const shortBefore = await width(1);
	const longBefore = await width(2);

	const menu = await tabelo.openPaneMenu("grid");
	await menu
		.getByRole("menuitem", { name: copy.workspace.fitColumnsToContent })
		.click();
	await expect(menu).toBeHidden();

	// Direction, not geometry: the short column narrows, the long one widens.
	await expect
		.poll(
			async () =>
				(await width(1)) < shortBefore && (await width(2)) > longBefore,
		)
		.toBe(true);
});
