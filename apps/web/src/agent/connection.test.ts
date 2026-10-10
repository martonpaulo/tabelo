// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
	connectAgent,
	disconnectAgent,
	useAgentConnection,
	watchInputGuards,
} from "./connection";

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

// A socket that never opens: the browser reports an error and then closes it,
// as it does when nothing listens on the loopback port.
class RefusedSocket {
	onopen: (() => void) | null = null;
	onerror: (() => void) | null = null;
	onclose: (() => void) | null = null;
	onmessage: ((event: MessageEvent) => void) | null = null;
	constructor() {
		queueMicrotask(() => {
			this.onerror?.();
			this.onclose?.();
		});
	}
	send(): void {}
	close(): void {}
}

describe("agent connection errors", () => {
	afterEach(() => {
		disconnectAgent();
		vi.unstubAllGlobals();
		useAgentConnection.setState({ status: "disconnected", error: null });
	});

	// The reason, not its copy, decides which part of the dialog reports it
	// (#451): only a malformed code is about what the user typed.
	it("reports a malformed code as an invalid descriptor", async () => {
		expect(await connectAgent("not a code")).toBe(false);
		expect(useAgentConnection.getState()).toMatchObject({
			status: "disconnected",
			error: "invalid-descriptor",
		});
	});

	it("reports a well-formed code that cannot connect as a connection failure", async () => {
		vi.stubGlobal("WebSocket", RefusedSocket);
		expect(await connectAgent("4321:12345678")).toBe(false);
		expect(useAgentConnection.getState()).toMatchObject({
			status: "disconnected",
			error: "connection-failed",
		});
	});
});
