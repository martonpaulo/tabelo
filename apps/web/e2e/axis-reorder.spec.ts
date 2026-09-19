import type { Locator, Page } from "@playwright/test";
import { samplePeopleCsv } from "@/core/sample-data";
import { expect, test } from "./fixtures";
import type { TabeloPage } from "./helpers";

// Reordering by pointer, beside the keyboard path rather than instead of it.
// There is no grip (#288): the row number and the column letter carry both
// gestures, and the selection decides which. A press on a label outside the
// selection selects and drag-selects along the axis; a press on one inside it
// picks the selected block up to move it. These cover both, and the gestures
// that must never turn into a move.

const roster = ["Ingrid", "Paulo", "Mabel", "Felix", "Amora"];

async function seedRoster(tabelo: TabeloPage): Promise<void> {
	await tabelo.paste(samplePeopleCsv(5).replaceAll(",", "\t"));
	await tabelo.dismissNotices();
	// One ordinary cell, so no row or column starts out selected.
	await tabelo.cell(1, 2).click();
}

// The one control on a row's gutter cell or a column's strip cell. Numbered as
// the gutter and the strip show them: row 1 is the header row.
function label(
	tabelo: TabeloPage,
	axis: "row" | "column",
	index: number,
): Locator {
	const cell =
		axis === "row" ? tabelo.rowIndex(index) : tabelo.columnIndex(index);
	return cell.getByRole("button");
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

async function cursorOf(target: Locator): Promise<string> {
	return target.evaluate((element) => getComputedStyle(element).cursor);
}

test("dragging a selected row's number moves it to the gap it was dropped in", async ({
	page,
	tabelo,
}) => {
	await seedRoster(tabelo);
	expect(await firstColumn(tabelo, 5)).toEqual(roster);

	// Row 2 is the first data row; dropping past row 4 puts it third.
	await label(tabelo, "row", 2).click();
	await dragFrom(page, label(tabelo, "row", 2), () =>
		gapPoint(tabelo, "row", 4, "after"),
	);

	await expect
		.poll(() => firstColumn(tabelo, 5))
		.toEqual(["Paulo", "Mabel", "Ingrid", "Felix", "Amora"]);
});

test("dragging one row of a selected block moves the whole block", async ({
	page,
	tabelo,
}) => {
	await seedRoster(tabelo);

	await label(tabelo, "row", 2).click();
	await label(tabelo, "row", 3).click({ modifiers: ["Shift"] });

	await dragFrom(page, label(tabelo, "row", 3), () =>
		gapPoint(tabelo, "row", 6, "after"),
	);

	// Both rows moved, in their original order relative to each other.
	await expect
		.poll(() => firstColumn(tabelo, 5))
		.toEqual(["Mabel", "Felix", "Amora", "Ingrid", "Paulo"]);
});

test("a block move is one history step", async ({ page, tabelo }) => {
	await seedRoster(tabelo);

	await label(tabelo, "row", 2).click();
	await label(tabelo, "row", 3).click({ modifiers: ["Shift"] });
	await dragFrom(page, label(tabelo, "row", 3), () =>
		gapPoint(tabelo, "row", 6, "after"),
	);
	await expect
		.poll(() => firstColumn(tabelo, 5))
		.toEqual(["Mabel", "Felix", "Amora", "Ingrid", "Paulo"]);

	await tabelo.runAppCommand("undo");

	await expect.poll(() => firstColumn(tabelo, 5)).toEqual(roster);
});

test("the drop indicator marks the pending gap and leaves on drop", async ({
	page,
	tabelo,
}) => {
	await seedRoster(tabelo);
	await expect(indicator(tabelo)).toHaveCount(0);

	await label(tabelo, "row", 2).click();
	await dragFrom(
		page,
		label(tabelo, "row", 2),
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

	await label(tabelo, "row", 2).click();
	await dragFrom(
		page,
		label(tabelo, "row", 2),
		() => gapPoint(tabelo, "row", 5, "after"),
		{ drop: false },
	);
	await expect(indicator(tabelo)).toHaveCount(1);

	await page.keyboard.press("Escape");
	await expect(indicator(tabelo)).toHaveCount(0);

	// The pointer is still down. Releasing it must not commit the cancelled
	// gesture either.
	await page.mouse.up();
	expect(await firstColumn(tabelo, 5)).toEqual(roster);
});

test("a press on a selected row that never crosses the threshold selects that row alone", async ({
	page,
	tabelo,
}) => {
	await seedRoster(tabelo);
	await label(tabelo, "row", 2).click();
	await label(tabelo, "row", 3).click({ modifiers: ["Shift"] });

	const start = await centre(label(tabelo, "row", 2));
	await page.mouse.move(start.x, start.y);
	await page.mouse.down();
	// Below the promotion threshold, so this stays a press.
	await page.mouse.move(start.x, start.y + 2);
	await expect(indicator(tabelo)).toHaveCount(0);
	await page.mouse.up();

	expect(await firstColumn(tabelo, 5)).toEqual(roster);
	// A click, like a click on any other label: the row it landed on, alone.
	await expect(tabelo.cell(1, 1)).toHaveAttribute("aria-selected", "true");
	await expect(tabelo.cell(2, 1)).toHaveAttribute("aria-selected", "false");
});

test("dragging a selected column's letter moves that column", async ({
	page,
	tabelo,
}) => {
	await seedRoster(tabelo);
	expect(await headers(tabelo, 4)).toEqual(["name", "city", "role", "age"]);

	await label(tabelo, "column", 1).click();
	await dragFrom(page, label(tabelo, "column", 1), () =>
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

	await label(tabelo, "row", 2).click();
	await dragFrom(page, label(tabelo, "row", 2), () =>
		gapPoint(tabelo, "row", 4, "after"),
	);
	const dragged = await firstColumn(tabelo, 5);

	await tabelo.runAppCommand("undo");
	await expect.poll(() => firstColumn(tabelo, 5)).toEqual(roster);

	// The same block, the same destination, through the accessible path.
	await tabelo.cell(1, 1).click();
	await page.keyboard.press("Alt+ArrowDown");
	await page.keyboard.press("Alt+ArrowDown");

	await expect.poll(() => firstColumn(tabelo, 5)).toEqual(dragged);
});

test("dragging an unselected row number drag-selects and moves nothing", async ({
	page,
	tabelo,
}) => {
	await seedRoster(tabelo);

	await dragFrom(page, label(tabelo, "row", 2), () =>
		centre(label(tabelo, "row", 4)),
	);

	// The gesture extends the selection and leaves the document exactly as it
	// was.
	expect(await firstColumn(tabelo, 5)).toEqual(roster);
	for (const row of [1, 2, 3]) {
		await expect(tabelo.cell(row, 1)).toHaveAttribute("aria-selected", "true");
	}
});

test("dragging an unselected column letter drag-selects and moves nothing", async ({
	page,
	tabelo,
}) => {
	await seedRoster(tabelo);

	await dragFrom(page, label(tabelo, "column", 1), () =>
		centre(label(tabelo, "column", 3)),
	);

	expect(await headers(tabelo, 4)).toEqual(["name", "city", "role", "age"]);
	for (const column of [1, 2, 3]) {
		await expect(tabelo.header(column)).toHaveAttribute(
			"aria-selected",
			"true",
		);
	}
});

test("Shift+drag on a selected row extends the selection and never reorders", async ({
	page,
	tabelo,
}) => {
	await seedRoster(tabelo);
	await label(tabelo, "row", 2).click();
	await label(tabelo, "row", 3).click({ modifiers: ["Shift"] });

	await page.keyboard.down("Shift");
	await dragFrom(page, label(tabelo, "row", 3), () =>
		gapPoint(tabelo, "row", 6, "after"),
	);
	await page.keyboard.up("Shift");

	await expect(indicator(tabelo)).toHaveCount(0);
	expect(await firstColumn(tabelo, 5)).toEqual(roster);
	await expect(tabelo.cell(1, 1)).toHaveAttribute("aria-selected", "true");
	await expect(tabelo.cell(2, 1)).toHaveAttribute("aria-selected", "true");
});

test("the label cursor says which gesture a press will make", async ({
	tabelo,
}) => {
	await seedRoster(tabelo);

	// At rest a label selects.
	expect(await cursorOf(label(tabelo, "row", 2))).toBe("pointer");
	expect(await cursorOf(label(tabelo, "column", 1))).toBe("pointer");

	// Once its row or column is in the selection, a press picks it up.
	await label(tabelo, "row", 2).click();
	expect(await cursorOf(label(tabelo, "row", 2))).toBe("grab");
	expect(await cursorOf(label(tabelo, "row", 3))).toBe("pointer");

	await label(tabelo, "column", 1).click();
	expect(await cursorOf(label(tabelo, "column", 1))).toBe("grab");
	expect(await cursorOf(label(tabelo, "row", 2))).toBe("pointer");
});

test("the column resize handle still resizes instead of reordering", async ({
	page,
	tabelo,
}) => {
	await seedRoster(tabelo);
	// Selected, so the letter beside the handle would move if it took the press.
	await label(tabelo, "column", 1).click();

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

test("a touch pointer on a selected row does not start a reorder", async ({
	tabelo,
}) => {
	await seedRoster(tabelo);
	await label(tabelo, "row", 2).click();

	// Touch keeps native pane scrolling, so the label ignores it as a reorder
	// and the keyboard and menu paths remain the way to reorder there.
	const target = label(tabelo, "row", 2);
	await target.dispatchEvent("pointerdown", {
		pointerId: 1,
		pointerType: "touch",
		button: 0,
		buttons: 1,
		clientX: 0,
		clientY: 0,
	});
	await target.dispatchEvent("pointermove", {
		pointerId: 1,
		pointerType: "touch",
		clientX: 0,
		clientY: 200,
	});
	await target.dispatchEvent("pointerup", {
		pointerId: 1,
		pointerType: "touch",
	});

	await expect(indicator(tabelo)).toHaveCount(0);
	expect(await firstColumn(tabelo, 5)).toEqual(roster);
});
