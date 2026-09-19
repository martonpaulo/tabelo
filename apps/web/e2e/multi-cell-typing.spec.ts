import { samplePeopleCsv, samplePerson } from "@/core/sample-data";
import { expect, test } from "./fixtures";
import type { TabeloPage } from "./helpers";

// Typing over several selected cells writes into every one of them, the way
// the source views put one caret in each (owner, 2026-09-19). The editor opens
// on the focused cell only; the commit is what reaches the rest.

async function seedRoster(tabelo: TabeloPage): Promise<void> {
	await tabelo.paste(samplePeopleCsv(3).replaceAll(",", "\t"));
	await tabelo.dismissNotices();
}

// The city column: its header and the three roster rows.
function cityColumn(tabelo: TabeloPage) {
	return [
		tabelo.header(2),
		tabelo.cell(1, 2),
		tabelo.cell(2, 2),
		tabelo.cell(3, 2),
	];
}

test("typing over a column selected by its letter writes every cell in one undo step", async ({
	tabelo,
}) => {
	await seedRoster(tabelo);
	const before = await Promise.all(
		cityColumn(tabelo).map((cell) => cell.textContent()),
	);

	await tabelo.columnIndex(2).getByRole("button").first().click();
	await tabelo.page.keyboard.press("L");
	const editor = tabelo.grid().getByRole("textbox");
	await expect(editor).toBeFocused();
	await editor.fill("Lisbon");
	await editor.press("Enter");

	for (const cell of cityColumn(tabelo))
		await expect(cell).toHaveText("Lisbon");
	// The neighbouring column is outside the selection and keeps its value.
	await expect(tabelo.cell(1, 1)).toHaveText(samplePerson(0).name);
	await expect(tabelo.announcements).not.toBeEmpty();

	await tabelo.runAppCommand("undo");
	const restored = cityColumn(tabelo);
	for (const [index, cell] of restored.entries()) {
		await expect(cell).toHaveText(before[index] ?? "");
	}
});

test("Escape while typing over several cells writes none of them", async ({
	tabelo,
}) => {
	await seedRoster(tabelo);

	await tabelo.columnIndex(2).getByRole("button").first().click();
	await tabelo.page.keyboard.press("L");
	const editor = tabelo.grid().getByRole("textbox");
	await expect(editor).toBeFocused();
	await editor.press("Escape");

	await expect(tabelo.cell(1, 2)).toHaveText(samplePerson(0).city);
	await expect(tabelo.cell(2, 2)).toHaveText(samplePerson(1).city);
});
