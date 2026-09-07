import type { Locator, Page } from "@playwright/test";
import { copy } from "@/copy/copy";
import { expect, test } from "./fixtures";

interface ZoomProbe {
	zoomCancelled: string[];
}

// Composing the workspace by splitting the pane edge the new view should appear
// along, rather than by naming a tiling first. The presets still own every
// shape, so splitting can never reach one the gallery cannot.

const invalidMarkdown = "| Name |\n| not a divider |\n| Ingrid |";

test("splitting a pane adds the view that was chosen for it", async ({
	tabelo,
}) => {
	const panes = tabelo.workspace.getByRole("region");
	await expect(panes).toHaveCount(2);

	await tabelo.addViewBySplit("markdown", "bottom", "jira");

	await expect(panes).toHaveCount(3);
	// The view was picked before anything moved, so the pane never appears
	// showing something the user did not ask for.
	await expect(tabelo.pane("jira")).toBeVisible();
	await expect(tabelo.pane("csv")).toHaveCount(0);
	await expect(tabelo.pane("jira")).toBeFocused();
});

// The confirmed mapping: which pane is split decides which preset results, and
// the edge decides which side the new pane lands on.
test("which pane is split decides the resulting arrangement", async ({
	tabelo,
}) => {
	// Splitting the left pane of two columns puts the new pane under it.
	await tabelo.addViewBySplit("grid", "bottom", "csv");

	const grid = await tabelo.paneArea("grid");
	const added = await tabelo.paneArea("csv");
	const markdown = await tabelo.paneArea("markdown");

	expect(added.rowStart).toBe(grid.rowEnd);
	expect(added.columnStart).toBe(grid.columnStart);
	// The pane that was not split keeps both rows.
	expect(markdown.rowEnd - markdown.rowStart).toBe(2);
});

test("the picker refuses a view another pane already shows", async ({
	tabelo,
}) => {
	await tabelo.splitControl("grid", "bottom").click();
	const dialog = tabelo.page.getByRole("dialog");

	const markdown = dialog.getByRole("radio", {
		name: copy.views.markdown.label,
	});
	await expect(markdown).toBeVisible();
	await expect(markdown).toBeDisabled();
	await markdown.hover();
	await expect(tabelo.page.getByRole("tooltip")).toBeVisible();

	// A view nobody is showing stays available.
	await expect(
		dialog.getByRole("radio", { name: copy.views.jira.label }),
	).toBeEnabled();
});

test("cancelling changes nothing and returns the focus", async ({
	page,
	tabelo,
}) => {
	const panes = tabelo.workspace.getByRole("region");
	const control = tabelo.splitControl("grid", "bottom");
	await control.click();

	await page
		.getByRole("dialog")
		.getByRole("button", { name: copy.actions.cancel })
		.click();

	await expect(page.getByRole("dialog")).toBeHidden();
	await expect(panes).toHaveCount(2);
	await expect(control).toBeFocused();
});

test("closing a view keeps the other panes and their views", async ({
	tabelo,
}) => {
	await tabelo.addViewBySplit("markdown", "bottom", "csv");
	await expect(tabelo.workspace.getByRole("region")).toHaveCount(3);

	await tabelo.runPaneCommand("csv", "closeView");

	await expect(tabelo.workspace.getByRole("region")).toHaveCount(2);
	await expect(tabelo.pane("grid")).toBeVisible();
	await expect(tabelo.pane("markdown")).toBeVisible();
	await expect(tabelo.pane("csv")).toHaveCount(0);
});

test("every pane count from one to four is reachable and reversible", async ({
	tabelo,
}) => {
	const panes = tabelo.workspace.getByRole("region");

	await tabelo.addViewBySplit("markdown", "bottom", "csv");
	await expect(panes).toHaveCount(3);
	await tabelo.addViewBySplit("grid", "bottom", "jira");
	await expect(panes).toHaveCount(4);

	await tabelo.runPaneCommand("markdown", "closeView");
	await expect(panes).toHaveCount(3);
	await tabelo.runPaneCommand("grid", "closeView");
	await expect(panes).toHaveCount(2);
	await tabelo.runPaneCommand("csv", "closeView");
	await expect(panes).toHaveCount(1);

	// One pane is reachable but not a dead end: it splits either way, so the
	// count climbs back out of the floor the same way it arrived.
	await tabelo.addViewBySplit("jira", "right", "markdown");
	await expect(panes).toHaveCount(2);
});

// The two ends of the range say so differently, and deliberately. Close view is
// a menu item, so it is disabled with a written reason. A split control has no
// resting place to be disabled in, so at four panes there is simply no edge
// left that yields a valid preset and no control is drawn.
test("the range ends stop the commands that would leave it", async ({
	tabelo,
}) => {
	await tabelo.chooseLayout("single");
	const menu = await tabelo.openPaneMenu("grid");
	await expect(
		menu.getByRole("menuitem", { name: copy.workspace.closeView }),
	).toBeDisabled();
	await expect(
		menu.getByRole("menuitem", { name: copy.workspace.movePane }),
	).toBeDisabled();
	await menu.getByRole("menuitem", { name: copy.workspace.movePane }).hover();
	await expect(tabelo.page.getByRole("tooltip")).toBeVisible();
	await tabelo.page.keyboard.press("Escape");

	// One pane spans both axes, so it is the only pane offering both edges.
	await expect(tabelo.addControls()).toHaveCount(2);

	await tabelo.chooseLayout("quad");
	await expect(tabelo.addControls()).toHaveCount(0);
	await expect(
		(await tabelo.openPaneMenu("grid")).getByRole("menuitem", {
			name: copy.workspace.closeView,
		}),
	).toBeEnabled();
});

test("closing a pane that owns an invalid draft asks before discarding it", async ({
	tabelo,
}) => {
	// A third pane, so that closing the one holding the draft is not also the
	// step that changes how many columns the workspace has.
	await tabelo.addViewBySplit("grid", "bottom", "csv");
	await tabelo.source("markdown").fill(invalidMarkdown);
	await expect(tabelo.source("markdown")).toHaveAttribute(
		"aria-invalid",
		"true",
	);

	await tabelo.runPaneCommand("markdown", "closeView");

	// Nothing is lost yet: the pane, and the text in it, are still there.
	await expect(tabelo.pane("markdown")).toBeVisible();
	await expect(tabelo.notice()).toBeVisible();

	await tabelo.page
		.getByRole("button", { name: copy.notices.discardPaneAction("close") })
		.click();
	await expect(tabelo.pane("markdown")).toHaveCount(0);
	await expect(tabelo.workspace.getByRole("region")).toHaveCount(2);
});

const contentSize = (pane: Locator) =>
	pane
		.locator(".cm-content")
		.evaluate((element) =>
			Number.parseFloat(getComputedStyle(element).fontSize),
		);

test("the pane-zoom chord steps and resets the active pane, including inside a source editor", async ({
	page,
	tabelo,
}) => {
	const markdown = tabelo.pane("markdown");
	const sizeBefore = await contentSize(markdown);
	await tabelo.source("markdown").click();
	await page.keyboard.press("ControlOrMeta+Alt+=");
	await expect.poll(() => contentSize(markdown)).toBeGreaterThan(sizeBefore);

	await page.keyboard.press("ControlOrMeta+Alt+-");
	await page.keyboard.press("ControlOrMeta+Alt+-");
	await expect.poll(() => contentSize(markdown)).toBeLessThan(sizeBefore);

	await page.keyboard.press("ControlOrMeta+Alt+0");
	await expect.poll(() => contentSize(markdown)).toBe(sizeBefore);
	const menu = await tabelo.openPaneMenu("markdown");
	await expect(
		menu.getByRole("menuitem", { name: copy.workspace.resetZoom }),
	).toBeDisabled();
});

// The chord is not conditioned on where focus sits: it steps whichever pane is
// active, so it has to behave the same in the grid and from a control that
// belongs to no pane at all.
test("the pane-zoom chord steps the active pane from the grid and from outside every pane", async ({
	page,
	tabelo,
}) => {
	const cellSize = () =>
		tabelo
			.cell(1, 1)
			.evaluate((element) =>
				Number.parseFloat(getComputedStyle(element).fontSize),
			);

	await tabelo.cell(1, 1).click();
	const sizeBefore = await cellSize();
	await page.keyboard.press("ControlOrMeta+Alt+=");
	await expect.poll(cellSize).toBeGreaterThan(sizeBefore);
	const zoomedInGrid = await cellSize();

	// Focused rather than clicked: opening the menu would take the keystrokes.
	// The grid stays the active pane, so the chord keeps stepping it from here.
	await page
		.getByRole("button", { name: copy.actions.openAppMenu })
		.first()
		.focus();
	await page.keyboard.press("ControlOrMeta+Alt+=");
	await expect.poll(cellSize).toBeGreaterThan(zoomedInGrid);

	await page.keyboard.press("ControlOrMeta+Alt+-");
	await expect.poll(cellSize).toBe(zoomedInGrid);

	await page.keyboard.press("ControlOrMeta+Alt+0");
	await expect.poll(cellSize).toBe(sizeBefore);
	const menu = await tabelo.openPaneMenu("grid");
	await expect(
		menu.getByRole("menuitem", { name: copy.workspace.resetZoom }),
	).toBeDisabled();
});

// The browser owns Mod+plus, Mod+minus, and Mod+0. Playwright cannot observe the
// browser-level zoom those keys drive, but it can prove the two things the
// application controls: pane zoom does not move, and the event is never
// cancelled, so whatever the engine does with it still happens.
test("the browser's own zoom shortcuts reach the browser untouched", async ({
	page,
	tabelo,
}) => {
	// Registered after the app's own window listener, so it observes the flag the
	// app either set or left alone.
	await page.evaluate(() => {
		const cancelled: string[] = [];
		(window as unknown as ZoomProbe).zoomCancelled = cancelled;
		window.addEventListener("keydown", (event) => {
			if (event.defaultPrevented) cancelled.push(event.key);
		});
	});

	const markdown = tabelo.pane("markdown");
	const sizeBefore = await contentSize(markdown);

	for (const focus of [
		() => tabelo.source("markdown").click(),
		() => tabelo.cell(1, 1).click(),
	]) {
		await focus();
		await page.keyboard.press("ControlOrMeta+=");
		await page.keyboard.press("ControlOrMeta+-");
		await page.keyboard.press("ControlOrMeta+0");
	}

	const cancelled = await page.evaluate(
		() => (window as unknown as ZoomProbe).zoomCancelled,
	);
	expect(cancelled).toEqual([]);
	expect(await contentSize(markdown)).toBe(sizeBefore);
});

test("zoom resets in one action and survives a reload", async ({ tabelo }) => {
	const contentSize = () =>
		tabelo
			.pane("markdown")
			.locator(".cm-content")
			.evaluate((element) =>
				Number.parseFloat(getComputedStyle(element).fontSize),
			);
	const contentSizeBefore = await contentSize();

	await tabelo.runPaneCommand("markdown", "zoomOut");
	await expect.poll(contentSize).toBeLessThan(contentSizeBefore);

	await tabelo.page.reload();
	await tabelo.dismissWelcome();
	await expect(tabelo.workspace).toBeVisible();
	await expect.poll(contentSize).toBeLessThan(contentSizeBefore);

	await tabelo.runPaneCommand("markdown", "resetZoom");
	const menu = await tabelo.openPaneMenu("markdown");
	await expect(
		menu.getByRole("menuitem", { name: copy.workspace.resetZoom }),
	).toBeDisabled();
});

test("Change view leaves the flat pane menu for one dialog", async ({
	page,
	tabelo,
}) => {
	const actionsMenu = await tabelo.openPaneMenu("markdown");
	await expect(
		actionsMenu.getByRole("menuitem", { name: copy.workspace.changeView }),
	).toBeVisible();
	await expect(actionsMenu.getByRole("menuitemradio")).toHaveCount(0);
	await expect(
		actionsMenu.getByRole("menuitem", { name: copy.workspace.zoomIn }),
	).toBeVisible();
	await page.keyboard.press("Escape");

	const dialog = await tabelo.openChangeViewDialog("markdown");
	await expect(dialog.getByRole("radio")).toHaveCount(9);
	await expect(
		dialog.getByRole("menuitem", { name: copy.workspace.zoomIn }),
	).toHaveCount(0);
});

// Adding, closing, and arranging are three commands with one boundary between
// them: Layout may change how the open panes are arranged and nothing else.
test("Layout offers only the arrangements of the current pane count", async ({
	tabelo,
}) => {
	const panes = tabelo.workspace.getByRole("region");
	const twoPane = await tabelo.openLayoutDialog();
	await expect(twoPane.getByRole("radio")).toHaveCount(2);
	for (const id of ["columns", "rows"] as const) {
		await expect(
			twoPane.getByRole("radio", { name: copy.layouts[id].label }),
		).toBeVisible();
	}
	await twoPane.getByRole("button", { name: copy.actions.cancel }).click();
	await expect(twoPane).toBeHidden();

	await tabelo.goToPaneCount(3);
	const threePane = await tabelo.openLayoutDialog();
	await expect(threePane.getByRole("radio")).toHaveCount(4);
	for (const id of [
		"left-split",
		"right-split",
		"top-split",
		"bottom-split",
	] as const) {
		await expect(
			threePane.getByRole("radio", { name: copy.layouts[id].label }),
		).toBeVisible();
	}

	// Applying one of them rearranges the three panes rather than making a
	// fourth, and the arrangement growing alone cannot reach is among them.
	await threePane
		.getByRole("radio", { name: copy.layouts["top-split"].label })
		.click();
	await threePane
		.getByRole("button", { name: copy.workspace.applyLayout })
		.click();
	await expect(threePane).toBeHidden();
	await expect(panes).toHaveCount(3);
	expect(await tabelo.paneArea("grid")).toMatchObject({
		rowStart: 1,
		rowEnd: 2,
		columnStart: 1,
		columnEnd: 2,
	});
});

test("Layout is disabled and explained where the pane count has one arrangement", async ({
	page,
	tabelo,
}) => {
	for (const count of [1, 4]) {
		await tabelo.goToPaneCount(count);
		const menu = await tabelo.openAppMenu();
		const command = menu.getByRole("menuitem", { name: copy.workspace.layout });
		// Fixed rather than hidden: the command keeps its place in the menu and
		// says why it cannot act.
		await expect(command).toBeVisible();
		await expect(command).toBeDisabled();
		await command.hover();
		await expect(page.getByRole("tooltip")).toBeVisible();
		// The tooltip takes the first Escape, the menu the next one.
		await page.keyboard.press("Escape");
		await page.keyboard.press("Escape");
		await expect(menu).toBeHidden();
	}
});

test("a same-count arrangement survives a reload", async ({ page, tabelo }) => {
	// Content of its own, so the reload restores a saved workspace rather than
	// returning to onboarding.
	await tabelo.editCell(1, 1, "Ingrid");
	await tabelo.goToPaneCount(3);
	await tabelo.chooseLayout("bottom-split");
	const before = await tabelo.paneArea("grid");
	expect(before).toMatchObject({ rowStart: 1, rowEnd: 2 });

	await page.reload();
	await tabelo.workspace.waitFor({ state: "visible" });

	await expect(tabelo.workspace.getByRole("region")).toHaveCount(3);
	expect(await tabelo.paneArea("grid")).toEqual(before);
});

// §5 requires a pane header to be one row that never wraps, shortening labels
// instead. The action trigger and Read only badge are the tightest case today.
test("the pane header keeps its controls at the narrowest four-pane width", async ({
	page,
	tabelo,
}) => {
	await tabelo.chooseLayout("quad");
	// Just above the breakpoint where the workspace stacks instead of tiling.
	await page.setViewportSize({ width: 900, height: 700 });

	for (const pane of await tabelo.workspace.getByRole("region").all()) {
		const header = pane.locator("header");
		await expect(header).toHaveCSS("flex-wrap", "nowrap");
		// The one command trigger survives the squeeze; the label shortens instead.
		await expect(
			pane.getByRole("button", {
				name: new RegExp(`^${copy.workspace.paneActions}:`),
			}),
		).toBeVisible();
	}

	// And the workspace never grows a horizontal scrollbar to fit them.
	expect(
		await page.evaluate(
			() => document.documentElement.scrollWidth <= window.innerWidth,
		),
	).toBe(true);
});

// #63: a divider advertises an interaction only where that interaction exists.
// Every assertion below is hit-testing and direction, never a measured size:
// the question is which element owns a point, not how large anything is.

// The point a probe lands on, described by what owns it rather than by where
// it is. A separator sits above the panes, so "the pane answered" is the proof
// that no handle is stretched across it.
async function ownerAt(
	page: Page,
	x: number,
	y: number,
): Promise<{ separator: boolean; paneId: string | null }> {
	return page.evaluate(
		([left, top]) => {
			const element = document.elementFromPoint(left as number, top as number);
			return {
				separator: Boolean(element?.closest('[role="separator"]')),
				paneId:
					element?.closest("[data-pane-id]")?.getAttribute("data-pane-id") ??
					null,
			};
		},
		[x, y],
	);
}

function box(value: Awaited<ReturnType<Locator["boundingBox"]>>) {
	if (!value) throw new Error("Expected the element to have a layout box.");
	return value;
}

// The pane that spans both tracks of one axis, which is the pane the other
// axis's divider must not cross. Read from grid lines, so it follows the
// preset rather than a remembered view order.
async function undividedPane(
	page: Page,
	axis: "row" | "column",
): Promise<Locator> {
	const id = await page.evaluate((along) => {
		for (const node of document.querySelectorAll("[data-pane-id]")) {
			const [rowStart, columnStart, rowEnd, columnEnd] = window
				.getComputedStyle(node)
				.gridArea.split("/")
				.map((part) => Number(part.trim()));
			const spans =
				along === "row"
					? Number(rowEnd) - Number(rowStart) === 2
					: Number(columnEnd) - Number(columnStart) === 2;
			if (spans) return node.getAttribute("data-pane-id");
		}
		return null;
	}, axis);
	if (!id) throw new Error(`No pane spans both ${axis} tracks.`);
	return page.locator(`[data-pane-id="${id}"]`);
}

test("each preset exposes exactly the dividers its shape has", async ({
	page,
	tabelo,
}) => {
	const columns = page.getByRole("separator", {
		name: copy.workspace.resizeColumns,
	});
	const rows = page.getByRole("separator", { name: copy.workspace.resizeRows });

	for (const [layout, hasColumns, hasRows] of [
		["single", 0, 0],
		["columns", 1, 0],
		["rows", 0, 1],
		["left-split", 1, 1],
		["right-split", 1, 1],
		["top-split", 1, 1],
		["bottom-split", 1, 1],
		["quad", 1, 1],
	] as const) {
		await tabelo.chooseLayout(layout);
		await expect(columns).toHaveCount(hasColumns);
		await expect(rows).toHaveCount(hasRows);
	}
});

// Both mirrors of both axes. In "left-split" and "right-split" the horizontal
// divider exists in one column only; in "top-split" and "bottom-split" the
// vertical one exists in one row only.
for (const [layout, axis, label] of [
	["left-split", "row", copy.workspace.resizeRows],
	["right-split", "row", copy.workspace.resizeRows],
	["top-split", "column", copy.workspace.resizeColumns],
	["bottom-split", "column", copy.workspace.resizeColumns],
] as const) {
	test(`the ${layout} divider stops at the boundary it controls`, async ({
		page,
		tabelo,
	}) => {
		await tabelo.chooseLayout(layout);
		const divider = page.getByRole("separator", { name: label });
		await expect(divider).toBeVisible();

		const undivided = await undividedPane(
			page,
			axis === "row" ? "row" : "column",
		);
		const undividedId = await undivided.getAttribute("data-pane-id");

		const probe = async () => {
			const handle = box(await divider.boundingBox());
			const pane = box(await undivided.boundingBox());
			// A point on the divider's own line, inside the pane that has no such
			// boundary. The other point is on the same line where the boundary is
			// real, which is what proves the divider did not simply disappear.
			return axis === "row"
				? {
						across: await ownerAt(
							page,
							pane.x + pane.width / 2,
							handle.y + handle.height / 2,
						),
						along: await ownerAt(
							page,
							handle.x + handle.width / 2,
							handle.y + handle.height / 2,
						),
					}
				: {
						across: await ownerAt(
							page,
							handle.x + handle.width / 2,
							pane.y + pane.height / 2,
						),
						along: await ownerAt(
							page,
							handle.x + handle.width / 2,
							handle.y + handle.height / 2,
						),
					};
		};

		const settled = await probe();
		expect(settled.across.separator).toBe(false);
		expect(settled.across.paneId).toBe(undividedId);
		expect(settled.along.separator).toBe(true);

		// The extent follows the current geometry of the other axis rather than a
		// fixed half, so moving that axis must not strand it.
		const other = page.getByRole("separator", {
			name:
				axis === "row"
					? copy.workspace.resizeColumns
					: copy.workspace.resizeRows,
		});
		await other.focus();
		for (let press = 0; press < 5; press += 1) {
			await page.keyboard.press(axis === "row" ? "ArrowLeft" : "ArrowUp");
		}
		await expect(other).not.toHaveAttribute("aria-valuenow", "50");

		const moved = await probe();
		expect(moved.across.separator).toBe(false);
		expect(moved.across.paneId).toBe(undividedId);
		expect(moved.along.separator).toBe(true);
	});
}

test("the partial divider still drags its own boundary and reports it", async ({
	page,
	tabelo,
}) => {
	await tabelo.chooseLayout("left-split");
	const rows = page.getByRole("separator", { name: copy.workspace.resizeRows });
	await expect(rows).toHaveAttribute("aria-valuenow", "50");
	await expect(rows).toHaveAttribute("aria-valuemin", "15");
	await expect(rows).toHaveAttribute("aria-valuemax", "85");

	const start = box(await rows.boundingBox());
	await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
	await page.mouse.down();
	await page.mouse.move(
		start.x + start.width / 2,
		start.y + start.height / 2 + 120,
		{ steps: 8 },
	);
	await page.mouse.up();

	// Direction, not distance: dragging down gives the upper pane more room.
	await expect
		.poll(async () => Number(await rows.getAttribute("aria-valuenow")))
		.toBeGreaterThan(50);

	await rows.focus();
	const dragged = Number(await rows.getAttribute("aria-valuenow"));
	await page.keyboard.press("ArrowUp");
	await expect
		.poll(async () => Number(await rows.getAttribute("aria-valuenow")))
		.toBeLessThan(dragged);
});
