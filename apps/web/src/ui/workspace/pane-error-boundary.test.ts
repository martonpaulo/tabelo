// @vitest-environment happy-dom

import { act, createElement, type ReactNode, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PaneErrorBoundary, usePaneFailure } from "./pane-error-boundary";
import { PaneEntryContext } from "./use-pane-entry";

// A pane catches its own view's failure. What matters is the contract, not
// the words: the view is replaced by a status offering two commands, the
// commands do what they say, and nothing outside the pane is touched.

declare global {
	var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

let host: HTMLElement;
let root: Root;
let failing: boolean;

// A view that throws while it renders whenever the test says so.
function View() {
	if (failing) throw new Error("the view failed");
	return createElement("p", { "data-view": "" }, "view content");
}

// A view that reports a failure raised outside React, as CodeMirror does.
let reportFromOutside: ((error: unknown) => void) | null = null;
function ReportingView() {
	const report = usePaneFailure();
	useEffect(() => {
		reportFromOutside = report;
	}, [report]);
	return createElement("p", { "data-view": "" }, "view content");
}

function render(
	viewId: string,
	child: () => ReactNode,
	onChangeView = vi.fn(),
	entered = false,
) {
	act(() => {
		root.render(
			createElement(
				PaneEntryContext.Provider,
				{ value: entered },
				createElement(PaneErrorBoundary, {
					viewId,
					onChangeView,
					children: child(),
				}),
				createElement("p", { "data-sibling": "" }, "other pane"),
			),
		);
	});
	return onChangeView;
}

function failure(): HTMLElement | null {
	return host.querySelector("[data-pane-failure]");
}

function buttons(): HTMLButtonElement[] {
	return [...(failure()?.querySelectorAll("button") ?? [])];
}

beforeEach(() => {
	globalThis.IS_REACT_ACT_ENVIRONMENT = true;
	host = document.createElement("div");
	document.body.append(host);
	root = createRoot(host);
	failing = false;
	reportFromOutside = null;
	// React and the boundary both log the caught error, which is expected here.
	vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
	act(() => root.unmount());
	host.remove();
	vi.restoreAllMocks();
});

describe("PaneErrorBoundary", () => {
	it("replaces a view that throws with a status and keeps its siblings", () => {
		failing = true;
		render("markdown", () => createElement(View));
		expect(host.querySelector("[data-view]")).toBeNull();
		expect(failure()?.getAttribute("role")).toBe("status");
		expect(buttons()).toHaveLength(2);
		expect(host.querySelector("[data-sibling]")).not.toBeNull();
	});

	it("mounts the view again when reloaded", () => {
		failing = true;
		render("markdown", () => createElement(View));
		failing = false;
		act(() => buttons()[0]?.click());
		expect(failure()).toBeNull();
		expect(host.querySelector("[data-view]")).not.toBeNull();
	});

	it("hands the change-view command its own button as the opener", () => {
		failing = true;
		const onChangeView = render("markdown", () => createElement(View));
		const change = buttons()[1];
		act(() => change?.click());
		expect(onChangeView).toHaveBeenCalledWith(change);
	});

	it("starts over when the pane shows a different view", () => {
		failing = true;
		render("markdown", () => createElement(View));
		failing = false;
		render("csv", () => createElement(View));
		expect(failure()).toBeNull();
		expect(host.querySelector("[data-view]")).not.toBeNull();
	});

	it("shows the same state for a failure reported from outside React", () => {
		render("markdown", () => createElement(ReportingView));
		expect(failure()).toBeNull();
		act(() => reportFromOutside?.(new Error("a plugin failed")));
		expect(host.querySelector("[data-view]")).toBeNull();
		expect(failure()).not.toBeNull();
	});

	it("moves focus to the first recovery command when the failure dropped it", () => {
		failing = true;
		render("markdown", () => createElement(View), vi.fn(), true);
		expect(document.activeElement).toBe(buttons()[0]);
	});

	it("leaves focus alone when the view failed while nobody was in it", () => {
		failing = true;
		render("markdown", () => createElement(View));
		expect(document.activeElement).toBe(document.body);
	});
});
