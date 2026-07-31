import type { Page } from "@playwright/test";
import { copy } from "@/ui/copy";
import type { ViewId } from "@/views/types";
import { expect, test } from "./fixtures";

// Copy source hands over the text the pane is showing. The case that decides
// the design is a pane holding source that does not parse: every other view is
// still showing the last valid table, but this pane is showing the draft, and
// the draft is what has to reach the clipboard.

const invalidMarkdown = "| Name |\n| not a divider |\n| Inez |";
const writeRecovery = "The source could not be copied";

// A clipboard that accepts everything and remembers it, so the copied bytes can
// be asserted without the permission plumbing Playwright cannot grant in every
// browser.
async function recordingClipboard(page: Page): Promise<void> {
	await page.addInitScript(() => {
		Object.defineProperty(window, "__copied", {
			value: [] as { text: string; html?: string }[],
			configurable: true,
			writable: true,
		});

		Object.defineProperty(window, "ClipboardItem", {
			value: class {
				types: string[];
				data: Record<string, Blob>;
				constructor(data: Record<string, Blob>) {
					this.data = data;
					this.types = Object.keys(data);
				}
				async getType(type: string) {
					return this.data[type];
				}
			},
			configurable: true,
		});

		Object.defineProperty(navigator, "clipboard", {
			value: {
				writeText: async (text: string) => {
					(
						window as unknown as { __copied: { text: string; html?: string }[] }
					).__copied.push({ text });
				},
				write: async (
					items: Array<{
						types: string[];
						getType: (type: string) => Promise<{ text: () => Promise<string> }>;
					}>,
				) => {
					const item = items[0];
					let text = "";
					let html: string | undefined;
					if (item.types.includes("text/plain")) {
						text = await (await item.getType("text/plain")).text();
					}
					if (item.types.includes("text/html")) {
						html = await (await item.getType("text/html")).text();
					}
					(
						window as unknown as { __copied: { text: string; html?: string }[] }
					).__copied.push({ text, html });
				},
			},
			configurable: true,
		});
	});
}

function lastCopied(
	page: Page,
): Promise<{ text: string; html?: string } | undefined> {
	return page.evaluate(() =>
		(
			window as unknown as { __copied: { text: string; html?: string }[] }
		).__copied.at(-1),
	);
}

test("copies the visible source of a valid view", async ({ page, tabelo }) => {
	await recordingClipboard(page);
	await page.reload();
	await tabelo.dismissWelcome();
	await expect(tabelo.workspace).toBeVisible();
	await tabelo.editCell(1, 1, "Inez");

	await tabelo.runPaneCommand("markdown", "copySource");

	await expect(
		tabelo.notice().filter({ hasText: "Source copied to the clipboard" }),
	).toBeVisible();
	const copied = await lastCopied(page);
	expect(copied?.text).toContain("Inez");
	expect(copied?.text).toContain("---");
});

test("copies a pending invalid draft byte for byte", async ({
	page,
	tabelo,
}) => {
	await recordingClipboard(page);
	await page.reload();
	await tabelo.dismissWelcome();
	await expect(tabelo.workspace).toBeVisible();

	await tabelo.source("markdown").fill(invalidMarkdown);
	await expect(tabelo.source("markdown")).toHaveAttribute(
		"aria-invalid",
		"true",
	);

	await tabelo.runPaneCommand("markdown", "copySource");

	// Not the last valid projection the other panes are still showing.
	expect((await lastCopied(page))?.text).toBe(invalidMarkdown);
});

test("a second pane cannot duplicate a format", async ({ tabelo }) => {
	await tabelo.addViewBySplit("grid", "bottom", "csv");
	const menu = await tabelo.openPaneViewMenu("csv");
	await expect(
		menu.getByRole("menuitemradio", { name: copy.views.markdown.label }),
	).toBeDisabled();
	await expect(tabelo.pane("markdown")).toHaveCount(1);
});

test("every source view offers the action and the preview does not", async ({
	tabelo,
}) => {
	let current: ViewId = "markdown";
	for (const view of ["markdown", "csv", "tsv", "html", "jira"] as const) {
		if (view !== current) {
			await tabelo.choosePaneView(current, view);
			current = view;
		}
		const menu = await tabelo.openPaneMenu(view);
		await expect(
			menu.getByRole("menuitem", { name: copy.actions.copySource }),
		).toBeVisible();
		// The next iteration reopens this same pane's menu, so it has to be
		// fully closed first. The trigger's own toggle is used rather than
		// Escape: Base UI attaches the menu's dismissal listener in an effect
		// that runs after the opening click commits, and the trigger does not
		// hold focus meanwhile, so an Escape inside that window is dropped.
		// Measured at under 8ms: only automation is fast enough to hit it,
		// which is why it is left upstream rather than patched here.
		await tabelo.paneMenuTrigger(view).click();
		await expect(menu).toHaveCount(0);
	}

	await tabelo.choosePaneView(current, "html-preview");
	const preview = await tabelo.openPaneMenu("html-preview");
	await expect(
		preview.getByRole("menuitem", { name: copy.actions.copySource }),
	).toHaveCount(0);
});

test("copies both HTML and TSV from the preview pane", async ({
	page,
	tabelo,
}) => {
	await recordingClipboard(page);
	await page.reload();
	await tabelo.dismissWelcome();
	await expect(tabelo.workspace).toBeVisible();

	// Create some content
	await tabelo.editCell(1, 1, "Inez");

	await tabelo.choosePaneView("markdown", "html-preview");
	await tabelo.runPaneCommand("html-preview", "copyFormattedTable");

	await expect(
		tabelo
			.notice()
			.filter({ hasText: "Formatted table copied to the clipboard" }),
	).toBeVisible();

	const copied = await lastCopied(page);
	expect(copied?.text).toContain("Inez");
	expect(copied?.text).toContain("\t"); // TSV
	expect(copied?.html).toContain("Inez");
	expect(copied?.html).toContain("<table");
});

test("a refused copy explains itself with source-specific advice", async ({
	page,
	tabelo,
}) => {
	await page.addInitScript(() => {
		Object.defineProperty(navigator, "clipboard", {
			value: {
				write: () => {
					const error = new Error("denied");
					error.name = "NotAllowedError";
					return Promise.reject(error);
				},
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
	await tabelo.dismissWelcome();
	await expect(tabelo.workspace).toBeVisible();

	await tabelo.runPaneCommand("markdown", "copySource");

	await expect(
		tabelo.notice().filter({ hasText: writeRecovery }),
	).toBeVisible();
});

test("a refused copy explains itself with preview-specific advice", async ({
	page,
	tabelo,
}) => {
	await page.addInitScript(() => {
		Object.defineProperty(navigator, "clipboard", {
			value: {
				write: () => {
					const error = new Error("denied");
					error.name = "NotAllowedError";
					return Promise.reject(error);
				},
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
	await tabelo.dismissWelcome();
	await expect(tabelo.workspace).toBeVisible();

	await tabelo.choosePaneView("markdown", "html-preview");
	await tabelo.runPaneCommand("html-preview", "copyFormattedTable");

	await expect(
		tabelo.notice().filter({
			hasText: "The table could not be copied. Select it and use ⌘C/Ctrl+C.",
		}),
	).toBeVisible();
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

	await tabelo.editCell(2, 1, "Inez");
	const before = await selected();
	expect(before).not.toBeNull();

	await tabelo.runPaneCommand("markdown", "copySource");

	// The menu hands focus back to its own trigger, and the grid selection is
	// exactly where the user left it.
	await expect(tabelo.paneMenuTrigger("markdown")).toBeFocused();
	expect(await selected()).toBe(before);
});
