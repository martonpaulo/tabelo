// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from "vitest";
import { activeRange, HEADER_ROW } from "@/core/selection";
import type { PreconditionFailure } from "@/formats/types";
import { useTabeloStore } from "@/state/store";
import {
	preconditionRecovery,
	recoveryTarget,
} from "@/ui/precondition-recovery";

// Recovery is derived from the positions a failure declares and from nothing
// else. No codec id, no failure code, and no view id may reach it: a format
// added later has to get the same correction without a line being added here.
// The codes below are only there to build a well-formed failure.

const initialState = useTabeloStore.getInitialState();

beforeEach(() => {
	useTabeloStore.setState(initialState, true);
});

function failure(parts: Partial<PreconditionFailure>): PreconditionFailure {
	return { code: "json-duplicate-header", ...parts };
}

describe("recoveryTarget", () => {
	it("goes to the first column's header", () => {
		expect(recoveryTarget(failure({ columns: [1, 4] }))).toEqual({
			row: HEADER_ROW,
			column: 1,
		});
	});

	it("goes to the first row's first cell when no column is named", () => {
		// Rows are declared as zero-based data rows, so row index 2 is the cell
		// the gutter numbers 4.
		expect(recoveryTarget(failure({ rows: [2, 3] }))).toEqual({
			row: 2,
			column: 0,
		});
	});

	it("prefers the column when a failure names both", () => {
		expect(recoveryTarget(failure({ columns: [3], rows: [0] }))).toEqual({
			row: HEADER_ROW,
			column: 3,
		});
	});

	it("has no target when the failure names no position", () => {
		expect(recoveryTarget(failure({}))).toBeNull();
		expect(recoveryTarget(failure({ columns: [], rows: [] }))).toBeNull();
	});
});

describe("preconditionRecovery", () => {
	it("is absent when nothing was refused", () => {
		expect(preconditionRecovery(null)).toBeNull();
	});

	it("is absent when the refusal names no position to go to", () => {
		expect(preconditionRecovery(failure({}))).toBeNull();
	});

	it("selects the target and announces the reason it already carries", () => {
		const recovery = preconditionRecovery(failure({ columns: [2] }));
		recovery?.run();

		const state = useTabeloStore.getState();
		expect(activeRange(state.selection).focus).toEqual({
			row: HEADER_ROW,
			column: 2,
		});
		// One explanation, in both channels: the notice must not be able to
		// drift from the reason the disabled choice shows.
		expect(state.notices.map((notice) => notice.message)).toEqual([
			recovery?.reason,
		]);
	});

	it("leaves the document and the workspace exactly as they were", () => {
		const before = useTabeloStore.getState();
		preconditionRecovery(failure({ rows: [1] }))?.run();

		const after = useTabeloStore.getState();
		expect(after.document).toBe(before.document);
		expect(after.workspace).toBe(before.workspace);
		expect(activeRange(after.selection).focus).toEqual({ row: 1, column: 0 });
	});
});
