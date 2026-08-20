import type { Locator } from "@playwright/test";
import { copy } from "@/copy/copy";
import { expect, test } from "./fixtures";
import type { TabeloPage } from "./helpers";

// Typed numbers cannot be typed in as text: nothing derives a type from how a
// value looks. A JSON import is the shortest honest route to a column that
// really holds numbers.
const COUNTS = '[{"count":1},{"count":2},{"count":9},{"count":9}]';

// A typed cell's value span carries a visually hidden type suffix for assistive
// technology, so its text is either the value alone or the value followed by a
// comma. The assertion accepts both and never matches a longer number.
async function expectValue(
	tabelo: TabeloPage,
	row: number,
	expected: string,
): Promise<void> {
	await expect(tabelo.cell(row, 1).locator("[data-cell-value]")).toHaveText(
		new RegExp(`^${expected}(,|$)`),
	);
}

// The offer, addressed by the choice it carries rather than by its position or
// its colour.
function offer(tabelo: TabeloPage): Locator {
	return tabelo.notice("info").filter({
		has: tabelo.page.getByRole("button", { name: copy.notices.fillSeries }),
	});
}

function seriesAction(tabelo: TabeloPage): Locator {
	return offer(tabelo).getByRole("button", { name: copy.notices.fillSeries });
}

async function copyFillTwoRows(tabelo: TabeloPage): Promise<void> {
	await tabelo.importFile("counts.json", COUNTS, "application/json");
	await tabelo.cell(1, 1).click();
	await tabelo.page.keyboard.press("Shift+ArrowDown");

	// The handle is an overlay beside the grid rather than inside it, so it is
	// addressed from the pane.
	const handle = tabelo.pane("grid").getByRole("button", {
		name: copy.a11y.fillHandle,
	});
	const from = await handle.boundingBox();
	const to = await tabelo.cell(4, 1).boundingBox();
	if (!from || !to) throw new Error("The fill handle is not rendered.");

	await tabelo.page.mouse.move(
		from.x + from.width / 2,
		from.y + from.height / 2,
	);
	await tabelo.page.mouse.down();
	await tabelo.page.mouse.move(from.x + from.width / 2, to.y + to.height / 2, {
		steps: 12,
	});
	await tabelo.page.mouse.up();

	await expectValue(tabelo, 3, "1");
	await expectValue(tabelo, 4, "2");
}

test("a repeated numeric fill becomes a series only when the user asks", async ({
	page,
	tabelo,
}) => {
	await copyFillTwoRows(tabelo);
	await expect(offer(tabelo)).toBeVisible();
	const beforeChoice = await tabelo.announcements.textContent();

	await seriesAction(tabelo).click();

	await expectValue(tabelo, 3, "3");
	await expectValue(tabelo, 4, "4");
	// The source is untouched, and the series is numbers rather than text.
	await expectValue(tabelo, 1, "1");
	await expect(tabelo.cell(4, 1)).toHaveAttribute("data-cell-type", "number");
	await expect(offer(tabelo)).toBeHidden();
	await expect
		.poll(() => tabelo.announcements.textContent())
		.not.toBe(beforeChoice);

	// Every other view sees the series immediately.
	await expect
		.poll(async () => (await tabelo.source("markdown").textContent()) ?? "")
		.toContain("4");

	// Two operations, two undo steps: the copied result, then the table it
	// replaced.
	await tabelo.runAppCommand("undo");
	await expectValue(tabelo, 3, "1");
	await expectValue(tabelo, 4, "2");
	await tabelo.runAppCommand("undo");
	await expectValue(tabelo, 3, "9");
	await expectValue(tabelo, 4, "9");
	await expect(
		page.getByRole("region", { name: copy.a11y.notices }),
	).toBeHidden();
});

test("the offer is reachable and answerable from the keyboard alone", async ({
	page,
	tabelo,
}) => {
	await copyFillTwoRows(tabelo);

	const action = seriesAction(tabelo);
	await expect(action).toBeVisible();
	await action.focus();
	await expect(action).toBeFocused();
	await page.keyboard.press("Enter");

	await expectValue(tabelo, 4, "4");
	await expect(offer(tabelo)).toBeHidden();
});

test("keeping the copied values leaves the fill exactly as it was", async ({
	tabelo,
}) => {
	await copyFillTwoRows(tabelo);

	await offer(tabelo)
		.getByRole("button", { name: copy.notices.keepCopiedValues })
		.click();

	await expect(offer(tabelo)).toBeHidden();
	await expectValue(tabelo, 3, "1");
	await expectValue(tabelo, 4, "2");

	// Dismissal was not an edit, so one undo still reaches the pre-fill table.
	await tabelo.runAppCommand("undo");
	await expectValue(tabelo, 3, "9");
});

test("an unrelated edit clears the offer", async ({ page, tabelo }) => {
	await copyFillTwoRows(tabelo);
	await expect(offer(tabelo)).toBeVisible();

	await tabelo.cell(1, 1).click();
	await page.keyboard.press("Backspace");

	await expect(offer(tabelo)).toBeHidden();
});

test("numeric-looking text is never offered as a series", async ({
	page,
	tabelo,
}) => {
	await tabelo.paste("Count\n1\n2\n9\n9");
	await tabelo.cell(1, 1).click();
	await page.keyboard.press("Shift+ArrowDown");
	await page.keyboard.press("ControlOrMeta+Alt+ArrowDown");

	await expect(tabelo.cell(3, 1)).toHaveText("1");
	await expect(offer(tabelo)).toHaveCount(0);
});
