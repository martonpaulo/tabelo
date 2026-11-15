import { copy } from "@/copy/copy";
import { expect, test } from "./fixtures";

// #579: the content row is one token, declared again on the pane body that
// carries the zoom, so a value read through `var()` inside a pane (a wrapped
// grid row's minimum height, the source line box) follows that pane's zoom
// rather than the zoom-1 value it would inherit from the document root.
// Direction only: zooming out has to make the row shorter.
test("zooming out a grid pane shortens a wrapped row", async ({
	page,
	tabelo,
}) => {
	const menu = await tabelo.openPaneMenu("grid");
	await menu
		.getByRole("menuitemcheckbox", { name: copy.workspace.wrapAllColumns })
		.click();
	await page.keyboard.press("Escape");
	await menu.waitFor({ state: "hidden" });

	const cell = tabelo.cell(2, 1);
	const rowHeight = async () => (await cell.boundingBox())?.height ?? 0;
	const before = await rowHeight();
	expect(before).toBeGreaterThan(0);

	await tabelo.runPaneCommand("grid", "zoomOut");
	await tabelo.runPaneCommand("grid", "zoomOut");

	await expect.poll(rowHeight).toBeLessThan(before);
});
