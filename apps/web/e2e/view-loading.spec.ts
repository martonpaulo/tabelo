import type { Page } from "@playwright/test";
import { copy } from "@/copy/copy";
import { DEFAULT_TABLE_NAME } from "@/copy/product";
import { samplePerson } from "@/core/sample-data";
import { CURRENT_VERSION, type PersistedState } from "@/persistence/schema";
import type { ViewId } from "@/views/types";
import { INHERIT_SOURCE_DISPLAY } from "@/workspace/source-display";
import { expect, test } from "./fixtures";
import { renderedSource, seedTableStorage, TabeloPage } from "./helpers";

// The source editor and the preview arrive as their own chunks, after the
// page. These cover what the user sees while one is late (#420) and after one
// failed to arrive at all (#419), with the chunk held or refused at the
// network the way a slow or dropped connection would.
//
// The service worker is blocked so that every chunk request reaches the
// route below. Once it controls the page it answers from its own cache, which
// is a different path than a lost request and not the one these exercise.
test.use({ serviceWorkers: "block" });

type LazyChunk = "source-view" | "html-preview";

function chunkPattern(chunk: LazyChunk): RegExp {
	return new RegExp(`/assets/${chunk}-[^/]+\\.js$`);
}

// Refuses every request for the chunk until `restore` is called, as a
// connection that drops and later returns.
async function dropChunk(
	page: Page,
	chunk: LazyChunk,
): Promise<{ restore: () => void }> {
	let offline = true;
	await page.route(chunkPattern(chunk), (route) =>
		offline ? route.abort("internetdisconnected") : route.continue(),
	);
	return {
		restore: () => {
			offline = false;
		},
	};
}

// Holds every request for the chunk until `release` is called.
async function holdChunk(
	page: Page,
	chunk: LazyChunk,
): Promise<{ requested: Promise<void>; release: () => void }> {
	let release = () => {};
	const released = new Promise<void>((resolve) => {
		release = resolve;
	});
	let requestedResolve = () => {};
	const requested = new Promise<void>((resolve) => {
		requestedResolve = resolve;
	});
	await page.route(chunkPattern(chunk), async (route) => {
		requestedResolve();
		await released;
		await route.continue();
	});
	return { requested, release };
}

// A saved, nonblank table showing the grid beside one lazy view.
function savedWorkspace(view: ViewId, draft: string | null = null): string {
	const person = samplePerson(0);
	return JSON.stringify({
		version: CURRENT_VERSION,
		name: DEFAULT_TABLE_NAME,
		document: {
			columns: [
				{
					id: "column-name",
					header: "Name",
					align: "default",
					expectedType: "text",
				},
				{
					id: "column-city",
					header: "City",
					align: "default",
					expectedType: "text",
				},
			],
			rows: [
				{
					id: "row-one",
					cells: { "column-name": person.name, "column-city": person.city },
				},
			],
		},
		workspace: {
			layout: "columns",
			panes: [
				{
					id: "pane-grid",
					view: "grid",
					slots: ["a", "c"],
					zoom: 1,
					...INHERIT_SOURCE_DISPLAY,
				},
				{
					id: "pane-lazy",
					view,
					slots: ["b", "d"],
					zoom: 1,
					...INHERIT_SOURCE_DISPLAY,
				},
			],
			wrappedColumns: [],
			columnWidths: {},
			pinFirstDataRow: false,
			pinFirstDataColumn: false,
			columnRatio: 0.5,
			rowRatio: 0.5,
			activePaneId: "pane-grid",
		},
		draft:
			draft === null
				? null
				: { paneId: "pane-lazy", viewId: view, text: draft },
	} satisfies PersistedState);
}

// The failure a dropped connection leaves behind: the pane stopped with a
// page reload as its recovery command.
function codeUnavailable(tabelo: TabeloPage, view: ViewId) {
	const pane = tabelo.pane(view);
	return {
		status: pane.getByRole("status", { name: copy.a11y.failedView }),
		reload: pane.getByRole("button", { name: copy.workspace.reloadApp }),
	};
}

test("a source view whose code never arrived comes back with Reload Tabelo, keeping unfinished edits", async ({
	page,
}) => {
	const unfinished = `| Name |\n| not a divider |\n| ${samplePerson(1).name} |`;
	await seedTableStorage(page, savedWorkspace("markdown", unfinished));
	const network = await dropChunk(page, "source-view");
	const tabelo = new TabeloPage(page);
	await page.goto("/");

	// The saved workspace opens, the pane that needed the code says it stopped,
	// and the grid beside it is untouched.
	await tabelo.workspace.waitFor({ state: "visible" });
	const failed = codeUnavailable(tabelo, "markdown");
	await expect(failed.status).toBeVisible();
	await expect(tabelo.cell(1, 1)).toHaveText(samplePerson(0).name);

	// Once the connection is back, the command loads the page again, from the
	// keyboard as well, and the unfinished edits come back in the editor.
	network.restore();
	await failed.reload.focus();
	await Promise.all([page.waitForEvent("load"), page.keyboard.press("Enter")]);
	const markdown = tabelo.pane("markdown");
	await expect(tabelo.source("markdown")).toBeVisible();
	await expect
		.poll(() => renderedSource(markdown))
		.toContain(samplePerson(1).name);
});

test("Reload Tabelo stays on the page while the table can't be saved", async ({
	page,
}) => {
	await seedTableStorage(page, savedWorkspace("markdown"));
	await dropChunk(page, "source-view");
	const tabelo = new TabeloPage(page);
	await page.goto("/");
	const failed = codeUnavailable(tabelo, "markdown");
	await expect(failed.status).toBeVisible();

	// Storage refuses every write from here on, so a reload would lose the
	// table. The page stays, says why, and keeps the table on screen.
	await page.evaluate(() => {
		Object.assign(window, { tabeloStayedOnPage: true });
		Storage.prototype.setItem = () => {
			throw new DOMException("refused", "QuotaExceededError");
		};
	});
	await failed.reload.click();
	await expect(tabelo.notice("error").first()).toBeVisible();
	expect(await page.evaluate(() => "tabeloStayedOnPage" in window)).toBe(true);
	await expect(failed.status).toBeVisible();
	await expect(tabelo.cell(1, 1)).toHaveText(samplePerson(0).name);
});

test("a saved preview whose code never arrived comes back with Reload Tabelo", async ({
	page,
}) => {
	await seedTableStorage(page, savedWorkspace("html-preview"));
	const network = await dropChunk(page, "html-preview");
	const tabelo = new TabeloPage(page);
	await page.goto("/");

	// A failed load still opens the saved workspace, never the welcome
	// surface, and the grid keeps editing the table.
	await tabelo.workspace.waitFor({ state: "visible" });
	await expect(tabelo.welcome).toHaveCount(0);
	const failed = codeUnavailable(tabelo, "html-preview");
	await expect(failed.status).toBeVisible();
	const name = samplePerson(1).name;
	await tabelo.editCell(1, 1, name);
	await expect(tabelo.cell(1, 1)).toHaveText(name);

	network.restore();
	await Promise.all([page.waitForEvent("load"), failed.reload.click()]);
	const preview = tabelo.pane("html-preview");
	await expect(
		preview.getByRole("table", { name: copy.a11y.preview }),
	).toContainText(name);
	await expect(tabelo.cell(1, 1)).toHaveText(name);
});

test("a saved workspace says it is loading while its views' code is on the way", async ({
	page,
}) => {
	await seedTableStorage(page, savedWorkspace("markdown"));
	const chunk = await holdChunk(page, "source-view");
	const tabelo = new TabeloPage(page);
	await page.goto("/");
	await chunk.requested;

	// While the code is held, the page is a written status rather than blank,
	// and neither the welcome surface nor an empty workspace stands in for the
	// saved table. Nothing takes focus.
	const waiting = page.locator("#app").getByRole("status");
	await expect(waiting).toBeVisible();
	await expect(waiting).not.toBeEmpty();
	await expect(tabelo.welcome).toHaveCount(0);
	await expect(tabelo.workspace).toHaveCount(0);
	expect(
		await page.evaluate(() => document.activeElement === document.body),
	).toBe(true);

	// Released, the saved workspace replaces the status.
	chunk.release();
	await expect(tabelo.source("markdown")).toBeVisible();
	await expect(tabelo.cell(1, 1)).toHaveText(samplePerson(0).name);
	await expect
		.poll(() => renderedSource(tabelo.pane("markdown")))
		.toContain(samplePerson(0).name);
	await expect(page.locator("#app > [role=status]")).toHaveCount(0);

	// A warm start opens the same saved workspace.
	await page.reload();
	await expect(tabelo.source("markdown")).toBeVisible();
	await expect(tabelo.welcome).toHaveCount(0);
});
