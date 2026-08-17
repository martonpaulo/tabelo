import type { Locator, Page } from "@playwright/test";
import { copy } from "@/copy/copy";
import { expect, test } from "./fixtures";
import type { TabeloPage } from "./helpers";

const modifier = process.platform === "darwin" ? "Meta" : "Control";

interface Point {
	readonly x: number;
	readonly y: number;
}

async function centre(target: Locator): Promise<Point> {
	const box = await target.boundingBox();
	if (!box) throw new Error("The fill target is not rendered.");
	return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

function fillHandle(tabelo: TabeloPage): Locator {
	return tabelo.pane("grid").getByRole("button", {
		name: copy.a11y.fillHandle,
	});
}

function fillPreview(tabelo: TabeloPage): Locator {
	return tabelo.pane("grid").locator("[data-fill-preview]");
}

async function selectRectangle(
	page: Page,
	tabelo: TabeloPage,
	rows: number,
	columns: number,
): Promise<void> {
	await tabelo.cell(1, 1).click();
	for (let column = 1; column < columns; column += 1) {
		await page.keyboard.press("Shift+ArrowRight");
	}
	for (let row = 1; row < rows; row += 1) {
		await page.keyboard.press("Shift+ArrowDown");
	}
}

test("keyboard fill is one undoable synchronized document step", async ({
	page,
	tabelo,
}) => {
	await tabelo.paste("A\tB\tC\na\tb\tx\nc\td\ty\n\t\t");
	await selectRectangle(page, tabelo, 2, 2);
	const selectionAnnouncement = await tabelo.announcements.textContent();

	await page.keyboard.press("ControlOrMeta+Alt+ArrowDown");

	await expect(tabelo.cell(3, 1)).toHaveText("a");
	await expect(tabelo.cell(3, 2)).toHaveText("b");
	await expect
		.poll(() => tabelo.announcements.textContent())
		.not.toBe(selectionAnnouncement);
	await expect
		.poll(
			async () =>
				((await tabelo.source("markdown").textContent()) ?? "").match(
					/\| a\s+\| b\s+\|/g,
				)?.length ?? 0,
		)
		.toBe(2);

	await tabelo.runAppCommand("undo");
	await expect(tabelo.cell(3, 1)).toHaveText("");
	await expect(tabelo.cell(3, 2)).toHaveText("");
});

test("all four keyboard fill commands extend in their requested direction", async ({
	page,
	tabelo,
}) => {
	await tabelo.paste(
		"A\tB\tC\nup-left\tup\tup-right\nleft\tseed\tright\ndown-left\tdown\tdown-right",
	);
	const cases = [
		["ArrowUp", 1, 2, "up"],
		["ArrowDown", 3, 2, "down"],
		["ArrowLeft", 2, 1, "left"],
		["ArrowRight", 2, 3, "right"],
	] as const;

	for (const [arrow, row, column, original] of cases) {
		await tabelo.cell(2, 2).click();
		await page.keyboard.press(`ControlOrMeta+Alt+${arrow}`);
		await expect(tabelo.cell(row, column)).toHaveText("seed");
		await tabelo.runAppCommand("undo");
		await expect(tabelo.cell(row, column)).toHaveText(original);
	}
});

test("the fill handle previews, cancels, and repeats opaque values by pointer", async ({
	page,
	tabelo,
}) => {
	await tabelo.paste("Code\tNote\n007\ta|b\nother\tvalue\n\t");
	await tabelo.cell(1, 1).click();
	await tabelo.runPaneCommand("grid", "zoomIn");
	await page.keyboard.press("Escape");
	await expect(page.getByRole("menu")).toBeHidden();

	const handle = fillHandle(tabelo);
	await expect(handle).toBeVisible();
	const targetSize = await handle.evaluate((element) => {
		const root = Number.parseFloat(
			getComputedStyle(document.documentElement).fontSize,
		);
		const box = element.getBoundingClientRect();
		return { width: box.width / root, height: box.height / root };
	});
	expect(targetSize.width).toBeGreaterThanOrEqual(1.75);
	expect(targetSize.height).toBeGreaterThanOrEqual(1.75);

	const start = await centre(handle);
	const destinationCell = await centre(tabelo.cell(3, 1));
	const destination = { x: start.x, y: destinationCell.y };
	await page.mouse.move(start.x, start.y);
	await page.mouse.down();
	await page.mouse.move(destination.x, destination.y, { steps: 12 });
	await expect(fillPreview(tabelo)).toHaveAttribute(
		"data-fill-preview",
		"0:0:2:0",
	);

	await page.keyboard.press("Escape");
	await expect(fillPreview(tabelo)).toHaveCount(0);
	await page.mouse.up();
	await expect(tabelo.cell(2, 1)).toHaveText("other");
	await expect(tabelo.cell(3, 1)).toHaveText("");

	const cancelHandle = fillHandle(tabelo);
	await cancelHandle.evaluate((element) => {
		element.addEventListener(
			"pointerdown",
			(event) => {
				element.dataset.testPointerId = String(
					(event as PointerEvent).pointerId,
				);
			},
			{ once: true },
		);
	});
	const cancelled = await centre(cancelHandle);
	await page.mouse.move(cancelled.x, cancelled.y);
	await page.mouse.down();
	await page.mouse.move(destination.x, destination.y, { steps: 12 });
	const pointerId = Number(
		await cancelHandle.getAttribute("data-test-pointer-id"),
	);
	await page.evaluate((activePointerId) => {
		window.dispatchEvent(
			new PointerEvent("pointercancel", { pointerId: activePointerId }),
		);
	}, pointerId);
	await expect(fillPreview(tabelo)).toHaveCount(0);
	await page.mouse.up();
	await expect(tabelo.cell(2, 1)).toHaveText("other");
	await expect(tabelo.cell(3, 1)).toHaveText("");

	const restarted = await centre(fillHandle(tabelo));
	await page.mouse.move(restarted.x, restarted.y);
	await page.mouse.down();
	await page.mouse.move(destination.x, destination.y, { steps: 12 });
	await page.mouse.up();
	await expect(tabelo.cell(2, 1)).toHaveText("007");
	await expect(tabelo.cell(3, 1)).toHaveText("007");
});

test("header and multiarea fill commands stay visible with a reason", async ({
	page,
	tabelo,
}) => {
	await tabelo.header(1).click({ button: "right" });
	let menu = page.getByRole("menu");
	let fillDown = menu.getByRole("menuitem", { name: copy.actions.fillDown });
	await expect(fillDown).toBeDisabled();
	await fillDown.hover();
	await expect(page.getByRole("tooltip")).toBeVisible();
	await page.keyboard.press("Escape");
	await page.keyboard.press("Escape");
	await expect(menu).toBeHidden();

	await tabelo.cell(1, 1).click();
	await tabelo.cell(3, 3).click({ modifiers: [modifier] });
	await tabelo.cell(3, 3).click({ button: "right" });
	menu = page.getByRole("menu");
	fillDown = menu.getByRole("menuitem", { name: copy.actions.fillDown });
	await expect(fillDown).toBeDisabled();
	await fillDown.hover();
	await expect(page.getByRole("tooltip")).toBeVisible();
	await expect(fillHandle(tabelo)).toHaveCount(0);
});

test("fill autoscroll remains usable with reduced motion", async ({
	page,
	tabelo,
}) => {
	const columns = Array.from(
		{ length: 10 },
		(_, index) => `Column ${index + 1}`,
	);
	const rows = [
		columns,
		columns.map((_, index) => (index === 0 ? "seed" : `first ${index + 1}`)),
		...Array.from({ length: 39 }, (_, row) =>
			columns.map((_, column) => `${row + 2}:${column + 1}`),
		),
	];
	await tabelo.paste(rows.map((row) => row.join("\t")).join("\n"));
	await page.emulateMedia({ reducedMotion: "reduce" });
	await tabelo.cell(1, 1).click();

	const scroller = tabelo.pane("grid").locator('[data-slot="panel-body"]');
	const scrollerBox = await scroller.boundingBox();
	if (!scrollerBox) throw new Error("The grid scrollport is not rendered.");
	const start = await centre(fillHandle(tabelo));
	await page.mouse.move(start.x, start.y);
	await page.mouse.down();
	await page.mouse.move(start.x, scrollerBox.y + scrollerBox.height + 8, {
		steps: 12,
	});
	await expect
		.poll(() => scroller.evaluate((element) => element.scrollTop))
		.toBeGreaterThan(0);
	await expect(fillPreview(tabelo)).toBeVisible();
	const target = await fillPreview(tabelo).getAttribute("data-fill-preview");
	const bottom = Number(target?.split(":")[2]);
	expect(bottom).toBeGreaterThan(0);
	await page.mouse.up();
	await expect(tabelo.cell(bottom + 1, 1)).toHaveText("seed");

	await tabelo.runAppCommand("undo");
	await tabelo.cell(1, 1).click();
	await scroller.evaluate((element) => {
		element.scrollTop = 0;
		element.scrollLeft = 0;
	});
	const horizontalStart = await centre(fillHandle(tabelo));
	await page.mouse.move(horizontalStart.x, horizontalStart.y);
	await page.mouse.down();
	await page.mouse.move(
		scrollerBox.x + scrollerBox.width + 8,
		horizontalStart.y,
		{ steps: 12 },
	);
	await expect
		.poll(() => scroller.evaluate((element) => element.scrollLeft))
		.toBeGreaterThan(0);
	const horizontalTarget =
		await fillPreview(tabelo).getAttribute("data-fill-preview");
	const right = Number(horizontalTarget?.split(":")[3]);
	expect(right).toBeGreaterThan(0);
	await page.mouse.up();
	await expect(tabelo.cell(1, right + 1)).toHaveText("seed");
});
