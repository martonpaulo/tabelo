// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from "vitest";
import { watchInputGuards } from "./connection";

let guards: ReturnType<typeof watchInputGuards> | null = null;
afterEach(() => {
	guards?.dispose();
	guards = null;
});

function pointer(type: string, pointerId = 1): PointerEvent {
	return new PointerEvent(type, { bubbles: true, pointerId });
}

describe("agent input guards", () => {
	it("does not treat a selection press as an unfinished gesture (#472)", () => {
		guards = watchInputGuards(document);
		document.body.dispatchEvent(pointer("pointerdown"));
		expect(guards.busy()).toBeNull();
	});

	it("blocks only while a gesture holds pointer capture", () => {
		guards = watchInputGuards(document);
		document.body.dispatchEvent(pointer("gotpointercapture", 3));
		expect(guards.busy()).toBe("pointer_gesture");
		document.body.dispatchEvent(pointer("lostpointercapture", 3));
		expect(guards.busy()).toBeNull();
	});

	it("keeps blocking an active composition", () => {
		guards = watchInputGuards(document);
		document.dispatchEvent(new CompositionEvent("compositionstart"));
		expect(guards.busy()).toBe("composition");
		document.dispatchEvent(new CompositionEvent("compositionend"));
		expect(guards.busy()).toBeNull();
	});

	it("stops observing once disposed", () => {
		const disposed = watchInputGuards(document);
		disposed.dispose();
		document.body.dispatchEvent(pointer("gotpointercapture"));
		expect(disposed.busy()).toBeNull();
	});
});
