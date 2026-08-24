import type { Page } from "@playwright/test";
import { copy } from "@/copy/copy";
import { samplePeopleCsv } from "@/core/sample-data";
import { expect, test } from "./fixtures";
import type { TabeloPage } from "./helpers";

// The platform modifier as the pointer carries it. Meta on macOS, Control
// everywhere else, read from the host rather than assumed.
const modifier = process.platform === "darwin" ? "Meta" : "Control";

function columnHandle(tabelo: TabeloPage, column: number) {
	return tabelo.columnIndex(column).getByRole("button").first();
}

function rowHandle(tabelo: TabeloPage, row: number) {
	return tabelo.rowIndex(row).getByRole("button").first();
}

// The mark showing where the clipboard was filled from. Each cell declares
// which edges of the copied region it owns.
function mark(tabelo: TabeloPage, row: number, column: number) {
	return tabelo.cell(row, column).locator("[data-clipboard-source]");
}

async function columnSelected(
	tabelo: TabeloPage,
	column: number,
): Promise<boolean> {
	return (await tabelo.header(column).getAttribute("aria-selected")) === "true";
}

// The roster, so the table has four columns and enough rows for a gap to be
// visible on both axes.
async function seedRoster(tabelo: TabeloPage): Promise<void> {
	await tabelo.paste(samplePeopleCsv(3).replaceAll(",", "\t"));
	await tabelo.dismissNotices();
}

async function openCellMenu(page: Page, tabelo: TabeloPage): Promise<void> {
	await tabelo.cell(1, 1).click({ button: "right" });
	await expect(page.getByRole("menu")).toBeVisible();
}

test("the modifier adds a column to the selection and takes it away again", async ({
	tabelo,
}) => {
	await columnHandle(tabelo, 1).click();
	await columnHandle(tabelo, 3).click({ modifiers: [modifier] });

	expect(await columnSelected(tabelo, 1)).toBe(true);
	expect(await columnSelected(tabelo, 2)).toBe(false);
	expect(await columnSelected(tabelo, 3)).toBe(true);

	// Clicking the same handle again subtracts it rather than adding a second
	// copy, which is what makes the gesture a toggle.
	await columnHandle(tabelo, 3).click({ modifiers: [modifier] });

	expect(await columnSelected(tabelo, 1)).toBe(true);
	expect(await columnSelected(tabelo, 3)).toBe(false);
});

test("the modifier subtracts a column from the middle of a range", async ({
	tabelo,
}) => {
	await columnHandle(tabelo, 1).click();
	await columnHandle(tabelo, 3).click({ modifiers: ["Shift"] });
	expect(await columnSelected(tabelo, 2)).toBe(true);

	await columnHandle(tabelo, 2).click({ modifiers: [modifier] });

	expect(await columnSelected(tabelo, 1)).toBe(true);
	expect(await columnSelected(tabelo, 2)).toBe(false);
	expect(await columnSelected(tabelo, 3)).toBe(true);
});

test("the modifier adds a row, and the last remaining area cannot be removed", async ({
	tabelo,
}) => {
	await seedRoster(tabelo);
	const selected = async (row: number) =>
		(await tabelo.cell(row, 1).getAttribute("aria-selected")) === "true";

	await rowHandle(tabelo, 2).click();
	await rowHandle(tabelo, 4).click({ modifiers: [modifier] });

	expect(await selected(1)).toBe(true);
	expect(await selected(2)).toBe(false);
	expect(await selected(3)).toBe(true);

	// Taking away the last area would leave nothing focused, so it stays.
	await rowHandle(tabelo, 4).click({ modifiers: [modifier] });
	await rowHandle(tabelo, 2).click({ modifiers: [modifier] });
	expect(await selected(1)).toBe(true);
});

test("the modifier adds a cell area, and Shift extends the newest one", async ({
	tabelo,
}) => {
	await seedRoster(tabelo);
	const selected = async (row: number, column: number) =>
		(await tabelo.cell(row, column).getAttribute("aria-selected")) === "true";

	await tabelo.cell(1, 1).click();
	await tabelo.cell(3, 3).click({ modifiers: [modifier] });

	expect(await selected(1, 1)).toBe(true);
	expect(await selected(3, 3)).toBe(true);
	expect(await selected(2, 2)).toBe(false);

	// Shift extends the area the modifier just added and leaves the first one
	// standing, so the two gestures compose.
	await tabelo.cell(3, 4).click({ modifiers: ["Shift"] });

	expect(await selected(1, 1)).toBe(true);
	expect(await selected(3, 4)).toBe(true);
});

test("the keyboard builds a selection of two columns without a pointer", async ({
	page,
	tabelo,
}) => {
	await tabelo.cell(1, 1).click();
	// Ctrl rather than the platform modifier: macOS keeps Cmd+Space for itself,
	// and Ctrl is what reaches the page everywhere. Alt+Shift on the arrows is
	// what carries the first column past the move to the second: a plain arrow
	// would discard it, and the modifier alone now jumps to the edge of the
	// data.
	await page.keyboard.press("Control+Space");
	await page.keyboard.press(`${modifier}+Alt+Shift+ArrowRight`);
	await page.keyboard.press(`${modifier}+Alt+Shift+ArrowRight`);
	await page.keyboard.press("Control+Space");

	expect(await columnSelected(tabelo, 1)).toBe(true);
	expect(await columnSelected(tabelo, 2)).toBe(false);
	expect(await columnSelected(tabelo, 3)).toBe(true);
});

test("a plain arrow still discards the whole selection", async ({
	page,
	tabelo,
}) => {
	await columnHandle(tabelo, 1).click();
	await columnHandle(tabelo, 3).click({ modifiers: [modifier] });

	await tabelo.cell(1, 3).focus();
	await page.keyboard.press("ArrowDown");

	expect(await columnSelected(tabelo, 1)).toBe(false);
	expect(await columnSelected(tabelo, 3)).toBe(false);
});

test("the announcement states the total across every selected area", async ({
	tabelo,
}) => {
	await columnHandle(tabelo, 1).click();
	await columnHandle(tabelo, 3).click({ modifiers: [modifier] });

	await expect(tabelo.announcements).toHaveText(
		copy.a11y.multiSelectionSummary("column", 2),
	);
});

test("actions needing one area are disabled with a reason, never hidden", async ({
	page,
	tabelo,
}) => {
	await columnHandle(tabelo, 1).click();
	await columnHandle(tabelo, 3).click({ modifiers: [modifier] });
	await openCellMenu(page, tabelo);

	const menu = page.getByRole("menu");
	for (const label of [
		copy.actions.moveLeft,
		copy.actions.paste,
		copy.actions.insertColumnsLeft(2),
	]) {
		const action = menu.getByRole("menuitem", { name: label });
		await expect(action).toBeVisible();
		await expect(action).toBeDisabled();
	}

	const blocked = menu.getByRole("menuitem", { name: copy.actions.moveLeft });
	await blocked.hover();
	await expect(page.getByRole("tooltip")).toBeVisible();

	// The operations that act on a set of indices stay available, and their
	// labels count both areas rather than the last one.
	await expect(
		menu.getByRole("menuitem", { name: copy.actions.deleteColumns(2) }),
	).toBeEnabled();
});

test("Alt+Right refuses several areas without changing them", async ({
	page,
	tabelo,
}) => {
	await seedRoster(tabelo);
	await columnHandle(tabelo, 1).click();
	await columnHandle(tabelo, 3).click({ modifiers: [modifier] });
	await tabelo.cell(1, 3).focus();

	await page.keyboard.press("Alt+ArrowRight");

	await expect(tabelo.notice("warning")).toBeVisible();
	expect(await columnSelected(tabelo, 1)).toBe(true);
	expect(await columnSelected(tabelo, 2)).toBe(false);
	expect(await columnSelected(tabelo, 3)).toBe(true);
	await expect(tabelo.header(1)).toHaveText("name");
	await expect(tabelo.header(3)).toHaveText("role");
});

test("deleting removes exactly the selected columns, gap and all", async ({
	page,
	tabelo,
}) => {
	await seedRoster(tabelo);

	await columnHandle(tabelo, 1).click();
	await columnHandle(tabelo, 3).click({ modifiers: [modifier] });
	await openCellMenu(page, tabelo);
	await page
		.getByRole("menu")
		.getByRole("menuitem", { name: copy.actions.deleteColumns(2) })
		.click();

	await expect(tabelo.header(1)).toHaveText("city");
	await expect(tabelo.header(2)).toHaveText("age");
	await expect(tabelo.cell(1, 1)).toHaveText("Rio");
});

test("copying two separated columns produces a well-formed two-column table", async ({
	page,
	tabelo,
}) => {
	await seedRoster(tabelo);

	await columnHandle(tabelo, 1).click();
	await columnHandle(tabelo, 3).click({ modifiers: [modifier] });
	// Read what the grid puts on the clipboard rather than the system
	// clipboard, which Playwright cannot grant across every browser.
	const copied = await tabelo.grid().evaluate((grid) => {
		const data = new DataTransfer();
		const event = new Event("copy", { bubbles: true, cancelable: true });
		Object.defineProperty(event, "clipboardData", { value: data });
		grid.dispatchEvent(event);
		return data.getData("text/plain");
	});

	expect(copied).toBe(
		[
			"name\trole",
			"Ingrid\tDesigner",
			"Paulo\tDeveloper",
			"Mabel\tWriter",
		].join("\n"),
	);

	// The gap has closed, so pasting the result back builds exactly those two
	// columns rather than a ragged table.
	await tabelo.runAppCommand("newTable");
	await page
		.getByRole("dialog", { name: copy.newTable.title })
		.getByRole("button", { name: copy.newTable.confirm })
		.click();
	await page
		.getByRole("region", { name: copy.empty.title })
		.getByRole("button", { name: copy.empty.emptyAction })
		.click();
	await tabelo.paste(copied);

	await expect(tabelo.header(1)).toHaveText("name");
	await expect(tabelo.header(2)).toHaveText("role");
	await expect(tabelo.grid().getByRole("columnheader")).toHaveCount(2);
	await expect(tabelo.cell(1, 2)).toHaveText("Designer");
});

// The mark's contract is one outline around what the clipboard holds, not a
// border around each area. These two pin the arrangements that only became
// reachable once a selection could hold several areas.
test("each separated copied area gets its own complete outline", async ({
	tabelo,
}) => {
	await seedRoster(tabelo);

	await columnHandle(tabelo, 1).click();
	await columnHandle(tabelo, 3).click({ modifiers: [modifier] });
	await tabelo.copy();

	await expect(mark(tabelo, 1, 1)).toHaveAttribute(
		"data-clipboard-source",
		"right left",
	);
	await expect(mark(tabelo, 1, 3)).toHaveAttribute(
		"data-clipboard-source",
		"right left",
	);
	// The column between them was not copied and carries no mark at all.
	await expect(mark(tabelo, 1, 2)).toHaveCount(0);
});

test("overlapping copied areas read as one outline, with no dashes through the middle", async ({
	tabelo,
}) => {
	await seedRoster(tabelo);

	// Two single cells first, so the column area added last does not absorb
	// them: the result is a cell area overlapping a column area that covers it.
	await tabelo.cell(2, 1).click();
	await tabelo.cell(3, 1).click({ modifiers: [modifier] });
	await columnHandle(tabelo, 1).click({ modifiers: [modifier] });
	await tabelo.copy();

	// The cell sits inside the column, so its own horizontal edges are interior
	// and are not drawn. Asking each area separately would box it in here.
	await expect(mark(tabelo, 2, 1)).toHaveAttribute(
		"data-clipboard-source",
		"right left",
	);
	// The outline still closes at the two ends of the column.
	await expect(
		tabelo.header(1).locator("[data-clipboard-source]"),
	).toHaveAttribute("data-clipboard-source", "top right left");
	await expect(mark(tabelo, 3, 1)).toHaveAttribute(
		"data-clipboard-source",
		"right bottom left",
	);
});

test("pasting into several areas says why it did nothing", async ({
	tabelo,
}) => {
	await seedRoster(tabelo);
	const before = await tabelo.cell(1, 1).textContent();

	await columnHandle(tabelo, 1).click();
	await columnHandle(tabelo, 3).click({ modifiers: [modifier] });
	await tabelo.paste("x\ty");

	await expect(tabelo.notice("warning")).toBeVisible();
	await expect(tabelo.cell(1, 1)).toHaveText(before ?? "");
});

test("Escape collapses several areas back to one cell", async ({
	page,
	tabelo,
}) => {
	await columnHandle(tabelo, 1).click();
	await columnHandle(tabelo, 3).click({ modifiers: [modifier] });
	expect(await columnSelected(tabelo, 1)).toBe(true);
	await expect(tabelo.cell(1, 3)).toHaveAttribute("aria-selected", "true");

	// The grid's keyboard model belongs to its cells, so the key has to be
	// pressed on one rather than on the select handle that was just clicked.
	await tabelo.cell(1, 3).focus();
	await page.keyboard.press("Escape");

	// What survives is the focused cell alone: the other area is gone, and the
	// column the focus was in is no longer selected below its header.
	expect(await columnSelected(tabelo, 1)).toBe(false);
	await expect(tabelo.cell(1, 3)).toHaveAttribute("aria-selected", "false");
});
