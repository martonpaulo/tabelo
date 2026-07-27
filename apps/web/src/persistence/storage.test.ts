// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyDocument } from "@/core/document";
import { createDefaultWorkspace } from "@/workspace/layout";
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

		expect(outcome).toMatchObject({ status: "unreadable", raw });
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
