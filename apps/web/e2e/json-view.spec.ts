import { copy } from "@/copy/copy";
import { expect, test } from "./fixtures";
import type { TabeloPage } from "./helpers";

// JSON is the only format that keys on the document's headers rather than
// writing them positionally, so it is the only one that can refuse a perfectly
// valid table. These cover the shape it produces when it can, and both places
// the refusal surfaces when it cannot: the view chooser before conversion, and
// the pane itself when a header is broken after conversion.

// The code never reaches the message, only the positions do, so any code names
// the same columns. Same convention as copy.test.ts.
function blockedFor(columns: readonly number[]): string {
	return copy.source.blocked({ code: "test", columns: [...columns] });
}

async function nameColumns(
	tabelo: TabeloPage,
	...headers: readonly string[]
): Promise<void> {
	for (const [index, header] of headers.entries()) {
		await tabelo.editHeader(index + 1, header);
	}
}

function blockedReason(tabelo: TabeloPage) {
	return tabelo
		.pane("json")
		.getByRole("textbox", { name: copy.a11y.blockedView });
}

test("serializes as an array of row objects keyed by the headers", async ({
	tabelo,
}) => {
	await nameColumns(tabelo, "Name", "Role", "City");
	await tabelo.editCell(1, 1, "Inez");
	await tabelo.editCell(1, 2, "Designer");

	await tabelo.choosePaneView("markdown", "json");

	const source = tabelo.source("json");
	await expect(source).toContainText('"Name":"Inez"');
	await expect(source).toContainText('"Role":"Designer"');
	// The header is carried by the keys, never emitted as a record of its own.
	await expect(source).not.toContainText('"Name":"Name"');
});

test("an unnamed table cannot be converted to the view at all", async ({
	tabelo,
}) => {
	// A new table starts with no header text, which is exactly what JSON cannot
	// key on, so the choice is refused before the pane ever shows it.
	const dialog = await tabelo.openChangeViewDialog("markdown");
	await expect(
		dialog.getByRole("radio", { name: copy.views.json.label }),
	).toBeDisabled();
	await expect(
		dialog.getByRole("radio", { name: copy.views.csv.label }),
	).toBeEnabled();
});

test("a duplicate header blocks the open view and names both columns", async ({
	tabelo,
}) => {
	await nameColumns(tabelo, "Name", "Role", "City");
	await tabelo.choosePaneView("markdown", "json");
	await expect(tabelo.source("json")).toBeVisible();

	await tabelo.editHeader(3, "Name", "City");

	await expect(blockedReason(tabelo)).toHaveValue(blockedFor([0, 2]));
});

test("a header that is a whole number blocks the open view", async ({
	tabelo,
}) => {
	// "2024" would come back from JSON.parse ahead of every other key, silently
	// reordering the columns, so the format declines rather than reorder.
	await nameColumns(tabelo, "Region", "Revenue", "Notes");
	await tabelo.choosePaneView("markdown", "json");
	await expect(tabelo.source("json")).toBeVisible();

	await tabelo.editHeader(2, "2024", "Revenue");

	await expect(blockedReason(tabelo)).toHaveValue(blockedFor([1]));
});

test("correcting the header restores the view in place", async ({ tabelo }) => {
	await nameColumns(tabelo, "Name", "Role", "City");
	await tabelo.choosePaneView("markdown", "json");
	await tabelo.editHeader(3, "Name", "City");
	await expect(blockedReason(tabelo)).toBeVisible();

	await tabelo.editHeader(3, "City", "Name");

	await expect(blockedReason(tabelo)).toHaveCount(0);
	await expect(tabelo.source("json")).toContainText('"City"');
});

test("the download chooser refuses JSON while the headers conflict", async ({
	page,
	tabelo,
}) => {
	await nameColumns(tabelo, "Name", "Role", "Name");

	await page.getByRole("button", { name: copy.actions.openAppMenu }).click();
	await page
		.getByRole("menuitem", { name: copy.actions.downloadTable })
		.click();

	const dialog = page.getByRole("dialog");
	const json = dialog.getByRole("radio", { name: copy.views.json.shortLabel });
	// Listed, not hidden: the user has to be able to see why it is unavailable.
	await expect(json).toBeVisible();
	await expect(json).toBeDisabled();

	await expect(
		dialog.getByRole("radio", { name: copy.views.csv.shortLabel }),
	).toBeEnabled();
});
