import type { Locator, Page } from "@playwright/test";
import { copy } from "@/copy/copy";
import { samplePeopleCsv } from "@/core/sample-data";
import { expect, test } from "./fixtures";
import type { TabeloPage } from "./helpers";

// Reordering by pointer, beside the keyboard path rather than instead of it.
// The grip is its own target: the number and the letter next to it still own
// selection, including drag-select along the axis, so these cover both the new
// gesture and the gestures it sits between.

async function seedRoster(tabelo: TabeloPage): Promise<void> {
	await tabelo.paste(samplePeopleCsv(5).replaceAll(",", "\t"));
	await tabelo.dismissNotices();
}

function grip(tabelo: TabeloPage, axis: "row" | "column", index: number) {
	return tabelo.grid().locator(`[data-reorder-grip="${axis}:${index}"]`);
}

function indicator(tabelo: TabeloPage): Locator {
	return tabelo.pane("grid").locator("[data-drop-indicator]");
}

interface Point {
	readonly x: number;
	readonly y: number;
}

async function centre(target: Locator): Promise<Point> {
	const box = await target.boundingBox();
	if (!box) throw new Error("The drag target is not rendered.");
	return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

// The gap a drop names, expressed as a point: the far half of a row or column
// is the gap after it, and the near half the gap before it.
async function gapPoint(
	tabelo: TabeloPage,
	axis: "row" | "column",
	// Numbered as the gutter and the strip show them: row 1 is the header row.
	index: number,
	side: "before" | "after",
): Promise<Point> {
	const target =
		axis === "row" ? tabelo.rowIndex(index) : tabelo.columnIndex(index);
	const box = await target.boundingBox();
	if (!box) throw new Error("The drop target is not rendered.");
	const fraction = side === "before" ? 0.25 : 0.75;
	return axis === "row"
		? { x: box.x + box.width / 2, y: box.y + box.height * fraction }
		: { x: box.x + box.width * fraction, y: box.y + box.height / 2 };
}

// The press goes through `hover`, so Playwright's own actionability and
// stability checks decide when the handle is ready, and the destination is
// measured only once the pointer is already down. Reading either coordinate
// earlier lets a late reflow move the target out from under a number that was
// correct when it was taken.
//
// Enough steps that the gesture crosses the promotion threshold before it
// arrives, which is what a real pointer does and what the state machine is
// built around.
async function dragFrom(
	page: Page,
	handle: Locator,
	destination: () => Promise<Point>,
	options: { readonly drop?: boolean } = {},
): Promise<void> {
	await handle.hover();
	await page.mouse.down();
	const to = await destination();
	await page.mouse.move(to.x, to.y, { steps: 12 });
	if (options.drop !== false) await page.mouse.up();
}

async function firstColumn(
	tabelo: TabeloPage,
	rows: number,
): Promise<string[]> {
	const values: string[] = [];
	for (let row = 1; row <= rows; row += 1) {
		values.push(((await tabelo.cell(row, 1).innerText()) ?? "").trim());
	}
	return values;
}

async function headers(tabelo: TabeloPage, columns: number): Promise<string[]> {
	const values: string[] = [];
	for (let column = 1; column <= columns; column += 1) {
		values.push(((await tabelo.header(column).innerText()) ?? "").trim());
	}
	return values;
}

test("dragging a row grip moves that row to the gap it was dropped in", async ({
	page,
	tabelo,
}) => {
	await seedRoster(tabelo);
	expect(await firstColumn(tabelo, 5)).toEqual([
		"Ingrid",
		"Paulo",
		"Mabel",
		"Felix",
		"Amora",
	]);

	// Row 2 is the first data row; dropping past row 4 puts it third.
	await dragFrom(page, grip(tabelo, "row", 0), () =>
		gapPoint(tabelo, "row", 4, "after"),
	);

	await expect
		.poll(() => firstColumn(tabelo, 5))
		.toEqual(["Paulo", "Mabel", "Ingrid", "Felix", "Amora"]);
});

test("dragging one grip of a selected block moves the whole block", async ({
	page,
	tabelo,
}) => {
	await seedRoster(tabelo);

	const selectRow = (row: number) =>
		tabelo
			.rowIndex(row)
			.getByRole("button", { name: new RegExp(`^${copy.actions.selectRow}:`) });
	await selectRow(2).click();
	await selectRow(3).click({ modifiers: ["Shift"] });

	await dragFrom(page, grip(tabelo, "row", 1), () =>
		gapPoint(tabelo, "row", 6, "after"),
	);

	// Both rows moved, in their original order relative to each other.
	await expect
		.poll(() => firstColumn(tabelo, 5))
		.toEqual(["Mabel", "Felix", "Amora", "Ingrid", "Paulo"]);
});

test("a block move is one history step", async ({ page, tabelo }) => {
	await seedRoster(tabelo);

	const selectRow = (row: number) =>
		tabelo
			.rowIndex(row)
			.getByRole("button", { name: new RegExp(`^${copy.actions.selectRow}:`) });
	await selectRow(2).click();
	await selectRow(3).click({ modifiers: ["Shift"] });
	await dragFrom(page, grip(tabelo, "row", 1), () =>
		gapPoint(tabelo, "row", 6, "after"),
	);
	await expect
		.poll(() => firstColumn(tabelo, 5))
		.toEqual(["Mabel", "Felix", "Amora", "Ingrid", "Paulo"]);

	await tabelo.runAppCommand("undo");

	await expect
		.poll(() => firstColumn(tabelo, 5))
		.toEqual(["Ingrid", "Paulo", "Mabel", "Felix", "Amora"]);
});

test("the drop indicator marks the pending gap and leaves on drop", async ({
	page,
	tabelo,
}) => {
	await seedRoster(tabelo);
	await expect(indicator(tabelo)).toHaveCount(0);

	await dragFrom(
		page,
		grip(tabelo, "row", 0),
		() => gapPoint(tabelo, "row", 4, "after"),
		{ drop: false },
	);

	await expect(indicator(tabelo)).toHaveAttribute("data-drop-indicator", "row");

	await page.mouse.up();
	await expect(indicator(tabelo)).toHaveCount(0);
});

test("Escape during a drag leaves the document and the indicator alone", async ({
	page,
	tabelo,
}) => {
	await seedRoster(tabelo);

	await dragFrom(
		page,
		grip(tabelo, "row", 0),
		() => gapPoint(tabelo, "row", 5, "after"),
		{ drop: false },
	);
	await expect(indicator(tabelo)).toHaveCount(1);

	await page.keyboard.press("Escape");
	await expect(indicator(tabelo)).toHaveCount(0);

	// The pointer is still down. Releasing it must not commit the cancelled
	// gesture either.
	await page.mouse.up();
	expect(await firstColumn(tabelo, 5)).toEqual([
		"Ingrid",
		"Paulo",
		"Mabel",
		"Felix",
		"Amora",
	]);
});

test("a press that never crosses the threshold reorders nothing", async ({
	page,
	tabelo,
}) => {
	await seedRoster(tabelo);

	const start = await centre(grip(tabelo, "row", 0));
	await page.mouse.move(start.x, start.y);
	await page.mouse.down();
	// Below the promotion threshold, so this stays a press.
	await page.mouse.move(start.x, start.y + 2);
	await expect(indicator(tabelo)).toHaveCount(0);
	await page.mouse.up();

	expect(await firstColumn(tabelo, 5)).toEqual([
		"Ingrid",
		"Paulo",
		"Mabel",
		"Felix",
		"Amora",
	]);
	// The press still selected the row it landed on, which is what makes a
	// mis-aimed grab harmless rather than surprising.
	await expect(tabelo.cell(1, 1)).toHaveAttribute("aria-selected", "true");
});

test("dragging a column grip moves that column", async ({ page, tabelo }) => {
	await seedRoster(tabelo);
	expect(await headers(tabelo, 4)).toEqual(["name", "city", "role", "age"]);

	await dragFrom(page, grip(tabelo, "column", 0), () =>
		gapPoint(tabelo, "column", 3, "after"),
	);

	await expect
		.poll(() => headers(tabelo, 4))
		.toEqual(["city", "role", "name", "age"]);
});

test("a drag and the keyboard path reach the same order", async ({
	page,
	tabelo,
}) => {
	await seedRoster(tabelo);

	await dragFrom(page, grip(tabelo, "row", 0), () =>
		gapPoint(tabelo, "row", 4, "after"),
	);
	const dragged = await firstColumn(tabelo, 5);

	await tabelo.runAppCommand("undo");
	await expect
		.poll(() => firstColumn(tabelo, 5))
		.toEqual(["Ingrid", "Paulo", "Mabel", "Felix", "Amora"]);

	// The same block, the same destination, through the accessible path.
	await tabelo.cell(1, 1).click();
	await page.keyboard.press("Alt+ArrowDown");
	await page.keyboard.press("Alt+ArrowDown");

	await expect.poll(() => firstColumn(tabelo, 5)).toEqual(dragged);
});

test("the row number still drag-selects instead of reordering", async ({
	page,
	tabelo,
}) => {
	await seedRoster(tabelo);

	const number = (row: number) =>
		tabelo
			.rowIndex(row)
			.getByRole("button", { name: new RegExp(`^${copy.actions.selectRow}:`) });
	await dragFrom(page, number(2), () => centre(number(4)));

	// The gesture on the neighbouring target extends the selection and leaves
	// the document exactly as it was.
	expect(await firstColumn(tabelo, 5)).toEqual([
		"Ingrid",
		"Paulo",
		"Mabel",
		"Felix",
		"Amora",
	]);
	for (const row of [1, 2, 3]) {
		await expect(tabelo.cell(row, 1)).toHaveAttribute("aria-selected", "true");
	}
});

test("the column resize handle still resizes instead of reordering", async ({
	page,
	tabelo,
}) => {
	await seedRoster(tabelo);

	const handle = tabelo
		.columnIndex(1)
		.locator('[aria-hidden][class*="cursor-col-resize"]');
	const before = (await tabelo.columnIndex(1).boundingBox())?.width ?? 0;

	await dragFrom(page, handle, async () => {
		const start = await centre(handle);
		return { x: start.x + 80, y: start.y };
	});

	expect(await headers(tabelo, 4)).toEqual(["name", "city", "role", "age"]);
	await expect
		.poll(async () => (await tabelo.columnIndex(1).boundingBox())?.width ?? 0)
		.toBeGreaterThan(before);
});

test("a touch pointer on a grip does not start a reorder", async ({
	tabelo,
}) => {
	await seedRoster(tabelo);

	// Touch keeps native pane scrolling, so the grip ignores it and the keyboard
	// and menu paths remain the way to reorder there.
	await grip(tabelo, "row", 0).dispatchEvent("pointerdown", {
		pointerId: 1,
		pointerType: "touch",
		button: 0,
		buttons: 1,
		clientX: 0,
		clientY: 0,
	});
	await grip(tabelo, "row", 0).dispatchEvent("pointermove", {
		pointerId: 1,
		pointerType: "touch",
		clientX: 0,
		clientY: 200,
	});
	await grip(tabelo, "row", 0).dispatchEvent("pointerup", {
		pointerId: 1,
		pointerType: "touch",
	});

	await expect(indicator(tabelo)).toHaveCount(0);
	expect(await firstColumn(tabelo, 5)).toEqual([
		"Ingrid",
		"Paulo",
		"Mabel",
		"Felix",
		"Amora",
	]);
});
