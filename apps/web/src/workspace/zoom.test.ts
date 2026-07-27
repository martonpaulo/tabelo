import { describe, expect, it } from "vitest";
import {
	clampPaneZoom,
	DEFAULT_PANE_ZOOM,
	MAX_PANE_ZOOM,
	MIN_PANE_ZOOM,
	PANE_ZOOM_LEVELS,
	paneZoomPercent,
	stepPaneZoom,
} from "./zoom";

describe("the pane zoom ladder", () => {
	it("is bounded, ordered, and passes through the default", () => {
		expect(PANE_ZOOM_LEVELS).toContain(DEFAULT_PANE_ZOOM);
		expect(MIN_PANE_ZOOM).toBeLessThan(DEFAULT_PANE_ZOOM);
		expect(MAX_PANE_ZOOM).toBeGreaterThan(DEFAULT_PANE_ZOOM);
		expect([...PANE_ZOOM_LEVELS].sort((a, b) => a - b)).toEqual([
			...PANE_ZOOM_LEVELS,
		]);
	});

	// The floor is an accessibility decision, not a rendering one: below this
	// the 14px content base stops being comfortably readable.
	it("never scales content below 80%", () => {
		expect(MIN_PANE_ZOOM).toBeGreaterThanOrEqual(0.8);
	});
});

describe("clamping a stored zoom", () => {
	it("keeps a value already on the ladder", () => {
		for (const level of PANE_ZOOM_LEVELS) {
			expect(clampPaneZoom(level)).toBe(level);
		}
	});

	it("snaps a value between two rungs to the nearest one", () => {
		expect(clampPaneZoom(1.06)).toBe(1.1);
		expect(clampPaneZoom(1.02)).toBe(1);
	});

	it("pulls a value outside the range back to the bound", () => {
		expect(clampPaneZoom(0.1)).toBe(MIN_PANE_ZOOM);
		expect(clampPaneZoom(9)).toBe(MAX_PANE_ZOOM);
	});

	it("falls back to the default rather than propagating a broken number", () => {
		expect(clampPaneZoom(Number.NaN)).toBe(DEFAULT_PANE_ZOOM);
		expect(clampPaneZoom(Number.POSITIVE_INFINITY)).toBe(DEFAULT_PANE_ZOOM);
	});
});

describe("stepping the zoom", () => {
	it("moves one rung at a time in both directions", () => {
		expect(stepPaneZoom(1, 1)).toBe(1.1);
		expect(stepPaneZoom(1.1, -1)).toBe(1);
	});

	it("stops at the bounds instead of wrapping or overshooting", () => {
		expect(stepPaneZoom(MAX_PANE_ZOOM, 1)).toBe(MAX_PANE_ZOOM);
		expect(stepPaneZoom(MIN_PANE_ZOOM, -1)).toBe(MIN_PANE_ZOOM);
	});

	it("walks the whole ladder and back", () => {
		let zoom = MIN_PANE_ZOOM;
		const up: number[] = [zoom];
		for (let step = 1; step < PANE_ZOOM_LEVELS.length; step += 1) {
			zoom = stepPaneZoom(zoom, 1);
			up.push(zoom);
		}
		expect(up).toEqual([...PANE_ZOOM_LEVELS]);
		expect(zoom).toBe(MAX_PANE_ZOOM);
	});
});

describe("reporting the zoom", () => {
	it("reads as a whole percentage", () => {
		expect(paneZoomPercent(1)).toBe(100);
		expect(paneZoomPercent(0.8)).toBe(80);
		expect(paneZoomPercent(1.5)).toBe(150);
	});
});
