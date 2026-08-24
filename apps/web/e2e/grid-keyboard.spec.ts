import type { Locator, Page } from "@playwright/test";
import { copy } from "@/copy/copy";
import { STORAGE_KEY } from "@/persistence/schema";
import {
	COLUMN_WIDTH_STEP,
	DEFAULT_COLUMN_WIDTH,
	MAX_COLUMN_WIDTH,
	MIN_COLUMN_WIDTH,
} from "@/workspace/column-width";
import { expect, test } from "./fixtures";

// The grid is a hand-built widget, so every keyboard contract it advertises is
// one it has to implement itself. The rule that shapes the rest: arrows are
// internal navigation, and Tab wraps around reading order. Escape is how you get out.

function insideGrid(page: Page): Promise<boolean> {
	return page.evaluate(() =>
		Boolean(document.activeElement?.closest('[role="grid"]')),
	);
}

function focusedCell(page: Page): Promise<string | null> {
	return page.evaluate(
		() => document.activeElement?.getAttribute("data-cell") ?? null,
	);
}

async function typeWithoutCommitting(
	target: Locator,
	editor: Locator,
	value: string,
): Promise<void> {
	await target.dblclick();
	await expect(editor).toBeFocused();
	await editor.fill(value);
}

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

async function expectFocusedCellClearOfStickyChrome(page: Page): Promise<void> {
	const focused = page.locator('[data-grid-active="true"]');
	const geometry = await focused.evaluate((cell) => {
		const grid = cell.closest('[role="grid"]');
		const header = grid?.querySelector('[data-cell="-1:0"]');
		const gutter = cell
			.closest('[role="row"]')
			?.querySelector('[role="rowheader"]');
		if (!(header instanceof HTMLElement) || !(gutter instanceof HTMLElement)) {
			throw new Error("Sticky grid chrome was not found.");
		}
		const cellBox = cell.getBoundingClientRect();
		const headerBox = header.getBoundingClientRect();
		const gutterBox = gutter.getBoundingClientRect();
		return {
			cellTop: cellBox.top,
			cellLeft: cellBox.left,
			headerBottom: headerBox.bottom,
			gutterRight: gutterBox.right,
		};
	});
	expect(geometry.cellTop).toBeGreaterThanOrEqual(geometry.headerBottom);
	expect(geometry.cellLeft).toBeGreaterThanOrEqual(geometry.gutterRight);
}

test("keyboard scrolling keeps the focused cell clear of sticky grid chrome", async ({
	page,
	tabelo,
}) => {
	await tabelo.paste(largeTable());
	const scroller = tabelo.pane("grid").locator('[data-slot="panel-body"]');
	const target = tabelo.cell(40, 8);
	await target.click();

	const hideFocusedCellAboveAndLeft = async () => {
		await scroller.evaluate((element, cell) => {
			const targetCell = document.querySelector<HTMLElement>(cell);
			if (!targetCell) throw new Error("Focused test cell was not found.");
			element.scrollTop = targetCell.offsetTop + targetCell.offsetHeight;
			element.scrollLeft = targetCell.offsetLeft + targetCell.offsetWidth;
		}, '[data-cell="39:7"]');
	};

	await hideFocusedCellAboveAndLeft();
	await page.keyboard.press("ArrowUp");
	await page.keyboard.press("ArrowLeft");
	await expectFocusedCellClearOfStickyChrome(page);

	await tabelo.runPaneCommand("grid", "zoomIn");
	await page.keyboard.press("Escape");
	await target.click();
	await hideFocusedCellAboveAndLeft();
	await page.keyboard.press("ArrowUp");
	await page.keyboard.press("ArrowLeft");
	await expectFocusedCellClearOfStickyChrome(page);
});

test("a cell too wide to fit still shows its beginning, not its end", async ({
	page,
	tabelo,
}) => {
	await tabelo.paste(largeTable());

	// Widened to its maximum through the keyboard path rather than a long drag:
	// the step is a known size, so this reaches the cap on any engine without
	// depending on how far a pointer may travel outside the viewport.
	await tabelo.cell(1, 2).click();
	const steps = Math.ceil(
		(MAX_COLUMN_WIDTH - DEFAULT_COLUMN_WIDTH) / COLUMN_WIDTH_STEP,
	);
	for (let step = 0; step < steps; step += 1) {
		await page.keyboard.press("Alt+Shift+ArrowRight");
	}

	// Wider than the pane can show, so the two edges cannot both be satisfied
	// and the choice between them becomes observable.
	const scroller = tabelo.pane("grid").locator('[data-slot="panel-body"]');
	const width = (await tabelo.cell(1, 2).boundingBox())?.width ?? 0;
	expect(width).toBeGreaterThan(await scroller.evaluate((e) => e.clientWidth));

	// Arriving from the left is the ordinary case: the cell starts clear of the
	// gutter and runs off the far edge, so aligning its trailing edge would
	// scroll the beginning of the value out of sight.
	await tabelo.cell(1, 1).click();
	await page.keyboard.press("ArrowRight");

	await expectFocusedCellClearOfStickyChrome(page);
});

test("Tab walks the grid in reading order and wraps around after the last cell", async ({
	page,
	tabelo,
}) => {
	await tabelo.cell(1, 1).click();
	expect(await focusedCell(page)).toBe("0:0");

	await page.keyboard.press("Tab");
	expect(await focusedCell(page)).toBe("0:1");
	await page.keyboard.press("Tab");
	expect(await focusedCell(page)).toBe("0:2");

	// Past the last column, on to the start of the next row.
	await page.keyboard.press("Tab");
	expect(await focusedCell(page)).toBe("1:0");

	await page.keyboard.press("Shift+Tab");
	expect(await focusedCell(page)).toBe("0:2");

	// Continue to the last cell.
	for (let press = 0; press < 6; press += 1) {
		await page.keyboard.press("Tab");
	}
	expect(await focusedCell(page)).toBe("2:2");

	// Tab wraps around to the first cell of the header row.
	await page.keyboard.press("Tab");
	expect(await focusedCell(page)).toBe("-1:0");
	expect(await insideGrid(page)).toBe(true);
});

test("Shift+Tab wraps around the grid at the first cell", async ({
	page,
	tabelo,
}) => {
	await tabelo.cell(1, 1).click();

	// Backwards out of the first cell wraps around to the last cell.
	for (let press = 0; press < 12; press += 1) {
		await page.keyboard.press("Shift+Tab");
		expect(await insideGrid(page)).toBe(true);
	}
});

test("arrow navigation stays inside the grid at every edge", async ({
	page,
	tabelo,
}) => {
	await tabelo.cell(1, 1).click();

	// Up from the first data row reaches the header row, which is part of the
	// table, and stops there rather than leaving the grid.
	await page.keyboard.press("ArrowUp");
	await page.keyboard.press("ArrowLeft");
	expect(await focusedCell(page)).toBe("-1:0");
	expect(await insideGrid(page)).toBe(true);

	await page.keyboard.press("ArrowUp");
	expect(await focusedCell(page)).toBe("-1:0");
	expect(await insideGrid(page)).toBe(true);

	await page.keyboard.press("ArrowDown");
	expect(await focusedCell(page)).toBe("0:0");
	await page.keyboard.press("ArrowRight");
	expect(await focusedCell(page)).toBe("0:1");
});

// The header cell is edited the way any cell is: it is one, for every purpose
// except being deletable as a row. Selecting the column moved to the index
// strip, so the header no longer answers Space.
test("a header cell is renamed with Enter or F2 like any cell", async ({
	page,
	tabelo,
}) => {
	await tabelo.header(1).click();

	await page.keyboard.press("F2");
	let editor = tabelo.grid().getByRole("textbox");
	await expect(editor).toBeVisible();
	await page.keyboard.press("Escape");

	await tabelo.header(1).click();
	await page.keyboard.press("Enter");
	editor = tabelo.grid().getByRole("textbox");
	await expect(editor).toBeVisible();
	await editor.fill("Name");
	await editor.press("Enter");
	await expect(tabelo.header(1)).toHaveText("Name");

	// Typing over it replaces it, which is what a data cell does too.
	await tabelo.header(1).click();
	await page.keyboard.press("R");
	await expect(tabelo.grid().getByRole("textbox")).toHaveValue("R");
	await page.keyboard.press("Enter");
	await expect(tabelo.header(1)).toHaveText("R");
});

test("pointer exits commit the active cell editor before focus moves", async ({
	page,
	tabelo,
}) => {
	const grid = tabelo.grid();
	const firstCell = tabelo.cell(1, 1);
	const secondCell = tabelo.cell(1, 2);

	await typeWithoutCommitting(
		firstCell,
		grid.getByRole("textbox", { name: copy.a11y.cellEditor(0, 0) }),
		"Ingrid",
	);
	await secondCell.click();
	await expect(firstCell).toHaveText("Ingrid");
	await expect(secondCell).toBeFocused();

	// The pointer exit creates one ordinary document step, not a second commit
	// for the blur plus the receiving cell's pointer handler.
	await tabelo.runAppCommand("undo");
	await expect(firstCell).toHaveText("");

	await typeWithoutCommitting(
		firstCell,
		grid.getByRole("textbox", { name: copy.a11y.cellEditor(0, 0) }),
		"Paulo",
	);
	await tabelo.header(2).click();
	await expect(firstCell).toHaveText("Paulo");
	await expect(tabelo.header(2)).toBeFocused();

	await typeWithoutCommitting(
		tabelo.cell(2, 1),
		grid.getByRole("textbox", { name: copy.a11y.cellEditor(1, 0) }),
		"Rio",
	);
	const rowMenuTrigger = grid.getByRole("button", {
		name: `${copy.actions.rowActions}: ${copy.a11y.rowNumber(1)}`,
	});
	await tabelo.rowIndex(3).hover();
	await expect(rowMenuTrigger).toBeVisible();
	await rowMenuTrigger.click();
	await expect(tabelo.cell(2, 1)).toHaveText("Rio");
	const axisMenu = page.getByRole("menu", {
		name: `${copy.actions.rowActions}: ${copy.a11y.rowNumber(1)}`,
	});
	await expect(axisMenu).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(axisMenu).toBeHidden();

	await typeWithoutCommitting(
		tabelo.cell(3, 1),
		grid.getByRole("textbox", { name: copy.a11y.cellEditor(2, 0) }),
		"Madrid",
	);
	const paneMenu = await tabelo.openPaneMenu("grid");
	await expect(tabelo.cell(3, 1)).toHaveText("Madrid");
	await expect(paneMenu).toBeVisible();
});

test("pointer exit commits a header edit and Escape remains the discard path", async ({
	tabelo,
}) => {
	const grid = tabelo.grid();
	const header = tabelo.header(1);

	await typeWithoutCommitting(
		header,
		grid.getByRole("textbox", { name: copy.a11y.headerEditor("", 0) }),
		"Name",
	);
	await tabelo.cell(1, 1).click();
	await expect(header).toHaveText("Name");
	await expect(tabelo.cell(1, 1)).toBeFocused();

	await typeWithoutCommitting(
		header,
		grid.getByRole("textbox", { name: copy.a11y.headerEditor("Name", 0) }),
		"Role",
	);
	await grid.getByRole("textbox").press("Escape");
	await expect(header).toHaveText("Name");
});

test("the column is selected from the index strip", async ({
	page,
	tabelo,
}) => {
	await tabelo
		.columnIndex(1)
		.getByRole("button", {
			name: new RegExp(`^${copy.actions.selectColumn}:`),
		})
		.focus();
	await page.keyboard.press(" ");

	await expect(tabelo.cell(1, 1)).toHaveAttribute("aria-selected", "true");
	await expect(tabelo.header(1)).toHaveAttribute("aria-selected", "true");
});

test("Fit reveals clipped column content and explains disabled states", async ({
	page,
	tabelo,
}) => {
	await tabelo.editHeader(
		1,
		"A deliberately long header that is clipped at the default column width",
	);

	const header = tabelo.header(1);
	const width = async () => (await header.boundingBox())?.width ?? 0;
	const original = await width();

	const openMenu = async () => {
		await tabelo
			.grid()
			.getByRole("button", {
				name: new RegExp(`^${copy.actions.columnActions}:`),
			})
			.first()
			.click();
		const menu = page.getByRole("menu", {
			name: new RegExp(`^${copy.actions.columnActions}:`),
		});
		await menu.waitFor({ state: "visible" });
		return menu;
	};
	const open = await openMenu();
	const fit = open.getByRole("menuitem", {
		name: copy.actions.fitColumnToContent,
	});
	const wrap = open.getByRole("menuitemcheckbox", {
		name: copy.actions.wrapColumnText,
	});
	await expect(fit).toBeEnabled();
	await wrap.click();
	await expect(fit).toBeDisabled();
	await fit.hover();
	await expect(page.getByRole("tooltip")).toBeVisible();
	await wrap.click();
	await expect(fit).toBeEnabled();
	await fit.click();

	await expect.poll(width).toBeGreaterThan(original);
	const reopened = await openMenu();
	await expect(
		reopened.getByRole("menuitem", {
			name: copy.actions.fitColumnToContent,
		}),
	).toBeDisabled();
});

test("keyboard resizing changes only the focused column and announces outcomes", async ({
	page,
	tabelo,
}) => {
	await tabelo.editHeader(1, "First");
	await tabelo.editHeader(2, "Second");
	const first = tabelo.header(1);
	const second = tabelo.header(2);
	const width = async (target: Locator) =>
		(await target.boundingBox())?.width ?? 0;
	const firstBefore = await width(first);

	await first.focus();
	await page.keyboard.press("Alt+Shift+ArrowRight");

	await expect.poll(() => width(first)).toBeGreaterThan(firstBefore);
	await expect
		.poll(() =>
			page.evaluate((key) => {
				const saved = JSON.parse(localStorage.getItem(key) ?? "null");
				return Object.values(saved?.workspace?.columnWidths ?? {});
			}, STORAGE_KEY),
		)
		.toEqual([12]);
	await expect(first).toHaveText("First");
	await expect(second).toHaveText("Second");
	await expect(tabelo.announcements).not.toBeEmpty();
	const widenedAnnouncement = await tabelo.announcements.textContent();
	expect(widenedAnnouncement).toContain("A");
	expect(widenedAnnouncement).toContain("12");

	const widened = await width(first);
	await page.keyboard.press("Alt+Shift+ArrowLeft");
	await expect.poll(() => width(first)).toBeLessThan(widened);

	for (let press = 0; press < 5; press += 1) {
		await page.keyboard.press("Alt+Shift+ArrowLeft");
	}
	const changedAnnouncement = await tabelo.announcements.textContent();
	expect(changedAnnouncement).not.toBe(widenedAnnouncement);
	await page.keyboard.press("Alt+Shift+ArrowLeft");
	await expect
		.poll(() =>
			page.evaluate((key) => {
				const saved = JSON.parse(localStorage.getItem(key) ?? "null");
				return Object.values(saved?.workspace?.columnWidths ?? {})[0];
			}, STORAGE_KEY),
		)
		.toBe(MIN_COLUMN_WIDTH);
});

test("the pointer resize handle still changes its own column", async ({
	page,
	tabelo,
}) => {
	const header = tabelo.header(1);
	const before = (await header.boundingBox())?.width ?? 0;
	const handle = tabelo
		.columnIndex(1)
		.locator('[aria-hidden][class*="cursor-col-resize"]');
	const box = await handle.boundingBox();
	expect(box).not.toBeNull();
	await page.mouse.move((box?.x ?? 0) + 2, (box?.y ?? 0) + 2);
	await page.mouse.down();
	await page.mouse.move((box?.x ?? 0) + 50, (box?.y ?? 0) + 2);
	await page.mouse.up();

	await expect
		.poll(async () => (await header.boundingBox())?.width ?? 0)
		.toBeGreaterThan(before);
});

test("workspace width survives document history, reload, and duplication", async ({
	page,
	tabelo,
}) => {
	await tabelo.editCell(1, 1, "Ingrid");
	await tabelo.editCell(1, 2, "Paulo");
	let first = tabelo.header(1);
	let untouched = tabelo.header(2);
	const handle = tabelo
		.columnIndex(1)
		.locator('[aria-hidden][class*="cursor-col-resize"]');
	const box = await handle.boundingBox();
	expect(box).not.toBeNull();
	await page.mouse.move((box?.x ?? 0) + 2, (box?.y ?? 0) + 2);
	await page.mouse.down();
	await page.mouse.move((box?.x ?? 0) + 50, (box?.y ?? 0) + 2);
	await page.mouse.up();

	const firstWidth = async () => (await first.boundingBox())?.width ?? 0;
	const untouchedWidth = async () =>
		(await untouched.boundingBox())?.width ?? 0;
	await expect.poll(firstWidth).toBeGreaterThan(await untouchedWidth());
	await tabelo.runAppCommand("undo");
	await expect(tabelo.cell(1, 1)).toHaveText("Ingrid");
	await expect(tabelo.cell(1, 2)).toHaveText("");
	await expect.poll(firstWidth).toBeGreaterThan(await untouchedWidth());

	await page.reload();
	await tabelo.workspace.waitFor({ state: "visible" });
	first = tabelo.header(1);
	untouched = tabelo.header(2);
	await expect.poll(firstWidth).toBeGreaterThan(await untouchedWidth());

	await tabelo
		.columnIndex(1)
		.getByRole("button", {
			name: new RegExp(`^${copy.actions.selectColumn}:`),
		})
		.click();
	await tabelo
		.grid()
		.getByRole("button", {
			name: new RegExp(`^${copy.actions.columnActions}:`),
		})
		.first()
		.click();
	await page
		.getByRole("menuitem", { name: copy.actions.duplicateColumns(1) })
		.click();
	await expect(tabelo.header(4)).toBeVisible();
	const duplicateWidth = async () =>
		(await tabelo.header(2).boundingBox())?.width ?? 0;
	const shiftedUntouchedWidth = async () =>
		(await tabelo.header(3).boundingBox())?.width ?? 0;
	await expect
		.poll(duplicateWidth)
		.toBeGreaterThan(await shiftedUntouchedWidth());
});

test("Fit stores the same normalized width at different pane zoom levels", async ({
	page,
	tabelo,
}) => {
	await tabelo.editCell(
		1,
		1,
		"A long single-line value whose natural width is measured at both pane zoom levels",
	);
	const fitColumn = async () => {
		await tabelo
			.grid()
			.getByRole("button", {
				name: new RegExp(`^${copy.actions.columnActions}:`),
			})
			.first()
			.click();
		await page
			.getByRole("menu")
			.getByRole("menuitem", { name: copy.actions.fitColumnToContent })
			.click();
	};
	const storedWidth = () =>
		page.evaluate((key) => {
			const saved = JSON.parse(localStorage.getItem(key) ?? "null");
			return Object.values(saved?.workspace?.columnWidths ?? {})[0] as
				| number
				| undefined;
		}, STORAGE_KEY);

	await fitColumn();
	await expect.poll(storedWidth).not.toBeUndefined();
	const atDefaultZoom = await storedWidth();

	const zoomedPayload = await page.evaluate((key) => {
		const saved = JSON.parse(localStorage.getItem(key) ?? "null");
		saved.workspace.columnWidths = {};
		const gridPane = saved.workspace.panes.find(
			(pane: { view: string }) => pane.view === "grid",
		);
		gridPane.zoom = 2;
		return saved;
	}, STORAGE_KEY);
	await page.addInitScript(
		({ key, payload }) => {
			localStorage.setItem(key, JSON.stringify(payload));
		},
		{ key: STORAGE_KEY, payload: zoomedPayload },
	);
	await page.reload();
	await tabelo.workspace.waitFor({ state: "visible" });
	await fitColumn();
	await expect.poll(storedWidth).toBe(atDefaultZoom);
});

test("column wrapping grows rows, persists, and keeps cell navigation", async ({
	page,
	tabelo,
}) => {
	await tabelo.editCell(
		1,
		1,
		"A deliberately long cell value that wraps across several visual lines while remaining one keyboard cell",
	);

	const cellHeight = async () =>
		(await tabelo.cell(1, 1).boundingBox())?.height ?? 0;
	const compactHeight = await cellHeight();
	const openColumnMenu = async () => {
		await tabelo
			.grid()
			.getByRole("button", {
				name: new RegExp(`^${copy.actions.columnActions}:`),
			})
			.first()
			.click();
		return page.getByRole("menu", {
			name: new RegExp(`^${copy.actions.columnActions}:`),
		});
	};

	let menu = await openColumnMenu();
	let wrap = menu.getByRole("menuitemcheckbox", {
		name: copy.actions.wrapColumnText,
	});
	await expect(wrap).not.toBeChecked();
	await wrap.click();
	await expect(wrap).toBeChecked();
	await expect.poll(cellHeight).toBeGreaterThan(compactHeight);
	const wrappedHeight = await cellHeight();

	await page.keyboard.press("Escape");
	await tabelo.cell(1, 1).click();
	await page.keyboard.press("ArrowDown");
	expect(await focusedCell(page)).toBe("1:0");

	await expect
		.poll(() =>
			page.evaluate((key) => {
				const raw = localStorage.getItem(key);
				if (!raw) return [];
				return JSON.parse(raw).workspace?.wrappedColumns ?? [];
			}, STORAGE_KEY),
		)
		.toHaveLength(1);
	await page.reload();
	await tabelo.workspace.waitFor({ state: "visible" });

	menu = await openColumnMenu();
	wrap = menu.getByRole("menuitemcheckbox", {
		name: copy.actions.wrapColumnText,
	});
	await expect(wrap).toBeChecked();
	await wrap.click();
	await expect.poll(cellHeight).toBeLessThan(wrappedHeight);
});

test("a cell is named by its value, not by its coordinates", async ({
	tabelo,
}) => {
	await tabelo.editCell(1, 1, "Ingrid");

	// Cells carry their content, while row and column headers carry context.
	await expect(
		tabelo.grid().getByRole("gridcell", { name: "Ingrid" }),
	).toBeVisible();
	await expect(
		tabelo.grid().getByRole("rowheader", { name: copy.a11y.rowNumber(0) }),
	).toBeVisible();
	await expect(
		tabelo.grid().getByRole("columnheader", {
			name: copy.a11y.columnLetter(0),
		}),
	).toBeVisible();
});

test("selection state is exposed on the cells it covers", async ({
	page,
	tabelo,
}) => {
	await tabelo.cell(1, 1).click();
	await expect(tabelo.cell(1, 1)).toHaveAttribute("aria-selected", "true");
	await expect(tabelo.cell(1, 2)).toHaveAttribute("aria-selected", "false");

	await page.keyboard.press("Shift+ArrowRight");
	await expect(tabelo.cell(1, 2)).toHaveAttribute("aria-selected", "true");
	await expect(tabelo.cell(2, 1)).toHaveAttribute("aria-selected", "false");
});

test("the documented grid commands still work", async ({ page, tabelo }) => {
	await tabelo.editCell(1, 1, "Ingrid");
	await tabelo.editCell(2, 1, "Bo");

	// Enter edits, F2 edits, Escape leaves the value alone.
	await tabelo.cell(1, 1).click();
	await page.keyboard.press("Enter");
	await expect(
		tabelo.grid().getByRole("textbox", { name: copy.a11y.cellEditor(0, 0) }),
	).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(tabelo.cell(1, 1)).toHaveText("Ingrid");

	// Home and End move along the row; the modifier goes to the far corner.
	await page.keyboard.press("End");
	expect(await focusedCell(page)).toBe("0:2");
	await page.keyboard.press("Home");
	expect(await focusedCell(page)).toBe("0:0");
	await page.keyboard.press("Control+End");
	expect(await focusedCell(page)).toBe("2:2");
	// The far corner the other way is the header row, which is the table's first
	// row and now reachable like any other.
	await page.keyboard.press("Control+Home");
	expect(await focusedCell(page)).toBe("-1:0");

	// Alt+Arrow reorders rather than navigating.
	await tabelo.cell(1, 1).click();
	await page.keyboard.press("Alt+ArrowDown");
	await expect(tabelo.cell(1, 1)).toHaveText("Bo");
	await expect(tabelo.cell(2, 1)).toHaveText("Ingrid");
	await page.keyboard.press("Alt+ArrowUp");
	await expect(tabelo.cell(1, 1)).toHaveText("Ingrid");

	// Backspace clears contents; the modifier removes the structure.
	await tabelo.cell(1, 1).click();
	await page.keyboard.press("Backspace");
	await expect(tabelo.cell(1, 1)).toHaveText("");
	await expect(tabelo.cell(2, 1)).toHaveText("Bo");

	const rowsBefore = await tabelo.grid().getByRole("row").count();
	await page.keyboard.press("Control+Backspace");
	expect(await tabelo.grid().getByRole("row").count()).toBe(rowsBefore - 1);
});

test("Mod+A selects the header row and every body cell", async ({
	page,
	tabelo,
}) => {
	await tabelo.cell(1, 1).click();
	await page.keyboard.press("ControlOrMeta+A");

	for (let column = 1; column <= 3; column += 1) {
		await expect(tabelo.header(column)).toHaveAttribute(
			"aria-selected",
			"true",
		);
		await expect(tabelo.cell(3, column)).toHaveAttribute(
			"aria-selected",
			"true",
		);
	}

	const copied = await tabelo.grid().evaluate((grid) => {
		const clipboardData = new DataTransfer();
		const event = new Event("copy", { bubbles: true, cancelable: true });
		Object.defineProperty(event, "clipboardData", { value: clipboardData });
		grid.dispatchEvent(event);
		return clipboardData.getData("text/plain");
	});
	// A new table has no header text, so the copied header row is empty tabs.
	// What matters is that the header row is carried at all.
	expect(copied.split("\n")[0]).toBe("\t\t");
});

test("typing in a cell never reaches the grid's structural shortcuts", async ({
	tabelo,
}) => {
	await tabelo.editCell(1, 1, "Ingrid");
	const rowsBefore = await tabelo.grid().getByRole("row").count();

	await tabelo.cell(1, 1).dblclick();
	const editor = tabelo
		.grid()
		.getByRole("textbox", { name: copy.a11y.cellEditor(0, 0) });
	await expect(editor).toBeFocused();

	// Backspace edits the text; the modifier does not delete the row from under
	// the editor.
	await editor.press("Backspace");
	await editor.press("Control+Backspace");
	expect(await tabelo.grid().getByRole("row").count()).toBe(rowsBefore);

	await editor.press("Escape");
	await expect(tabelo.cell(1, 1)).toHaveText("Ingrid");
});

test("the header row is a row, and every row counted is a row exposed", async ({
	tabelo,
}) => {
	const grid = tabelo.grid();
	const rows = grid.getByRole("row");

	// aria-rowcount and the exposed rows have to agree, or every row position a
	// screen reader reads out is wrong by one. This is also what catches the
	// index strip being counted: it is chrome, not a row.
	const exposed = await rows.count();
	await expect(grid).toHaveAttribute("aria-rowcount", String(exposed));

	// The header row is row 1, so the first data row is row 2.
	const headerRow = rows.first();
	await expect(headerRow).toHaveAttribute("aria-rowindex", "1");
	await expect(
		headerRow.getByRole("rowheader", { name: copy.a11y.headerRow }),
	).toBeVisible();
	await expect(
		headerRow.getByRole("columnheader", { name: copy.a11y.columnLetter(0) }),
	).toBeVisible();
	await expect(rows.nth(1)).toHaveAttribute("aria-rowindex", "2");
});

test("the selection extent is announced only when it changes", async ({
	page,
	tabelo,
}) => {
	// Silent on arrival, and silent while the extent stays one cell: the cell
	// announces its own value as focus lands, and an extent over that would
	// double-speak.
	await expect(tabelo.announcements).toBeEmpty();
	await tabelo.cell(1, 1).click();
	await page.keyboard.press("ArrowDown");
	await expect(tabelo.announcements).toBeEmpty();

	// Extending it is a change, and a held extension settles into one utterance
	// carrying where the user stopped rather than one per keystroke.
	await page.keyboard.press("Shift+ArrowRight");
	await page.keyboard.press("Shift+ArrowDown");
	await expect(tabelo.announcements).toContainText("2");
});

// The platform modifier as the keyboard carries it. Read from the host: a
// legend that is right on one machine and wrong on the pipeline is a broken
// test, not a broken pipeline.
const mod = process.platform === "darwin" ? "Meta" : "Control";

// A column with two runs and a gap between them, so one press can be shown to
// stop at a run's far edge and the next to cross the gap. The second column
// stays full, so a jump can be shown to depend on the column it is in.
const gappedColumn = [
	"Name\tCity",
	"Ingrid\tRio",
	"Paulo\tMadrid",
	"\tBuenos Aires",
	"\tMexico City",
	"Mabel\tTokyo",
].join("\n");

test("the modifier and an arrow jump to the edge of the data", async ({
	page,
	tabelo,
}) => {
	await tabelo.paste(gappedColumn);
	await tabelo.dismissNotices();
	await tabelo.cell(1, 1).click();

	// The focus and the row below it both hold content, so the jump runs to
	// that run's far edge rather than moving one step.
	await page.keyboard.press(`${mod}+ArrowDown`);
	expect(await focusedCell(page)).toBe("1:0");

	// The run is over, so the next press crosses the gap to the next cell that
	// holds something rather than stopping inside it.
	await page.keyboard.press(`${mod}+ArrowDown`);
	expect(await focusedCell(page)).toBe("4:0");

	// Nothing below holds anything, so the jump has reached the table's edge.
	await page.keyboard.press(`${mod}+ArrowDown`);
	expect(await focusedCell(page)).toBe("4:0");
	expect(await insideGrid(page)).toBe(true);
});

test("an upward jump lands on the header row and stops there", async ({
	page,
	tabelo,
}) => {
	await tabelo.paste(gappedColumn);
	await tabelo.dismissNotices();
	await tabelo.cell(5, 1).click();

	await page.keyboard.press(`${mod}+ArrowUp`);
	expect(await focusedCell(page)).toBe("1:0");

	await page.keyboard.press(`${mod}+ArrowUp`);
	expect(await focusedCell(page)).toBe("0:0");

	await page.keyboard.press(`${mod}+ArrowUp`);
	expect(await focusedCell(page)).toBe("-1:0");

	// The header is the top of the table, so the jump has nowhere further to go
	// and never leaves the grid.
	await page.keyboard.press(`${mod}+ArrowUp`);
	expect(await focusedCell(page)).toBe("-1:0");
	expect(await insideGrid(page)).toBe(true);
});

test("a downward jump from the header starts at the first data row", async ({
	page,
	tabelo,
}) => {
	await tabelo.paste(gappedColumn);
	await tabelo.dismissNotices();
	await tabelo.header(1).click();

	// The column's name is not the start of its data. If it were, this would
	// run on to the far edge of Ingrid and Paulo instead.
	await page.keyboard.press(`${mod}+ArrowDown`);
	expect(await focusedCell(page)).toBe("0:0");
});

test("Shift extends the selection to the same edge the jump lands on", async ({
	page,
	tabelo,
}) => {
	await tabelo.paste(gappedColumn);
	await tabelo.dismissNotices();
	await tabelo.cell(1, 2).click();

	await page.keyboard.press(`${mod}+Shift+ArrowDown`);

	// The second column has no gap, so the extension reaches the last row and
	// covers every cell between, rather than moving the focus alone.
	expect(await focusedCell(page)).toBe("4:1");
	for (const row of [1, 2, 3, 4, 5]) {
		await expect(tabelo.cell(row, 2)).toHaveAttribute("aria-selected", "true");
	}
	await expect(tabelo.cell(1, 1)).toHaveAttribute("aria-selected", "false");
});

test("a jump reads the column it is in, not the table as a whole", async ({
	page,
	tabelo,
}) => {
	await tabelo.paste(gappedColumn);
	await tabelo.dismissNotices();
	await tabelo.cell(1, 2).click();

	// The same starting row as the first test, in the column with no gap in it,
	// where one press reaches the bottom instead of stopping at row 2.
	await page.keyboard.press(`${mod}+ArrowDown`);
	expect(await focusedCell(page)).toBe("4:1");
});

test("the four insert chords add a row or a column on the requested side", async ({
	page,
	tabelo,
}) => {
	await tabelo.paste("Name\tCity\nIngrid\tRio");
	await tabelo.dismissNotices();
	// Each chord is aimed from the row or column holding Ingrid, because an
	// insertion leaves the selection on what it just added: chaining the four
	// without re-aiming would test where the selection went, not where the new
	// line landed.
	await tabelo.cell(1, 1).click();

	await page.keyboard.press(`${mod}+Enter`);
	await expect(tabelo.cell(1, 1)).toHaveText("Ingrid");
	await expect(tabelo.cell(2, 1)).toHaveText("");

	await tabelo.cell(1, 1).click();
	await page.keyboard.press(`${mod}+Shift+Enter`);
	await expect(tabelo.cell(1, 1)).toHaveText("");
	await expect(tabelo.cell(2, 1)).toHaveText("Ingrid");

	await tabelo.cell(2, 1).click();
	await page.keyboard.press(`${mod}+Alt+Enter`);
	await expect(tabelo.header(1)).toHaveText("Name");
	await expect(tabelo.header(2)).toHaveText("");
	await expect(tabelo.header(3)).toHaveText("City");

	await tabelo.cell(2, 1).click();
	await page.keyboard.press(`${mod}+Alt+Shift+Enter`);
	await expect(tabelo.header(1)).toHaveText("");
	await expect(tabelo.header(2)).toHaveText("Name");
});

test("the modifier separates the rehomed focus move from column resizing", async ({
	page,
	tabelo,
}) => {
	await tabelo.paste(gappedColumn);
	await tabelo.dismissNotices();
	await tabelo.cell(1, 1).click();
	const width = (await tabelo.cell(1, 1).boundingBox())?.width ?? 0;

	// Alt+Shift with the modifier moves the focus and keeps what is selected.
	// Without the modifier the same two keys are column width, so the two must
	// not both fire.
	await page.keyboard.press(`${mod}+Alt+Shift+ArrowRight`);
	expect(await focusedCell(page)).toBe("0:1");
	expect((await tabelo.cell(1, 1).boundingBox())?.width ?? 0).toBe(width);

	await page.keyboard.press("Alt+Shift+ArrowRight");
	expect(await focusedCell(page)).toBe("0:1");
});

test("the new chords leave ordinary typing and Space alone", async ({
	page,
	tabelo,
}) => {
	await tabelo.paste("Name\nIngrid");
	await tabelo.dismissNotices();
	await tabelo.cell(1, 1).click();

	// Space with no modifier still replaces the cell and opens the editor,
	// which is what every printable character does.
	await page.keyboard.press("Space");
	const editor = tabelo.grid().getByRole("textbox");
	await expect(editor).toBeVisible();
	await editor.fill("Paulo");
	await editor.press("Enter");
	await expect(tabelo.cell(1, 1)).toHaveText("Paulo");
});
