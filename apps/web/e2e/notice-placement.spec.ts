import type { Locator, Page } from "@playwright/test";
import { copy } from "@/copy/copy";
import { expect, test } from "./fixtures";
import type { TabeloPage } from "./helpers";

// Where a notice is shown, as opposed to what it says. The notice area used to
// stand in the layout and render nothing while idle, so the first notice
// inserted a band and pushed the whole workspace down: the reflow
// docs/design-system.md §5 forbids. It now floats in its own layer.

const TILED = { width: 1280, height: 720 };
const STACKED = { width: 390, height: 700 };

// The header guess is raised by a paste, carries an action, and therefore
// never expires on its own, so it stays on screen for the whole measurement.
async function raiseNotice(tabelo: TabeloPage): Promise<void> {
	await tabelo.paste("Name\tRole\nInez\tDesigner");
	await expect(tabelo.notice()).toHaveCount(1);
}

async function box(locator: Locator) {
	const value = await locator.boundingBox();
	if (!value) throw new Error("element is not rendered");
	return value;
}

// Whether the pointer would land on a notice at this point. This is how
// "above" and "below" stay observable without reading a z-index out of a
// stylesheet.
function noticeIsTopmostAt(page: Page, x: number, y: number): Promise<boolean> {
	return page.evaluate(
		([pointX, pointY]) =>
			Boolean(
				document.elementFromPoint(pointX, pointY)?.closest("[data-severity]"),
			),
		[x, y],
	);
}

for (const [shape, viewport] of [
	["tiled", TILED],
	["stacked", STACKED],
] as const) {
	// The one geometry assertion this suite makes on purpose: §5's "nothing may
	// reflow because of a status change" is a statement about the workspace
	// occupying the same box before and after, and there is no other way to
	// observe it.
	test(`a notice moves nothing in the ${shape} workspace`, async ({
		page,
		tabelo,
	}) => {
		await page.setViewportSize(viewport);
		const before = await box(tabelo.workspace);

		await raiseNotice(tabelo);

		const after = await box(tabelo.workspace);
		expect(after.y).toBe(before.y);
		expect(after.height).toBe(before.height);
	});
}

test("a notice does not cover the floating action button", async ({
	page,
	tabelo,
}) => {
	await page.setViewportSize(STACKED);
	await raiseNotice(tabelo);

	const notice = await box(tabelo.notice().first());
	const trigger = await box(
		page.getByRole("button", { name: copy.actions.openAppMenu }),
	);

	const overlaps =
		notice.x < trigger.x + trigger.width &&
		trigger.x < notice.x + notice.width &&
		notice.y < trigger.y + trigger.height &&
		trigger.y < notice.y + notice.height;
	expect(overlaps).toBe(false);
});

test("a notice stays on screen while the stacked workspace scrolls", async ({
	page,
	tabelo,
}) => {
	await page.setViewportSize(STACKED);
	await raiseNotice(tabelo);

	await tabelo.workspace.evaluate((workspace) => {
		workspace.scrollTop = workspace.scrollHeight;
	});
	await expect
		.poll(async () => tabelo.workspace.evaluate((node) => node.scrollTop))
		.toBeGreaterThan(0);

	const notice = await box(tabelo.notice().first());
	expect(notice.y).toBeGreaterThanOrEqual(0);
	expect(notice.y + notice.height).toBeLessThan(STACKED.height);
	await expect(tabelo.notice().first()).toBeVisible();
});

test("a dialog covers the notice layer rather than opening beneath it", async ({
	page,
	tabelo,
}) => {
	await page.setViewportSize(TILED);
	await raiseNotice(tabelo);
	const notice = await box(tabelo.notice().first());

	await tabelo.openLayoutDialog();

	// The modal backdrop owns the viewport, so the point that was the notice a
	// moment ago now belongs to the dialog layer.
	const onNotice = await noticeIsTopmostAt(
		page,
		notice.x + notice.width / 2,
		notice.y + notice.height / 2,
	);
	expect(onNotice).toBe(false);
});

// A notice talks about the table, and the pane it talks about must keep its
// own commands: the trigger has to be clickable under the notice layer, and
// the menu it opens has to come out above it.
for (const [shape, viewport] of [
	["tiled", TILED],
	["stacked", STACKED],
] as const) {
	test(`the ${shape} pane keeps its actions menu while a notice is on screen`, async ({
		page,
		tabelo,
	}) => {
		await page.setViewportSize(viewport);
		await raiseNotice(tabelo);

		const menu = await tabelo.openPaneMenu("grid");
		await expect(menu).toBeVisible();
		const menuBox = await box(menu);

		const onNotice = await noticeIsTopmostAt(
			page,
			menuBox.x + menuBox.width / 2,
			menuBox.y + menuBox.height / 2,
		);
		expect(onNotice).toBe(false);
	});
}

test("the notice layer does not swallow pointer events over the table", async ({
	page,
	tabelo,
}) => {
	await page.setViewportSize(TILED);
	await raiseNotice(tabelo);
	const notice = await box(tabelo.notice().first());

	// Beside the notice column, at the same height, the workspace is still what
	// the pointer reaches: the layer is a place for notices, not a lid.
	const beside = (notice.x + notice.width + TILED.width) / 2;
	const onNotice = await noticeIsTopmostAt(
		page,
		beside,
		notice.y + notice.height / 2,
	);
	expect(onNotice).toBe(false);
});
