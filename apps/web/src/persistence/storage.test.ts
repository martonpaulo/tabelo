// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyDocument } from "@/core/document";
import { createDefaultWorkspace } from "@/workspace/layout";
import v2 from "./fixtures/v2.json";
import v4 from "./fixtures/v4.json";
import v6 from "./fixtures/v6.json";
import { CURRENT_VERSION, RECOVERY_KEY, STORAGE_KEY } from "./schema";
import {
	loadState,
	preserveUnreadableAndSave,
	type SavePayload,
	saveState,
} from "./storage";

const payload: SavePayload = {
	document: createEmptyDocument(),
	workspace: createDefaultWorkspace(),
	draft: null,
};

beforeEach(() => {
	window.localStorage.clear();
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("browser storage outcomes", () => {
	it("keeps invalid JSON byte-for-byte and reports it as unreadable", () => {
		const raw = "{invalid json\nwith exact bytes";
		window.localStorage.setItem(STORAGE_KEY, raw);

		const outcome = loadState();

		expect(outcome).toEqual({
			status: "unreadable",
			reason: "invalid-json",
			raw,
		});
		expect(window.localStorage.getItem(STORAGE_KEY)).toBe(raw);
	});

	it.each([
		[
			"future version",
			JSON.stringify({ ...v4, version: CURRENT_VERSION + 1 }),
			"future-version",
		],
		[
			"invalid current schema",
			JSON.stringify({ ...v6, document: { columns: [] } }),
			"current-schema-invalid",
		],
		[
			"invalid historical source",
			JSON.stringify({ ...v2, workspace: { ...v2.workspace, panes: [] } }),
			"migration-failed",
		],
	] as const)("keeps raw bytes after a %s failure", (_name, raw, reason) => {
		window.localStorage.setItem(STORAGE_KEY, raw);

		expect(loadState()).toEqual({ status: "unreadable", reason, raw });
		expect(window.localStorage.getItem(STORAGE_KEY)).toBe(raw);
	});

	it("distinguishes unavailable storage from unreadable data", () => {
		const read = vi
			.spyOn(window.localStorage, "getItem")
			.mockImplementation(() => {
				throw new DOMException("blocked", "SecurityError");
			});

		expect(loadState()).toEqual({ status: "unavailable" });
		read.mockRestore();
	});

	it("distinguishes quota failures from unavailable writes", () => {
		const write = vi.spyOn(window.localStorage, "setItem");
		write.mockImplementationOnce(() => {
			throw new DOMException("full", "QuotaExceededError");
		});
		expect(saveState(payload)).toEqual({ status: "quota" });

		write.mockImplementationOnce(() => {
			throw new DOMException("blocked", "SecurityError");
		});
		expect(saveState(payload)).toEqual({ status: "unavailable" });
		write.mockRestore();
	});

	it("copies unreadable bytes to the recovery key before replacing", () => {
		const raw = "\u0000original\nraw\tdata";
		window.localStorage.setItem(STORAGE_KEY, raw);

		const outcome = preserveUnreadableAndSave(raw, payload);

		expect(outcome).toEqual({
			status: "saved",
			recoveryPreserved: true,
		});
		expect(window.localStorage.getItem(RECOVERY_KEY)).toBe(raw);
		expect(
			JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null"),
		).toMatchObject({ version: CURRENT_VERSION, draft: null });
	});
});
