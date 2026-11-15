import type { CDPSession, Page } from "@playwright/test";
import { expect, test } from "./fixtures";

// #558: committing a grid cell laid the whole table out once per geometry
// read, because each read came after another write in the same task: the
// editor's removal, the fill handle, the focus mark's travel, and focus. The
// cost of one layout grows with the table, so the count is the contract: the
// keystroke's own task pays at most one. Counted from Chromium's own trace,
// the only place a forced layout is visible.

interface TraceEvent {
	readonly name: string;
	readonly ph: string;
	readonly ts: number;
	readonly dur?: number;
	readonly tid: number;
	readonly args?: { readonly data?: { readonly type?: string } };
}

async function traced(
	page: Page,
	action: () => Promise<void>,
): Promise<TraceEvent[]> {
	const client: CDPSession = await page.context().newCDPSession(page);
	const events: TraceEvent[] = [];
	client.on("Tracing.dataCollected", ({ value }) => {
		events.push(...(value as unknown as TraceEvent[]));
	});
	const complete = new Promise((resolve) =>
		client.once("Tracing.tracingComplete", resolve),
	);
	await client.send("Tracing.start", {
		traceConfig: {
			includedCategories: [
				"devtools.timeline",
				"disabled-by-default-devtools.timeline",
			],
		},
	});
	await action();
	await client.send("Tracing.end");
	await complete;
	await client.detach();
	return events;
}

// Layouts inside the task that dispatched the first event of `type`.
function layoutsInTaskOf(events: readonly TraceEvent[], type: string): number {
	const dispatch = events.find(
		(event) =>
			event.name === "EventDispatch" && event.args?.data?.type === type,
	);
	if (!dispatch) throw new Error(`The trace holds no ${type} event.`);
	const end = dispatch.ts + (dispatch.dur ?? 0);
	const task = events.find(
		(event) =>
			event.name === "RunTask" &&
			event.tid === dispatch.tid &&
			event.ts <= dispatch.ts &&
			event.ts + (event.dur ?? 0) >= end,
	);
	if (!task) throw new Error(`The trace holds no task around ${type}.`);
	const taskEnd = task.ts + (task.dur ?? 0);
	return events.filter(
		(event) =>
			event.name === "Layout" &&
			event.ph === "X" &&
			event.tid === dispatch.tid &&
			event.ts >= task.ts &&
			event.ts <= taskEnd,
	).length;
}

test("committing a cell with Enter lays the table out at most once", async ({
	page,
	tabelo,
}) => {
	await tabelo.cell(1, 1).click();
	await page.keyboard.type("Ingrid");
	await expect(tabelo.cell(1, 1).locator("[data-cell-editor]")).toBeFocused();

	const events = await traced(page, () => page.keyboard.press("Enter"));

	await expect(tabelo.cell(2, 1)).toBeFocused();
	await expect(tabelo.cell(1, 1)).toHaveText("Ingrid");
	expect(layoutsInTaskOf(events, "keydown")).toBeLessThanOrEqual(1);
});
