import { copy } from "@/copy/copy";
import { expect, test } from "./fixtures";

function largeTable(rows = 80, columns = 12): string {
	const header = Array.from(
		{ length: columns },
		(_, column) => `Column ${column + 1}`,
	);
	return [
		header.join("\t"),
		...Array.from({ length: rows }, (_, row) =>
			header.map((_, column) => `${row + 1}:${column + 1}`).join("\t"),
		),
	].join("\n");
}

async function nextTwoAnimationFrames(page: import("@playwright/test").Page) {
	await page.evaluate(
		() =>
			new Promise<void>((resolve) => {
				requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
			}),
	);
}

test("every scroll boundary prevents scroll chaining on both axes", async ({
	page,
	tabelo,
}) => {
	await expect(page.locator("html")).toHaveCSS("overscroll-behavior", "none");
	await expect(page.locator("body")).toHaveCSS("overscroll-behavior", "none");
	await expect(tabelo.workspace).toHaveCSS("overscroll-behavior", "contain");

	const paneBodies = tabelo.workspace.locator('[data-slot="panel-body"]');
	await expect(paneBodies).toHaveCount(2);
	for (const paneBody of await paneBodies.all()) {
		await expect(paneBody).toHaveCSS("overscroll-behavior", "contain");
	}

	await expect(tabelo.workspace.locator(".cm-scroller")).toHaveCSS(
		"overscroll-behavior",
		"contain",
	);

	const dialog = await tabelo.openChangeViewDialog("markdown");
	// Choice dialogs expand to their complete content. They are deliberately not
	// scroll boundaries, so no incidental scrollbar can appear beside actions.
	await expect(dialog).toHaveCSS("overflow-y", "visible");
	await dialog
		.getByRole("radio", { name: copy.views["html-preview"].label })
		.click();
	await dialog.getByRole("button", { name: copy.workspace.changeView }).click();
	await expect(
		tabelo.workspace.locator('[data-slot="preview-scroller"]'),
	).toHaveCSS("overscroll-behavior", "contain");

	await page.setViewportSize({ width: 600, height: 700 });
	await expect(tabelo.workspace).toHaveCSS("overflow-y", "auto");
	await expect(tabelo.workspace).toHaveCSS("overscroll-behavior", "contain");
});

test("wheel input at a pane boundary does not move its parent or the page", async ({
	browserName,
	page,
	tabelo,
}) => {
	// Firefox WebDriver wheel actions can collapse into one APZ transaction:
	// https://bugzilla.mozilla.org/show_bug.cgi?id=1918806
	test.skip(
		browserName === "firefox",
		"Firefox WebDriver wheel transactions cannot reliably exercise this boundary.",
	);

	const columns = Array.from(
		{ length: 20 },
		(_, index) => `Column ${index + 1}`,
	);
	const row = columns.map((_, index) => `Value ${index + 1}`);
	const source = [
		columns.join("\t"),
		...Array.from({ length: 200 }, () => row.join("\t")),
	].join("\n");

	await tabelo.paste(source);
	await expect(tabelo.grid()).toHaveAttribute("aria-rowcount", "201");
	await page.setViewportSize({ width: 600, height: 700 });

	const paneScroller = tabelo.pane("grid").locator('[data-slot="panel-body"]');
	await expect
		.poll(() =>
			paneScroller.evaluate(
				(element) =>
					element.scrollHeight > element.clientHeight &&
					element.scrollWidth > element.clientWidth,
			),
		)
		.toBe(true);

	await paneScroller.evaluate((element) => {
		element.scrollTop = element.scrollHeight;
		element.scrollLeft = element.scrollWidth;
	});
	await expect
		.poll(() =>
			paneScroller.evaluate(
				(element) =>
					element.scrollTop === element.scrollHeight - element.clientHeight &&
					element.scrollLeft === element.scrollWidth - element.clientWidth,
			),
		)
		.toBe(true);
	await paneScroller.hover();
	const workspaceBeforeWheel = await tabelo.workspace.evaluate((workspace) => ({
		left: workspace.scrollLeft,
		top: workspace.scrollTop,
	}));
	await page.mouse.wheel(0, 1_000);

	await expect
		.poll(() =>
			tabelo.workspace.evaluate((workspace) => ({
				left: workspace.scrollLeft,
				top: workspace.scrollTop,
			})),
		)
		.toEqual(workspaceBeforeWheel);
	await expect
		.poll(() => page.evaluate(() => ({ left: scrollX, top: scrollY })))
		.toEqual({ left: 0, top: 0 });
});

test("dragging cells beyond the pane autoscrolls both axes and stops at the table edge", async ({
	page,
	tabelo,
}) => {
	await tabelo.paste(largeTable(40));
	const scroller = tabelo.pane("grid").locator('[data-slot="panel-body"]');
	const scrollerBox = await scroller.boundingBox();
	expect(scrollerBox).not.toBeNull();

	const start = await tabelo.cell(2, 2).boundingBox();
	expect(start).not.toBeNull();
	await page.mouse.move(
		(start?.x ?? 0) + (start?.width ?? 0) / 2,
		(start?.y ?? 0) + (start?.height ?? 0) / 2,
	);
	await page.mouse.down();
	await page.mouse.move(
		(start?.x ?? 0) + (start?.width ?? 0) / 2,
		(scrollerBox?.y ?? 0) + (scrollerBox?.height ?? 0) + 8,
	);
	await expect
		.poll(() =>
			scroller.evaluate(
				(element) =>
					element.scrollTop === element.scrollHeight - element.clientHeight,
			),
		)
		.toBe(true);
	await expect(tabelo.cell(40, 2)).toHaveAttribute("aria-selected", "true");
	await page.mouse.up();

	await scroller.evaluate((element) => {
		element.scrollTop = 0;
		element.scrollLeft = 0;
	});
	await tabelo.cell(2, 2).click();
	const horizontalStart = await tabelo.cell(2, 2).boundingBox();
	expect(horizontalStart).not.toBeNull();
	await page.mouse.move(
		(horizontalStart?.x ?? 0) + (horizontalStart?.width ?? 0) / 2,
		(horizontalStart?.y ?? 0) + (horizontalStart?.height ?? 0) / 2,
	);
	await page.mouse.down();
	await page.mouse.move(
		(scrollerBox?.x ?? 0) + (scrollerBox?.width ?? 0) + 8,
		(horizontalStart?.y ?? 0) + (horizontalStart?.height ?? 0) / 2,
	);
	await expect
		.poll(() => scroller.evaluate((element) => element.scrollLeft))
		.toBeGreaterThan(0);
	await expect
		.poll(() =>
			tabelo.grid().locator('[role="gridcell"][aria-selected="true"]').count(),
		)
		.toBeGreaterThan(1);
	await page.mouse.up();
	const stoppedLeft = await scroller.evaluate((element) => element.scrollLeft);
	await nextTwoAnimationFrames(page);
	await expect
		.poll(() => scroller.evaluate((element) => element.scrollLeft))
		.toBe(stoppedLeft);
});

test("row and column drags share autoscroll and reduced motion keeps it usable", async ({
	page,
	tabelo,
}) => {
	await tabelo.paste(largeTable());
	const scroller = tabelo.pane("grid").locator('[data-slot="panel-body"]');
	const scrollerBox = await scroller.boundingBox();
	expect(scrollerBox).not.toBeNull();

	const column = await tabelo
		.columnIndex(2)
		.getByRole("button")
		.first()
		.boundingBox();
	expect(column).not.toBeNull();
	await page.mouse.move(
		(column?.x ?? 0) + (column?.width ?? 0) / 2,
		(column?.y ?? 0) + (column?.height ?? 0) / 2,
	);
	await page.mouse.down();
	await page.mouse.move(
		(scrollerBox?.x ?? 0) + (scrollerBox?.width ?? 0) + 8,
		(column?.y ?? 0) + (column?.height ?? 0) / 2,
	);
	await expect
		.poll(() => scroller.evaluate((element) => element.scrollLeft))
		.toBeGreaterThan(0);
	await expect
		.poll(() => tabelo.header(3).getAttribute("aria-selected"))
		.toBe("true");
	await page.evaluate(() => window.dispatchEvent(new Event("blur")));
	const stoppedLeft = await scroller.evaluate((element) => element.scrollLeft);
	await nextTwoAnimationFrames(page);
	await expect
		.poll(() => scroller.evaluate((element) => element.scrollLeft))
		.toBe(stoppedLeft);
	await page.mouse.up();

	await page.emulateMedia({ reducedMotion: "reduce" });
	await scroller.evaluate((element) => {
		element.scrollTop = 0;
		element.scrollLeft = 0;
	});
	const row = await tabelo
		.rowIndex(2)
		.getByRole("button")
		.first()
		.boundingBox();
	expect(row).not.toBeNull();
	await page.mouse.move(
		(row?.x ?? 0) + (row?.width ?? 0) / 2,
		(row?.y ?? 0) + (row?.height ?? 0) / 2,
	);
	await page.mouse.down();
	await page.mouse.move(
		(row?.x ?? 0) + (row?.width ?? 0) / 2,
		(scrollerBox?.y ?? 0) + (scrollerBox?.height ?? 0) + 8,
	);
	await expect
		.poll(() => scroller.evaluate((element) => element.scrollTop))
		.toBeGreaterThan(0);
	await expect
		.poll(() =>
			tabelo.grid().locator('[role="gridcell"][aria-selected="true"]').count(),
		)
		.toBeGreaterThan(12);
	await page.evaluate(() =>
		window.dispatchEvent(new PointerEvent("pointercancel")),
	);
	const stoppedTop = await scroller.evaluate((element) => element.scrollTop);
	await nextTwoAnimationFrames(page);
	await expect
		.poll(() => scroller.evaluate((element) => element.scrollTop))
		.toBe(stoppedTop);
	await page.mouse.up();
});
