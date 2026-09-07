import type { Page } from "@playwright/test";
import { copy } from "@/copy/copy";
import { listCodecs } from "@/formats";
import { expect, test } from "./fixtures";
import { renderedSource } from "./helpers";

// Downloading is a choice, so it is a chooser. The user chooses the format and,
// only where the format declares an option, how the file should be written. The
// header row is not one of those choices: it is structural, so every CSV file
// prints it and no control exists that could leave it out.

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
	await page.getByRole("button", { name: copy.actions.openAppMenu }).click();
	await page
		.getByRole("menuitem", { name: copy.actions.downloadTable })
		.click();
	await expect(page.getByRole("dialog")).toBeVisible();
}

test("the chooser uses the shared dialog button hierarchy", async ({
	page,
	tabelo,
}) => {
	await expect(tabelo.workspace).toBeVisible();
	await openChooser(page);
	const dialog = page.getByRole("dialog");

	await expect(
		dialog.getByRole("button", { name: copy.actions.cancel }),
	).toHaveAttribute("data-variant", "ghost");
	await expect(
		dialog.getByRole("button", { name: copy.actions.download, exact: true }),
	).toHaveAttribute("data-variant", "default");

	await dialog.getByRole("button", { name: copy.actions.cancel }).click();
	await expect(
		page.getByRole("button", { name: copy.actions.openAppMenu }),
	).toBeFocused();
});

test("the chooser lists every registered format", async ({ page, tabelo }) => {
	await expect(tabelo.workspace).toBeVisible();
	await openChooser(page);

	const dialog = page.getByRole("dialog");

	for (const codec of listCodecs()) {
		await expect(
			dialog.getByRole("radio", { name: copy.views[codec.id].shortLabel }),
		).toBeVisible();
	}
});

test("CSV offers no output choices at all", async ({ page, tabelo }) => {
	await expect(tabelo.workspace).toBeVisible();
	await openChooser(page);
	const dialog = page.getByRole("dialog");

	// Markdown is selected first and has no output choices to make.
	await expect(dialog.getByRole("checkbox")).toHaveCount(0);

	await dialog.getByRole("radio", { name: copy.views.csv.label }).click();
	await expect(dialog.getByRole("checkbox")).toHaveCount(0);

	// TSV shares CSV's serializer, so it is where a leaked choice would show.
	await dialog.getByRole("radio", { name: copy.views.tsv.label }).click();
	await expect(dialog.getByRole("checkbox")).toHaveCount(0);
});

test("CSV includes the header row by default", async ({ page, tabelo }) => {
	await tabelo.editHeader(1, "Name");
	await tabelo.editCell(1, 1, "Ingrid");

	const file = await savedFile(page, async () => {
		await openChooser(page);
		await page
			.getByRole("dialog")
			.getByRole("radio", { name: copy.views.csv.label })
			.click();
		await page
			.getByRole("button", { name: copy.actions.download, exact: true })
			.click();
	});

	expect(file.name).toBe("untitled-table.csv");
	expect(file.body.split("\n")[0]).toBe("Name,,");
	expect(file.body).toContain("Ingrid");
});

test("source edits preserve whitespace and adjacent Jira escapes in CSV", async ({
	page,
	tabelo,
}) => {
	const value = "  start\n\\end  ";
	await tabelo
		.source("markdown")
		.fill("| Name |\n| --- |\n| &#32;&#32;start<br>\\\\end&#32;&#32; |");
	await expect.poll(() => tabelo.cell(1, 1).textContent()).toBe(value);

	await tabelo.choosePaneView("markdown", "jira");
	const jiraSource = "||Name||\n|  start\\\\&#92;end  |";
	await expect.poll(() => renderedSource(tabelo.pane("jira"))).toBe(jiraSource);
	await tabelo.source("jira").fill(jiraSource);
	await expect.poll(() => tabelo.cell(1, 1).textContent()).toBe(value);

	const file = await savedFile(page, async () => {
		await openChooser(page);
		await page
			.getByRole("dialog")
			.getByRole("radio", { name: copy.views.csv.label })
			.click();
		await page
			.getByRole("button", { name: copy.actions.download, exact: true })
			.click();
	});

	expect(file.body).toBe('Name\n"  start\n\\end  "');
});

test("Mod+S downloads CSV with its header row too", async ({
	page,
	tabelo,
}) => {
	await tabelo.editHeader(1, "Name");
	await tabelo.editCell(1, 1, "Ingrid");

	const file = await savedFile(page, async () => {
		await page.keyboard.press(shortcut);
		const dialog = page.getByRole("dialog");
		await dialog.getByRole("radio", { name: copy.views.csv.label }).click();
		await page
			.getByRole("button", { name: copy.actions.download, exact: true })
			.click();
	});

	expect(file.name).toBe("untitled-table.csv");
	expect(file.body.split("\n")[0]).toBe("Name,,");
});

// The header row is what makes the file describe the table it came from, so the
// only proof that matters is reading the download back in.
test("a downloaded CSV reimports as the same table", async ({
	page,
	tabelo,
}) => {
	await tabelo.editHeader(1, "Name");
	await tabelo.editHeader(2, "City");
	await tabelo.editCell(1, 1, "Ingrid");
	await tabelo.editCell(1, 2, "Rio");

	const file = await savedFile(page, async () => {
		await openChooser(page);
		await page
			.getByRole("dialog")
			.getByRole("radio", { name: copy.views.csv.label })
			.click();
		await page
			.getByRole("button", { name: copy.actions.download, exact: true })
			.click();
	});

	await tabelo.importFile(file.name, file.body, "text/csv");
	const headerDialog = page.getByRole("dialog", {
		name: copy.headerImport.title,
	});
	if ((await headerDialog.count()) > 0) {
		await headerDialog
			.getByRole("button", { name: copy.headerImport.asHeaders })
			.click();
	}

	await expect(tabelo.header(1)).toHaveText("Name");
	await expect(tabelo.header(2)).toHaveText("City");
	await expect(tabelo.cell(1, 1)).toHaveText("Ingrid");
	await expect(tabelo.cell(1, 2)).toHaveText("Rio");
});

// TSV shares CSV's serializer, so it is the format that would actually leak.
test("TSV keeps its own bytes, header row included", async ({
	page,
	tabelo,
}) => {
	await tabelo.editHeader(1, "Name");
	await tabelo.editCell(1, 1, "Ingrid");

	const file = await savedFile(page, async () => {
		await openChooser(page);
		await page
			.getByRole("dialog")
			.getByRole("radio", { name: copy.views.tsv.label })
			.click();
		await page
			.getByRole("button", { name: copy.actions.download, exact: true })
			.click();
	});

	expect(file.name).toBe("untitled-table.tsv");
	expect(file.body.split("\n")[0]).toBe("Name\t\t");
	expect(file.body).toContain("Ingrid");
});

// The generic output-option mechanism is still live infrastructure: Records
// declares two. Removing CSV's must not have disturbed it.
test("a Records option still works and changes only its own file", async ({
	page,
	tabelo,
}) => {
	// Records refuses duplicate or empty column names, so give every column one.
	await tabelo.editHeader(1, "Name");
	await tabelo.editHeader(2, "City");
	await tabelo.editHeader(3, "Role");
	// Records titles each record with the first column's value, so every row
	// needs one before it will serialize at all.
	await tabelo.editCell(1, 1, "Ingrid");
	await tabelo.editCell(1, 2, "Rio");
	await tabelo.editCell(2, 1, "Paulo");
	await tabelo.editCell(3, 1, "Mabel");

	const withName = await savedFile(page, async () => {
		await openChooser(page);
		await page
			.getByRole("dialog")
			.getByRole("radio", { name: copy.views.records.label })
			.click();
		await page
			.getByRole("button", { name: copy.actions.download, exact: true })
			.click();
	});

	const withoutName = await savedFile(page, async () => {
		await openChooser(page);
		const dialog = page.getByRole("dialog");
		await dialog.getByRole("radio", { name: copy.views.records.label }).click();
		const option = dialog.getByRole("checkbox", {
			name: copy.download.option("includeFirstColumnName"),
		});
		await expect(option).toBeChecked();
		await option.click();
		await expect(option).not.toBeChecked();
		await page
			.getByRole("button", { name: copy.actions.download, exact: true })
			.click();
	});

	expect(withoutName.body).not.toBe(withName.body);

	// The CSV file is untouched by any of it, header row included.
	const csv = await savedFile(page, async () => {
		await openChooser(page);
		await page
			.getByRole("dialog")
			.getByRole("radio", { name: copy.views.csv.label })
			.click();
		await page
			.getByRole("button", { name: copy.actions.download, exact: true })
			.click();
	});
	expect(csv.body.split("\n")[0]).toBe("Name,City,Role");
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
		page.getByRole("button", { name: copy.actions.openAppMenu }),
	).toBeFocused();
});

// Mod+S means "keep my work" everywhere else, and the browser would otherwise
// answer it with Save Page, which writes the app shell, not the table.

const shortcut = process.platform === "darwin" ? "Meta+s" : "Control+s";

for (const key of ["Meta+s", "Control+s"]) {
	test(`${key} opens the chooser instead of the browser's Save Page`, async ({
		page,
		tabelo,
	}) => {
		await expect(tabelo.workspace).toBeVisible();
		await tabelo.cell(1, 1).click();

		await page.keyboard.press(key);

		await expect(page.getByRole("dialog")).toBeVisible();
	});
}

test("the shortcut works from a source editor, where the browser would win", async ({
	page,
	tabelo,
}) => {
	await tabelo.source("markdown").click();
	await page.keyboard.press(shortcut);
	await expect(page.getByRole("dialog")).toBeVisible();

	await page.keyboard.press("Escape");
	await expect(page.getByRole("dialog")).toHaveCount(0);

	// And from the preview pane, which owns no keyboard model of its own.
	await tabelo.choosePaneView("markdown", "html-preview");
	await tabelo.pane("html-preview").click();
	await page.keyboard.press(shortcut);
	await expect(page.getByRole("dialog")).toBeVisible();
});

test("valid source work is already in the file the shortcut downloads", async ({
	page,
	tabelo,
}) => {
	await tabelo.source("markdown").fill("| Name |\n| --- |\n| Ingrid |");
	await expect(tabelo.cell(1, 1)).toHaveText("Ingrid");

	const file = await savedFile(page, async () => {
		await page.keyboard.press(shortcut);
		await expect(page.getByRole("dialog")).toBeVisible();
		await page
			.getByRole("button", { name: copy.actions.download, exact: true })
			.click();
	});

	expect(file.name).toBe("untitled-table.md");
	expect(file.body).toContain("Ingrid");
});

test("an invalid draft is named rather than silently left out", async ({
	page,
	tabelo,
}) => {
	await tabelo.source("markdown").fill("| Name |\n| --- |\n| Ingrid |");
	await expect(tabelo.cell(1, 1)).toHaveText("Ingrid");
	await tabelo.source("markdown").fill("| Name |\n| not a divider |\n| Bo |");
	await expect(tabelo.source("markdown")).toHaveAttribute(
		"aria-invalid",
		"true",
	);

	await page.keyboard.press(shortcut);
	const dialog = page.getByRole("dialog");

	await expect(
		dialog.getByRole("button", { name: copy.download.copyDraft }),
	).toBeVisible();

	// Downloading gives exactly what the message promised: the last valid table.
	const file = await savedFile(page, async () => {
		await page
			.getByRole("button", { name: copy.actions.download, exact: true })
			.click();
	});
	expect(file.body).toContain("Ingrid");
	expect(file.body).not.toContain("Bo");
});

test("the draft can be copied out of the chooser", async ({ page, tabelo }) => {
	await page.addInitScript(() => {
		Object.defineProperty(window, "__copied", {
			value: [] as string[],
			configurable: true,
		});
		Object.defineProperty(navigator, "clipboard", {
			value: {
				writeText: async (text: string) => {
					(window as unknown as { __copied: string[] }).__copied.push(text);
				},
			},
			configurable: true,
		});
	});
	await page.reload();
	await tabelo.dismissWelcome();
	await expect(tabelo.workspace).toBeVisible();

	const draft = "| Name |\n| not a divider |\n| Bo |";
	await tabelo.source("markdown").fill(draft);
	await expect(tabelo.source("markdown")).toHaveAttribute(
		"aria-invalid",
		"true",
	);

	await page.keyboard.press(shortcut);
	await page.getByRole("button", { name: copy.download.copyDraft }).click();

	expect(
		await page.evaluate(() =>
			(window as unknown as { __copied: string[] }).__copied.at(-1),
		),
	).toBe(draft);
});

test("a healthy document shows no draft warning", async ({ page, tabelo }) => {
	await expect(tabelo.workspace).toBeVisible();
	await page.keyboard.press(shortcut);

	await expect(page.getByRole("dialog")).toBeVisible();
	await expect(
		page.getByRole("button", { name: copy.download.copyDraft }),
	).toHaveCount(0);
});
