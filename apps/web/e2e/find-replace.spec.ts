import type { Locator } from "@playwright/test";
import { copy } from "@/copy/copy";
import { samplePeople } from "@/core/sample-data";
import type { ViewId } from "@/views/types";
import { expect, test } from "./fixtures";
import type { TabeloPage } from "./helpers";

// Find crosses every boundary a unit test cannot reach: a keyboard chord the
// browser also wants, a mark rendered inside a cell whose accessible value must
// survive it, a selection that moves while the caret stays in a text field, and
// a replacement that has to reach every other open view at once.

// The roster's first three, so the fixture is the shared cast rather than a new
// one. Grid row 1 is Ingrid, row 2 is Paulo, row 3 is Mabel.
const PEOPLE = [
	"name\tcity\trole",
	...samplePeople
		.slice(0, 3)
		.map((person) => [person.name, person.city, person.role].join("\t")),
].join("\n");

// One column whose header holds none of what these tests search for, so every
// count below is exactly the number of body rows that do.
function cities(...values: readonly string[]): string {
	return ["city", ...values].join("\n");
}

function bar(tabelo: TabeloPage): Locator {
	return tabelo.page.getByRole("region", { name: copy.find.title });
}

function queryField(tabelo: TabeloPage): Locator {
	return bar(tabelo).getByRole("textbox", { name: copy.find.query });
}

function replacementField(tabelo: TabeloPage): Locator {
	return bar(tabelo).getByRole("textbox", { name: copy.find.replacement });
}

function count(tabelo: TabeloPage): Locator {
	return bar(tabelo).locator('[data-slot="find-position"]');
}

// The one marked substring, wherever it currently is.
function mark(tabelo: TabeloPage): Locator {
	return tabelo.grid().locator("[data-find-current]");
}

function markedCell(tabelo: TabeloPage): Locator {
	return tabelo.grid().locator("[data-cell]:has([data-find-current])");
}

async function openFind(tabelo: TabeloPage, query: string): Promise<void> {
	await tabelo.cell(2, 1).click();
	await tabelo.page.keyboard.press("ControlOrMeta+f");
	await expect(queryField(tabelo)).toBeFocused();
	await queryField(tabelo).fill(query);
}

// Replacing is behind one disclosure, because the bar opens for finding.
async function showReplace(tabelo: TabeloPage): Promise<void> {
	await bar(tabelo)
		.getByRole("button", { name: copy.find.showReplace })
		.click();
	await expect(replacementField(tabelo)).toBeVisible();
}

test("opens from the grid, finds across the header, and closes back to the grid", async ({
	page,
	tabelo,
}) => {
	await tabelo.paste(PEOPLE);
	await openFind(tabelo, "name");

	// The header row participates: it is an ordinary cell for every purpose the
	// user can observe.
	await expect(markedCell(tabelo)).toHaveAttribute("data-cell", "-1:0");
	await expect(tabelo.header(1)).toHaveAttribute("aria-selected", "true");

	await queryField(tabelo).press("Escape");

	await expect(bar(tabelo)).toHaveCount(0);
	// The cell the last match reached keeps the selection and takes the
	// keyboard, rather than focus landing on the document body.
	await expect(tabelo.header(1)).toBeFocused();
	await expect(
		page.evaluate(() =>
			Boolean(document.activeElement?.closest('[role="grid"]')),
		),
	).resolves.toBe(true);
});

test("walks the matches from the field without the grid taking the caret", async ({
	page,
	tabelo,
}) => {
	await tabelo.paste(cities("Rio", "Rio", "Rio"));
	await openFind(tabelo, "Rio");
	await expect(count(tabelo)).toHaveText("1/3");

	await queryField(tabelo).press("Enter");

	await expect(count(tabelo)).toHaveText("2/3");
	await expect(queryField(tabelo)).toBeFocused();
	// Stepping is what moved the grid: the marked cell is the selected one.
	await expect(markedCell(tabelo)).toHaveAttribute("data-cell", "1:0");
	await expect(markedCell(tabelo)).toHaveAttribute("aria-selected", "true");

	// Both ends wrap rather than stopping dead, and the pointer route does what
	// the keyboard one does.
	await queryField(tabelo).press("Shift+Enter");
	await expect(count(tabelo)).toHaveText("1/3");
	await bar(tabelo).getByRole("button", { name: copy.find.previous }).click();
	await expect(count(tabelo)).toHaveText("3/3");

	// A click focuses the button it landed on, but focus stays in the bar: the
	// grid never pulls it away while the user is searching.
	await expect(
		page.evaluate(() =>
			Boolean(document.activeElement?.closest('[data-slot="find-bar"]')),
		),
	).resolves.toBe(true);
});

test("marks only the matched characters and leaves the cell's value whole", async ({
	tabelo,
}) => {
	await tabelo.paste(PEOPLE);
	await openFind(tabelo, "esign");

	await expect(mark(tabelo)).toHaveText("esign");
	// The mark is presentation: the cell still reads as the value it holds, and
	// the browser tooltip that reveals a clipped value is unchanged.
	await expect(markedCell(tabelo)).toHaveText("Designer");
	await expect(markedCell(tabelo)).toHaveAttribute("title", "Designer");
	// Exactly one occurrence carries a mark, whatever else matched.
	await expect(mark(tabelo)).toHaveCount(1);
});

test("honours the case toggle", async ({ tabelo }) => {
	await tabelo.paste(PEOPLE);
	await openFind(tabelo, "RIO");
	await expect(count(tabelo)).toHaveText("1/1");

	await bar(tabelo).getByRole("button", { name: copy.find.matchCase }).click();

	await expect(count(tabelo)).toHaveText("0/0");
	await expect(markedCell(tabelo)).toHaveCount(0);
});

test("opens for finding alone and reveals replacing only when asked", async ({
	tabelo,
}) => {
	await tabelo.paste(PEOPLE);
	await openFind(tabelo, "Rio");

	// One row: the bar opens for the errand it exists for.
	await expect(replacementField(tabelo)).toHaveCount(0);

	await showReplace(tabelo);
	await bar(tabelo)
		.getByRole("button", { name: copy.find.hideReplace })
		.click();
	await expect(replacementField(tabelo)).toHaveCount(0);
});

test("turns every matching cell into the grid selection", async ({
	tabelo,
}) => {
	await tabelo.paste(cities("Rio", "Rio", "Rio"));
	await openFind(tabelo, "Rio");

	await bar(tabelo).getByRole("button", { name: copy.find.selectAll }).click();

	await expect(
		tabelo.grid().locator('[data-cell][aria-selected="true"]'),
	).toHaveCount(3);
	// The cell the bar was on is still the one the keyboard works from.
	await expect(markedCell(tabelo)).toHaveAttribute("data-grid-active", "true");
});

test("replaces one match, reaching every open view, and undoes in one step", async ({
	tabelo,
}) => {
	await tabelo.paste(PEOPLE);
	await tabelo.showInSourcePane("markdown");
	await openFind(tabelo, "Rio");
	await showReplace(tabelo);
	await replacementField(tabelo).fill("Lisbon");
	await bar(tabelo).getByRole("button", { name: copy.find.replace }).click();

	await expect(tabelo.cell(1, 2)).toHaveText("Lisbon");
	// The source view is a projection of the same document, so it says so too.
	await expect(tabelo.source("markdown")).toContainText("Lisbon");

	await tabelo.runAppCommand("undo");
	await expect(tabelo.cell(1, 2)).toHaveText("Rio");
});

test("replaces every match as exactly one history step", async ({ tabelo }) => {
	await tabelo.paste(cities("Rio", "Rio", "Madrid"));
	await openFind(tabelo, "Rio");
	await showReplace(tabelo);
	await replacementField(tabelo).fill("Lisbon");
	await bar(tabelo).getByRole("button", { name: copy.find.replaceAll }).click();

	await expect(tabelo.cell(1, 1)).toHaveText("Lisbon");
	await expect(tabelo.cell(2, 1)).toHaveText("Lisbon");
	await expect(tabelo.cell(3, 1)).toHaveText("Madrid");

	// One undo returns the whole table, not one cell of it.
	await tabelo.runAppCommand("undo");
	await expect(tabelo.cell(1, 1)).toHaveText("Rio");
	await expect(tabelo.cell(2, 1)).toHaveText("Rio");
});

test("recomputes after an edit rather than keeping stale offsets", async ({
	tabelo,
}) => {
	await tabelo.paste(cities("Rio", "Madrid"));
	await openFind(tabelo, "Rio");
	await expect(count(tabelo)).toHaveText("1/1");

	await tabelo.editCell(2, 1, "Rio");

	await expect(count(tabelo)).toHaveText("1/2");
});

test("does not fire while a cell editor is open", async ({ tabelo }) => {
	await tabelo.paste(PEOPLE);
	await tabelo.cell(2, 1).dblclick();
	const editor = tabelo.grid().getByRole("textbox", {
		name: copy.a11y.cellEditor(1, 0),
	});
	await expect(editor).toBeFocused();

	await editor.press("ControlOrMeta+f");

	// The editor owns every key while it is open, so the chord belongs to
	// whatever the browser does with it and not to the grid.
	await expect(bar(tabelo)).toHaveCount(0);
	await expect(editor).toBeFocused();
});

test("reveals a match clear of the sticky grid chrome and of the bar itself", async ({
	tabelo,
}) => {
	const rows = Array.from({ length: 60 }, (_, index) => `row ${index + 1}`);
	await tabelo.paste(cities(...rows, "needle"));
	await openFind(tabelo, "needle");

	const geometry = await markedCell(tabelo).evaluate((cell) => {
		const grid = cell.closest('[role="grid"]');
		const scroller = cell.closest('[data-slot="panel-body"]');
		const header = grid?.querySelector('[data-cell="-1:0"]');
		const gutter = cell
			.closest('[role="row"]')
			?.querySelector('[role="rowheader"]');
		const found = scroller?.querySelector('[data-slot="find-bar"]');
		if (
			!(header instanceof HTMLElement) ||
			!(gutter instanceof HTMLElement) ||
			!(found instanceof HTMLElement)
		) {
			throw new Error("Sticky grid chrome was not found.");
		}
		const box = cell.getBoundingClientRect();
		return {
			cellTop: box.top,
			cellLeft: box.left,
			cellBottom: box.bottom,
			headerBottom: header.getBoundingClientRect().bottom,
			gutterRight: gutter.getBoundingClientRect().right,
			barTop: found.getBoundingClientRect().top,
		};
	});

	expect(geometry.cellTop).toBeGreaterThanOrEqual(geometry.headerBottom);
	expect(geometry.cellLeft).toBeGreaterThanOrEqual(geometry.gutterRight);
	// The bar sticks to the foot of the same scroller, so while it is open it is
	// the bottom of the content region.
	expect(geometry.cellBottom).toBeLessThanOrEqual(geometry.barTop);
});

test("keeps nothing between sessions", async ({ page, tabelo }) => {
	await tabelo.paste(PEOPLE);
	await openFind(tabelo, "Rio");
	await expect(bar(tabelo)).toBeVisible();

	await page.reload();

	// Transient by construction: the query and its match list never reached
	// storage, so the reloaded table opens with no find state at all.
	await expect(bar(tabelo)).toHaveCount(0);
});

test("opens from the pane menu as well as the chord", async ({ tabelo }) => {
	await tabelo.paste(PEOPLE);
	const menu = await tabelo.openPaneMenu("grid");
	await menu.getByRole("menuitem", { name: copy.find.title }).click();

	await expect(queryField(tabelo)).toBeFocused();
});

// Every pane finds in what it shows (#280). These address each bar through its
// own pane, because several can be open at once.

function paneBar(tabelo: TabeloPage, view: ViewId): Locator {
	return tabelo.pane(view).locator('[data-slot="find-bar"]');
}

function paneQuery(tabelo: TabeloPage, view: ViewId): Locator {
	return paneBar(tabelo, view).getByRole("textbox", { name: copy.find.query });
}

function paneCount(tabelo: TabeloPage, view: ViewId): Locator {
	return paneBar(tabelo, view).locator('[data-slot="find-position"]');
}

async function openSourceFind(
	tabelo: TabeloPage,
	view: ViewId,
	query: string,
): Promise<void> {
	await tabelo.showInSourcePane(view);
	await tabelo.source(view).click();
	// From the top of the text, so the first occurrence is the one reached.
	await tabelo.page.keyboard.press("ControlOrMeta+Home");
	await tabelo.page.keyboard.press("ControlOrMeta+f");
	await expect(paneQuery(tabelo, view)).toBeFocused();
	await paneQuery(tabelo, view).fill(query);
}

test("a source pane finds its own syntax, not the table behind it", async ({
	page,
	tabelo,
}) => {
	await tabelo.paste(PEOPLE);
	// The separator after a value exists only in the CSV text, so no cell
	// matches this, while the CSV pane holds it twice: after "Rio" and after
	// "Paulo".
	await openSourceFind(tabelo, "csv", "o,");

	await expect(paneCount(tabelo, "csv")).toHaveText("1/2");
	await paneQuery(tabelo, "csv").press("Enter");
	await expect(paneCount(tabelo, "csv")).toHaveText("2/2");
	await expect(paneQuery(tabelo, "csv")).toBeFocused();

	// Escape hands the keyboard back to the editor, whose own selection is the
	// occurrence the count was reporting.
	await paneQuery(tabelo, "csv").press("Escape");
	await expect(paneBar(tabelo, "csv")).toHaveCount(0);
	await expect(tabelo.source("csv")).toBeFocused();
	await expect(
		page.evaluate(() => window.getSelection()?.toString()),
	).resolves.toBe("o,");
});

test("a source pane replaces in its text and every other view follows", async ({
	tabelo,
}) => {
	await tabelo.paste(PEOPLE);
	await openSourceFind(tabelo, "csv", "Rio");
	await paneBar(tabelo, "csv")
		.getByRole("button", { name: copy.find.showReplace })
		.click();
	await paneBar(tabelo, "csv")
		.getByRole("textbox", { name: copy.find.replacement })
		.fill("Lisbon");
	await paneBar(tabelo, "csv")
		.getByRole("button", { name: copy.find.replaceAll })
		.click();

	await expect(tabelo.source("csv")).toContainText("Ingrid,Lisbon,");
	// The replacement is the draft's, and reaches the table through the
	// ordinary synchronization path.
	await expect(tabelo.cell(1, 2)).toHaveText("Lisbon");
});

test("a replace that breaks the source leaves it invalid, exactly as typing would", async ({
	tabelo,
}) => {
	await tabelo.paste(PEOPLE);
	await openSourceFind(tabelo, "json", '"Rio"');
	await paneBar(tabelo, "json")
		.getByRole("button", { name: copy.find.showReplace })
		.click();
	await paneBar(tabelo, "json")
		.getByRole("textbox", { name: copy.find.replacement })
		.fill('"Rio');
	await paneBar(tabelo, "json")
		.getByRole("button", { name: copy.find.replaceAll })
		.click();

	await expect(tabelo.source("json")).toHaveAttribute("aria-invalid", "true");
	// Every other view keeps the last valid parse.
	await expect(tabelo.cell(1, 2)).toHaveText("Rio");
});

test("the rendered preview finds and offers no replacing at all", async ({
	tabelo,
}) => {
	await tabelo.paste(PEOPLE);
	await tabelo.showInSourcePane("html-preview");
	await tabelo.pane("html-preview").locator("[data-pane-entry]").click();
	await tabelo.page.keyboard.press("ControlOrMeta+f");

	const bar = tabelo.page.getByRole("region", {
		name: copy.find.titleReadOnly,
		exact: true,
	});
	await expect(bar).toBeVisible();
	await paneQuery(tabelo, "html-preview").fill("rio");
	await expect(paneCount(tabelo, "html-preview")).toHaveText("1/1");

	// Absent, not disabled: a read-only view has nothing to replace with.
	await expect(
		bar.getByRole("button", { name: copy.find.showReplace }),
	).toHaveCount(0);
	await expect(
		bar.getByRole("textbox", { name: copy.find.replacement }),
	).toHaveCount(0);

	// The mark is presentation only: nothing was wrapped around the matched
	// characters, so the value still reads whole.
	await expect(
		tabelo.pane("html-preview").getByRole("cell", { name: "Rio" }),
	).toHaveText("Rio");
	await expect(
		tabelo.pane("html-preview").locator("mark, [data-find-current]"),
	).toHaveCount(0);
});

test("two panes search for different things at once", async ({ tabelo }) => {
	await tabelo.paste(PEOPLE);
	await openSourceFind(tabelo, "csv", "o,");
	await tabelo.cell(2, 1).click();
	await tabelo.page.keyboard.press("ControlOrMeta+f");
	await expect(paneQuery(tabelo, "grid")).toBeFocused();
	await paneQuery(tabelo, "grid").fill("Madrid");

	await expect(paneCount(tabelo, "grid")).toHaveText("1/1");
	await expect(paneCount(tabelo, "csv")).toHaveText("1/2");
	await expect(paneQuery(tabelo, "csv")).toHaveValue("o,");
});

test("closing a pane's view drops its find with it", async ({ tabelo }) => {
	await tabelo.paste(PEOPLE);
	await openSourceFind(tabelo, "csv", "o,");

	await tabelo.choosePaneView("csv", "tsv");

	await expect(paneBar(tabelo, "tsv")).toHaveCount(0);
});
