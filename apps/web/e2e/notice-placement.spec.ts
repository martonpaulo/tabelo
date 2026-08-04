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
	await tabelo.paste("Name\tRole\nIngrid\tDesigner");
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

// The cap is a ceiling, not a width. A one-line message must not draw a band
// across the workspace merely because a longer one could.
test("a short notice takes only the width it needs", async ({
	page,
	tabelo,
}) => {
	await page.setViewportSize(TILED);
	await raiseNotice(tabelo);

	const notice = await box(tabelo.notice().first());
	const workspace = await box(tabelo.workspace);
	expect(notice.width).toBeLessThan(workspace.width / 2);
});

// The recovery comes before the way out: a notice offering an action puts that
// action in the tab order first, and dismissal last.
test("a notice reaches its action before its dismissal", async ({ tabelo }) => {
	await raiseNotice(tabelo);

	const controls = tabelo.notice().first().getByRole("button");
	await expect(controls).toHaveCount(2);
	await expect(controls.last()).toHaveAccessibleName(copy.actions.dismiss);
});

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

// The notice takes the top trailing corner, so it covers the pane header it
// lands on, that pane's actions trigger included. What must hold is that the
// trigger stays reachable from the keyboard while it is covered, and that a
// pointer user gets it back by dismissing.
test("a covered pane keeps its actions trigger on the keyboard", async ({
	page,
	tabelo,
}) => {
	await page.setViewportSize(STACKED);
	await raiseNotice(tabelo);

	const trigger = tabelo.paneMenuTrigger("grid");
	await trigger.focus();
	await page.keyboard.press("Enter");
	await expect(page.getByRole("menu", { name: /^Pane actions/ })).toBeVisible();
});

test("dismissing a notice gives the pointer its pane back", async ({
	page,
	tabelo,
}) => {
	await page.setViewportSize(STACKED);
	await raiseNotice(tabelo);

	await tabelo
		.notice()
		.first()
		.getByRole("button", { name: copy.actions.dismiss })
		.click();
	await expect(tabelo.notice()).toHaveCount(0);

	const menu = await tabelo.openPaneMenu("grid");
	await expect(menu).toBeVisible();
});

// And a menu already open is never covered by a notice arriving over it.
test("an open menu is not covered by a notice", async ({ page, tabelo }) => {
	await page.setViewportSize(STACKED);
	const menu = await tabelo.openPaneMenu("grid");
	await raiseNotice(tabelo);
	await expect(menu).toBeVisible();

	const menuBox = await box(menu);
	const onNotice = await noticeIsTopmostAt(
		page,
		menuBox.x + menuBox.width / 2,
		menuBox.y + menuBox.height / 2,
	);
	expect(onNotice).toBe(false);
});

test("the notice layer does not swallow pointer events over the table", async ({
	page,
	tabelo,
}) => {
	await page.setViewportSize(TILED);
	await raiseNotice(tabelo);
	const notice = await box(tabelo.notice().first());

	// Beside the notice column, at the same height, the workspace is still what
	// the pointer reaches: the layer is a place for notices, not a lid.
	const onNotice = await noticeIsTopmostAt(
		page,
		notice.x / 2,
		notice.y + notice.height / 2,
	);
	expect(onNotice).toBe(false);
});
