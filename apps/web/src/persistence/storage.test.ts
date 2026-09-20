// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyDocument } from "@/core/document";
import { createDefaultWorkspace } from "@/workspace/layout";
import { CURRENT_VERSION, tableKey, tableRecoveryKey } from "./schema";
import {
	loadTable,
	preserveUnreadableAndSave,
	type SavePayload,
	saveTable,
} from "./storage";

const TABLE_ID = "t1";
const STORAGE_KEY = tableKey(TABLE_ID);
const RECOVERY_KEY = tableRecoveryKey(TABLE_ID);

const payload: SavePayload = {
	name: "Untitled table",
	document: createEmptyDocument(),
	workspace: createDefaultWorkspace(),
	draft: null,
};

// A payload of the current shape, used to build the invalid variants below.
const current = { ...payload, version: CURRENT_VERSION };

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

		const outcome = loadTable(TABLE_ID);

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
			JSON.stringify({ ...current, version: CURRENT_VERSION + 1 }),
			"future-version",
		],
		[
			"invalid current schema",
			JSON.stringify({ ...current, document: { columns: [] } }),
			"current-schema-invalid",
		],
		// Formatting Tabelo would never write: two adjacent runs with the same
		// marks. It is kept as it was stored, never normalized into shape.
		[
			"non-normalized inline content",
			JSON.stringify({
				...current,
				document: {
					...current.document,
					rows: [
						{
							id: "r-ingrid",
							cells: {
								"c-name": {
									kind: "inline",
									nodes: [
										{ kind: "text", text: "Ing", marks: ["bold"] },
										{ kind: "text", text: "rid", marks: ["bold"] },
									],
								},
							},
						},
					],
				},
			}),
			"current-schema-invalid",
		],
	] as const)("keeps raw bytes after a %s failure", (_name, raw, reason) => {
		window.localStorage.setItem(STORAGE_KEY, raw);

		expect(loadTable(TABLE_ID)).toEqual({ status: "unreadable", reason, raw });
		expect(window.localStorage.getItem(STORAGE_KEY)).toBe(raw);
	});

	it("distinguishes unavailable storage from unreadable data", () => {
		const read = vi
			.spyOn(window.localStorage, "getItem")
			.mockImplementation(() => {
				throw new DOMException("blocked", "SecurityError");
			});

		expect(loadTable(TABLE_ID)).toEqual({ status: "unavailable" });
		read.mockRestore();
	});

	it("distinguishes quota failures from unavailable writes", () => {
		const write = vi.spyOn(window.localStorage, "setItem");
		write.mockImplementationOnce(() => {
			throw new DOMException("full", "QuotaExceededError");
		});
		expect(saveTable(TABLE_ID, payload)).toEqual({ status: "quota" });

		write.mockImplementationOnce(() => {
			throw new DOMException("blocked", "SecurityError");
		});
		expect(saveTable(TABLE_ID, payload)).toEqual({ status: "unavailable" });
		write.mockRestore();
	});

	it("copies unreadable bytes to the recovery key before replacing", () => {
		const raw = "\u0000original\nraw\tdata";
		window.localStorage.setItem(STORAGE_KEY, raw);

		const outcome = preserveUnreadableAndSave(TABLE_ID, raw, payload);

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
