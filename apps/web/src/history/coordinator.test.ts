import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	canRunHistory,
	type HistoryDirection,
	registerLocalHistory,
	runHistory,
} from "./coordinator";

function target({
	canUndo = false,
	canRedo = false,
}: {
	readonly canUndo?: boolean;
	readonly canRedo?: boolean;
}) {
	return {
		undo: vi.fn(() => canUndo),
		redo: vi.fn(() => canRedo),
		canUndo: () => canUndo,
		canRedo: () => canRedo,
	};
}

describe("history coordination", () => {
	let cleanups: (() => void)[];

	beforeEach(() => {
		cleanups = [];
	});

	afterEach(() => {
		for (const cleanup of cleanups) cleanup();
	});

	function register(
		paneId: string,
		direction: HistoryDirection,
	): ReturnType<typeof target> {
		const history = target({
			canUndo: direction === "undo",
			canRedo: direction === "redo",
		});
		cleanups.push(registerLocalHistory(paneId, history));
		return history;
	}

	it.each(["undo", "redo"] as const)(
		"uses active source %s before document history",
		(direction) => {
			const local = register("source", direction);
			const document = vi.fn();

			runHistory("source", direction, document);

			expect(local[direction]).toHaveBeenCalledOnce();
			expect(document).not.toHaveBeenCalled();
			expect(canRunHistory("source", direction, false)).toBe(true);
		},
	);

	it("falls through to document history when local history is exhausted", () => {
		const local = target({});
		cleanups.push(registerLocalHistory("source", local));
		const document = vi.fn();

		runHistory("source", "undo", document);

		expect(local.undo).toHaveBeenCalledOnce();
		expect(document).toHaveBeenCalledOnce();
		expect(canRunHistory("source", "undo", true)).toBe(true);
	});
});
