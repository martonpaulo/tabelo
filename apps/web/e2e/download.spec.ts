import type { Page } from "@playwright/test";
import { defaultHeader } from "@/core/document";
import { listDownloadableCodecs } from "@/formats";
import { copy } from "@/ui/copy";
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
	await page.getByRole("button", { name: copy.actions.openAppMenu }).click();
	await page
		.getByRole("menuitem", { name: copy.actions.downloadTable })
		.click();
	await expect(page.getByRole("dialog")).toBeVisible();
}

test("the chooser lists every registered format", async ({ page, tabelo }) => {
	await expect(tabelo.workspace).toBeVisible();
	await openChooser(page);

	const dialog = page.getByRole("dialog");
	await expect(dialog).toContainText(copy.download.hint);
	for (const codec of listDownloadableCodecs()) {
		await expect(
			dialog.getByRole("radio", { name: copy.views[codec.id].shortLabel }),
		).toBeVisible();
	}
});

test("only CSV offers the header row choice", async ({ page, tabelo }) => {
	await expect(tabelo.workspace).toBeVisible();
	await openChooser(page);
	const dialog = page.getByRole("dialog");

	// Markdown is selected first and has no output choices to make.
	await expect(
		dialog.getByRole("checkbox", {
			name: copy.download.option("includeHeader"),
		}),
	).toHaveCount(0);

	await dialog.getByRole("radio", { name: copy.views.csv.label }).click();
	const option = dialog.getByRole("checkbox", {
		name: copy.download.option("includeHeader"),
	});
	await expect(option).toBeVisible();
	await expect(option).toBeChecked();

	await dialog.getByRole("radio", { name: copy.views.tsv.label }).click();
	await expect(
		dialog.getByRole("checkbox", {
			name: copy.download.option("includeHeader"),
		}),
	).toHaveCount(0);
});

test("CSV includes the header row by default", async ({ page, tabelo }) => {
	await tabelo.editCell(1, 1, "Inez");

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

	expect(file.name).toBe("table.csv");
	expect(file.body.split("\n")[0]).toBe([0, 1, 2].map(defaultHeader).join(","));
	expect(file.body).toContain("Inez");
});

test("unchecking the option omits the header row from the file only", async ({
	page,
	tabelo,
}) => {
	await tabelo.editCell(1, 1, "Inez");

	const file = await savedFile(page, async () => {
		await openChooser(page);
		const dialog = page.getByRole("dialog");
		await dialog.getByRole("radio", { name: copy.views.csv.label }).click();
		await dialog
			.getByRole("checkbox", { name: copy.download.option("includeHeader") })
			.click();
		await page
			.getByRole("button", { name: copy.actions.download, exact: true })
			.click();
	});

	expect(file.body.split("\n")[0]).toBe("Inez,,");
	expect(file.body).not.toContain(defaultHeader(0));

	// The table itself still has its header, and so does every other view.
	await expect(tabelo.header(1)).toHaveText(defaultHeader(0));
	await expect(tabelo.source("markdown")).toContainText(defaultHeader(0));
});

// TSV shares CSV's serializer, so it is the format that would actually leak.
test("the option does not leak into other formats", async ({
	page,
	tabelo,
}) => {
	await tabelo.editCell(1, 1, "Inez");

	await openChooser(page);
	const dialog = page.getByRole("dialog");
	await dialog.getByRole("radio", { name: copy.views.csv.label }).click();
	await dialog
		.getByRole("checkbox", { name: copy.download.option("includeHeader") })
		.click();
	await page.getByRole("button", { name: copy.actions.cancel }).click();

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

	expect(file.name).toBe("table.tsv");
	expect(file.body.split("\n")[0]).toBe(
		[0, 1, 2].map(defaultHeader).join("\t"),
	);
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
// answer it with Save Page — which writes the app shell, not the table.

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
		await expect(page.getByRole("dialog")).toContainText(copy.download.title);
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
	await tabelo.source("markdown").fill("| Name |\n| --- |\n| Inez |");
	await expect(tabelo.cell(1, 1)).toHaveText("Inez");

	const file = await savedFile(page, async () => {
		await page.keyboard.press(shortcut);
		await expect(page.getByRole("dialog")).toBeVisible();
		await page
			.getByRole("button", { name: copy.actions.download, exact: true })
			.click();
	});

	expect(file.name).toBe("table.md");
	expect(file.body).toContain("Inez");
});

test("an invalid draft is named rather than silently left out", async ({
	page,
	tabelo,
}) => {
	await tabelo.source("markdown").fill("| Name |\n| --- |\n| Inez |");
	await expect(tabelo.cell(1, 1)).toHaveText("Inez");
	await tabelo.source("markdown").fill("| Name |\n| not a divider |\n| Bo |");
	await expect(tabelo.source("markdown")).toHaveAttribute(
		"aria-invalid",
		"true",
	);

	await page.keyboard.press(shortcut);
	const dialog = page.getByRole("dialog");
	await expect(dialog).toContainText(
		"This source is not valid yet. Download the last valid table or copy the draft.",
	);
	await expect(
		dialog.getByRole("button", { name: copy.download.copyDraft }),
	).toBeVisible();

	// Downloading gives exactly what the message promised: the last valid table.
	const file = await savedFile(page, async () => {
		await page
			.getByRole("button", { name: copy.actions.download, exact: true })
			.click();
	});
	expect(file.body).toContain("Inez");
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
		page.getByText(copy.download.invalidDraft, { exact: true }),
	).toHaveCount(0);
});
