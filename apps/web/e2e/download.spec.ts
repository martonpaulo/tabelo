import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

// Downloading is a choice, so it is a chooser: which format, and — only where
// the format declares one — how the file should be written. The header row is
// the case that matters: the table always has one, and whether the file prints
// it is a property of that file and of nothing else.

// Captures the download without writing it to disk, so its bytes can be read.
async function savedFile(
	page: Page,
	act: () => Promise<void>,
): Promise<{ name: string; body: string }> {
	const waiting = page.waitForEvent("download");
	await act();
	const download = await waiting;
	const stream = await download.createReadStream();
	const chunks: Buffer[] = [];
	for await (const chunk of stream) chunks.push(chunk as Buffer);
	return {
		name: download.suggestedFilename(),
		body: Buffer.concat(chunks).toString("utf8"),
	};
}

async function openChooser(page: Page): Promise<void> {
	await page.getByRole("button", { name: "File", exact: true }).click();
	await page.getByRole("menuitem", { name: "Download table" }).click();
	await expect(page.getByRole("dialog")).toBeVisible();
}

test("the chooser lists every registered format", async ({ page, tabelo }) => {
	await expect(tabelo.workspace).toBeVisible();
	await openChooser(page);

	const dialog = page.getByRole("dialog");
	await expect(dialog).toContainText("Choose a file format.");
	for (const format of ["Markdown", "CSV", "TSV", "HTML", "Jira"]) {
		await expect(dialog.getByRole("radio", { name: format })).toBeVisible();
	}
});

test("only CSV offers the header row choice", async ({ page, tabelo }) => {
	await expect(tabelo.workspace).toBeVisible();
	await openChooser(page);
	const dialog = page.getByRole("dialog");

	// Markdown is selected first and has no output choices to make.
	await expect(
		dialog.getByRole("checkbox", { name: /Include header row/ }),
	).toHaveCount(0);

	await dialog.getByRole("radio", { name: "CSV" }).click();
	const option = dialog.getByRole("checkbox", { name: /Include header row/ });
	await expect(option).toBeVisible();
	await expect(option).toBeChecked();

	await dialog.getByRole("radio", { name: "TSV" }).click();
	await expect(
		dialog.getByRole("checkbox", { name: /Include header row/ }),
	).toHaveCount(0);
});

test("CSV includes the header row by default", async ({ page, tabelo }) => {
	await tabelo.editCell(1, 1, "Ana");

	const file = await savedFile(page, async () => {
		await openChooser(page);
		await page.getByRole("dialog").getByRole("radio", { name: "CSV" }).click();
		await page.getByRole("button", { name: "Download", exact: true }).click();
	});

	expect(file.name).toBe("table.csv");
	expect(file.body.split("\n")[0]).toBe("Column 1,Column 2,Column 3");
	expect(file.body).toContain("Ana");
});

test("unchecking the option omits the header row from the file only", async ({
	page,
	tabelo,
}) => {
	await tabelo.editCell(1, 1, "Ana");

	const file = await savedFile(page, async () => {
		await openChooser(page);
		const dialog = page.getByRole("dialog");
		await dialog.getByRole("radio", { name: "CSV" }).click();
		await dialog.getByRole("checkbox", { name: /Include header row/ }).click();
		await page.getByRole("button", { name: "Download", exact: true }).click();
	});

	expect(file.body.split("\n")[0]).toBe("Ana,,");
	expect(file.body).not.toContain("Column 1");

	// The table itself still has its header, and so does every other view.
	await expect(tabelo.header(1)).toHaveText("Column 1");
	await expect(tabelo.source("Markdown")).toContainText("Column 1");
});

// TSV shares CSV's serializer, so it is the format that would actually leak.
test("the option does not leak into other formats", async ({
	page,
	tabelo,
}) => {
	await tabelo.editCell(1, 1, "Ana");

	await openChooser(page);
	const dialog = page.getByRole("dialog");
	await dialog.getByRole("radio", { name: "CSV" }).click();
	await dialog.getByRole("checkbox", { name: /Include header row/ }).click();
	await page.getByRole("button", { name: "Cancel" }).click();

	const file = await savedFile(page, async () => {
		await openChooser(page);
		await page.getByRole("dialog").getByRole("radio", { name: "TSV" }).click();
		await page.getByRole("button", { name: "Download", exact: true }).click();
	});

	expect(file.name).toBe("table.tsv");
	expect(file.body.split("\n")[0]).toBe("Column 1\tColumn 2\tColumn 3");
});

test("the chooser is keyboard operable and Escape returns focus", async ({
	page,
	tabelo,
}) => {
	await expect(tabelo.workspace).toBeVisible();
	await openChooser(page);

	await page.keyboard.press("Escape");
	await expect(page.getByRole("dialog")).toHaveCount(0);
	await expect(
		page.getByRole("button", { name: "File", exact: true }),
	).toBeFocused();
});
