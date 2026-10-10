import type { Page } from "@playwright/test";
import { DEFAULT_TABLE_NAME } from "@/copy/product";
import { samplePerson } from "@/core/sample-data";
import { CURRENT_VERSION, type PersistedState } from "@/persistence/schema";
import type { ViewId } from "@/views/types";
import { INHERIT_SOURCE_DISPLAY } from "@/workspace/source-display";
import { expect, test } from "./fixtures";
import { renderedSource, seedTableStorage, TabeloPage } from "./helpers";

// The source editor and the preview arrive as their own chunks, after the
// page. These cover what the user sees while one is late (#420), with the
// chunk held at the network the way a slow connection would.
//
// The service worker is blocked so that every chunk request reaches the
// route below. Once it controls the page it answers from its own cache, which
// is a different path than a lost request and not the one these exercise.
test.use({ serviceWorkers: "block" });

type LazyChunk = "source-view" | "html-preview";

function chunkPattern(chunk: LazyChunk): RegExp {
	return new RegExp(`/assets/${chunk}-[^/]+\\.js$`);
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
function savedWorkspace(view: ViewId): string {
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
		draft: null,
	} satisfies PersistedState);
}

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
