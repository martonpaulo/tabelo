import { copy } from "@/copy/copy";
import v1 from "@/persistence/fixtures/v1.json" with { type: "json" };
import v4 from "@/persistence/fixtures/v4.json" with { type: "json" };
import v5 from "@/persistence/fixtures/v5.json" with { type: "json" };
import { CURRENT_VERSION, STORAGE_KEY } from "@/persistence/schema";
import { expect, test } from "./fixtures";

const validMarkdown = "| Name |\n| --- |\n| Ingrid |";
const invalidMarkdown = "| Name |\n| not a divider |\n| Ingrid |";

test("the oldest shipped payload restores and saves as the current schema", async ({
	tabelo,
}) => {
	await tabelo.page.addInitScript(
		({ key, payload }) => {
			window.localStorage.setItem(key, JSON.stringify(payload));
		},
		{ key: STORAGE_KEY, payload: v1 },
	);

	await tabelo.page.reload();

	await expect(tabelo.workspace).toBeVisible();
	await expect(tabelo.pane("grid")).toBeVisible();
	await expect(tabelo.pane("csv")).toBeVisible();
	await expect(tabelo.header(1)).toHaveText("Name");
	await expect(tabelo.cell(1, 1)).toHaveText("Ingrid");
	await expect(tabelo.cell(2, 1)).toHaveText("Paulo");

	await tabelo.editCell(1, 2, "Writer");
	await expect
		.poll(() =>
			tabelo.page.evaluate((key) => {
				const saved = JSON.parse(window.localStorage.getItem(key) ?? "null");
				return {
					version: saved?.version,
					name: saved?.name,
					value: saved?.document?.rows?.[0]?.cells?.["c-role"],
					zooms: saved?.workspace?.panes?.map(
						(pane: { zoom?: number }) => pane.zoom,
					),
				};
			}, STORAGE_KEY),
		)
		.toEqual({
			version: CURRENT_VERSION,
			name: "Untitled table",
			value: "Writer",
			zooms: [1, 1],
		});
});

test("v4 document widths migrate into workspace preferences", async ({
	tabelo,
}) => {
	await tabelo.page.addInitScript(
		({ key, payload }) => {
			window.localStorage.setItem(key, JSON.stringify(payload));
		},
		{ key: STORAGE_KEY, payload: v4 },
	);
	await tabelo.page.reload();
	await tabelo.workspace.waitFor({ state: "visible" });

	const first = (await tabelo.header(1).boundingBox())?.width ?? 0;
	const second = (await tabelo.header(2).boundingBox())?.width ?? 0;
	expect(first).toBeGreaterThan(second);
	await tabelo.editCell(1, 2, "Writer");
	await expect
		.poll(() =>
			tabelo.page.evaluate((key) => {
				const saved = JSON.parse(localStorage.getItem(key) ?? "null");
				return {
					version: saved?.version,
					width: saved?.workspace?.columnWidths?.["c-name"],
					hasDocumentWidth: saved?.document?.columns?.some(
						(column: Record<string, unknown>) => "width" in column,
					),
				};
			}, STORAGE_KEY),
		)
		.toEqual({ version: CURRENT_VERSION, width: 18, hasDocumentWidth: false });
});

// The table a version-5 release saved holds strings only. It has to come back
// intact and be written out under the typed schema, with every column recorded
// as expecting text and no value re-read as a number along the way.
test("a v5 payload migrates to the typed schema with its values preserved", async ({
	tabelo,
}) => {
	await tabelo.page.addInitScript(
		({ key, payload }) => {
			window.localStorage.setItem(key, JSON.stringify(payload));
		},
		{ key: STORAGE_KEY, payload: v5 },
	);
	await tabelo.page.reload();

	await expect(tabelo.workspace).toBeVisible();
	await expect(tabelo.header(1)).toHaveText("Name");
	await expect(tabelo.cell(1, 1)).toHaveText("Ingrid");

	await tabelo.editCell(1, 2, "Writer");
	await expect
		.poll(() =>
			tabelo.page.evaluate((key) => {
				const saved = JSON.parse(window.localStorage.getItem(key) ?? "null");
				return {
					version: saved?.version,
					expectedTypes: saved?.document?.columns?.map(
						(column: { expectedType?: string }) => column.expectedType,
					),
					name: saved?.document?.rows?.[0]?.cells?.["c-name"],
					role: saved?.document?.rows?.[0]?.cells?.["c-role"],
				};
			}, STORAGE_KEY),
		)
		.toEqual({
			version: CURRENT_VERSION,
			expectedTypes: ["text", "text"],
			name: "Ingrid",
			role: "Writer",
		});
});

test("reload within debounce restores an invalid draft and its last valid table", async ({
	tabelo,
}) => {
	const source = tabelo.source("markdown");
	await source.fill(validMarkdown);
	await expect(tabelo.cell(1, 1)).toHaveText("Ingrid");
	await source.fill(invalidMarkdown);

	await tabelo.page.reload();

	await expect(tabelo.workspace).toBeVisible();
	await expect(tabelo.cell(1, 1)).toHaveText("Ingrid");
	await expect(
		tabelo.pane("markdown").locator(".cm-diagnosticError"),
	).toHaveCount(1);
	await expect
		.poll(() =>
			tabelo
				.source("markdown")
				.evaluate((element) =>
					Array.from(
						element.querySelectorAll(".cm-line"),
						(line) => line.textContent ?? "",
					).join("\n"),
				),
		)
		.toBe(invalidMarkdown);
});

test("unreadable storage stays byte-exact until explicit replacement", async ({
	tabelo,
}) => {
	const raw = "{invalid json\nwith exact bytes\t\u0000";
	await tabelo.page.addInitScript((value) => {
		window.localStorage.setItem("tabelo.document", value);
	}, raw);

	await tabelo.page.reload();

	await expect(tabelo.notice()).toBeVisible();
	expect(
		await tabelo.page.evaluate(() =>
			window.localStorage.getItem("tabelo.document"),
		),
	).toBe(raw);

	await tabelo.page
		.getByRole("button", { name: copy.notices.replaceSavedData })
		.click();

	await expect(tabelo.notice()).toBeVisible();
	expect(
		await tabelo.page.evaluate(() =>
			window.localStorage.getItem("tabelo.document.recovery"),
		),
	).toBe(raw);
	expect(
		await tabelo.page.evaluate(() =>
			JSON.parse(window.localStorage.getItem("tabelo.document") ?? "null"),
		),
	).toMatchObject({ version: CURRENT_VERSION, draft: null });
});

test("quota notice clears after a later successful write", async ({
	tabelo,
}) => {
	await tabelo.page.evaluate(() => {
		const original = Storage.prototype.setItem;
		const target = window as typeof window & {
			restoreTabeloStorage?: () => void;
		};
		target.restoreTabeloStorage = () => {
			Storage.prototype.setItem = original;
		};
		Storage.prototype.setItem = function (key, value) {
			if (key === "tabelo.document") {
				throw new DOMException("full", "QuotaExceededError");
			}
			return original.call(this, key, value);
		};
	});

	await tabelo.editCell(1, 1, "First");
	await expect(tabelo.notice()).toBeVisible();

	await tabelo.page.evaluate(() => {
		const target = window as typeof window & {
			restoreTabeloStorage?: () => void;
		};
		target.restoreTabeloStorage?.();
	});
	await tabelo.editCell(1, 2, "Second");

	await expect(tabelo.notice()).toHaveCount(0);
});
