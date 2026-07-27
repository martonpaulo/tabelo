import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

// Copy source hands over the text the pane is showing. The case that decides
// the design is a pane holding source that does not parse: every other view is
// still showing the last valid table, but this pane is showing the draft, and
// the draft is what has to reach the clipboard.

const invalidMarkdown = "| Name |\n| not a divider |\n| Ana |";
const writeRecovery = "The source could not be copied";

// A clipboard that accepts everything and remembers it, so the copied bytes can
// be asserted without the permission plumbing Playwright cannot grant in every
// browser.
async function recordingClipboard(page: Page): Promise<void> {
	await page.addInitScript(() => {
		Object.defineProperty(window, "__copied", {
			value: [] as string[],
			configurable: true,
			writable: true,
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
}

function lastCopied(page: Page): Promise<string | undefined> {
	return page.evaluate(() =>
		(window as unknown as { __copied: string[] }).__copied.at(-1),
	);
}

test("copies the visible source of a valid view", async ({ page, tabelo }) => {
	await recordingClipboard(page);
	await page.reload();
	await expect(tabelo.workspace).toBeVisible();
	await tabelo.editCell(1, 1, "Ana");

	await tabelo.runPaneCommand("Markdown", "Copy source");

	await expect(
		tabelo.status.filter({ hasText: "Source copied to the clipboard." }),
	).toBeVisible();
	const copied = await lastCopied(page);
	expect(copied).toContain("Ana");
	expect(copied).toContain("---");
});

test("copies a pending invalid draft byte for byte", async ({
	page,
	tabelo,
}) => {
	await recordingClipboard(page);
	await page.reload();
	await expect(tabelo.workspace).toBeVisible();

	await tabelo.source("Markdown").fill(invalidMarkdown);
	await expect(tabelo.source("Markdown")).toHaveAttribute(
		"aria-invalid",
		"true",
	);

	await tabelo.runPaneCommand("Markdown", "Copy source");

	// Not the last valid projection the other panes are still showing.
	expect(await lastCopied(page)).toBe(invalidMarkdown);
});

test("a second pane on the same format copies its own projection", async ({
	page,
	tabelo,
}) => {
	await recordingClipboard(page);
	await page.reload();
	await expect(tabelo.workspace).toBeVisible();
	await tabelo.editCell(1, 1, "Ana");

	// Two Markdown panes: the first owns the invalid draft, the second is a
	// pure projection of the document.
	await tabelo.runPaneCommand("Visual table", "Add view");
	await tabelo.choosePaneView("CSV", "Markdown");
	await expect(tabelo.pane("Markdown")).toHaveCount(2);

	await tabelo.sourceAt("Markdown", 0).fill(invalidMarkdown);
	await tabelo.runPaneCommand("Markdown", "Copy source", 1);

	const copied = await lastCopied(page);
	expect(copied).not.toBe(invalidMarkdown);
	expect(copied).toContain("---");
});

test("every source view offers the action and the preview does not", async ({
	tabelo,
}) => {
	let current = "Markdown";
	for (const view of ["Markdown", "CSV", "TSV", "HTML source", "Jira"]) {
		if (view !== current) {
			await tabelo.choosePaneView(current, view);
			current = view;
		}
		const menu = await tabelo.openPaneMenu(view);
		await expect(
			menu.getByRole("menuitem", { name: "Copy source" }),
		).toBeVisible();
		await tabelo.page.keyboard.press("Escape");
	}

	await tabelo.choosePaneView(current, "Rendered preview");
	const preview = await tabelo.openPaneMenu("Rendered preview");
	await expect(
		preview.getByRole("menuitem", { name: "Copy source" }),
	).toHaveCount(0);
});

test("a refused copy explains itself with source-specific advice", async ({
	page,
	tabelo,
}) => {
	await page.addInitScript(() => {
		Object.defineProperty(navigator, "clipboard", {
			value: {
				writeText: () => {
					const error = new Error("denied");
					error.name = "NotAllowedError";
					return Promise.reject(error);
				},
			},
			configurable: true,
		});
	});
	await page.reload();
	await expect(tabelo.workspace).toBeVisible();

	await tabelo.runPaneCommand("Markdown", "Copy source");

	await expect(tabelo.status.filter({ hasText: writeRecovery })).toBeVisible();
});

test("copying returns focus to the pane menu without disturbing the grid", async ({
	page,
	tabelo,
}) => {
	const selected = () =>
		page.evaluate(
			() =>
				document
					.querySelector('[role="gridcell"][aria-selected="true"]')
					?.getAttribute("data-cell") ?? null,
		);

	await tabelo.editCell(2, 1, "Ana");
	const before = await selected();
	expect(before).not.toBeNull();

	await tabelo.runPaneCommand("Markdown", "Copy source");

	// The menu hands focus back to its own trigger, and the grid selection is
	// exactly where the user left it.
	await expect(tabelo.paneMenuTrigger("Markdown")).toBeFocused();
	expect(await selected()).toBe(before);
});
