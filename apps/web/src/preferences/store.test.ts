import { describe, expect, it, vi } from "vitest";
import {
	DEFAULT_PREFERENCES,
	PREFERENCES_RECOVERY_KEY,
	PREFERENCES_STORAGE_KEY,
	PREFERENCES_VERSION,
	serializePreferences,
} from "./contract";
import { createPreferencesStore } from "./store";

// A storage double holding real values, so a test can read back exactly what
// is left under each key. `failOn` makes writes to one key throw.
function memoryStorage(
	initial: Record<string, string>,
	failOn?: { readonly key: string; readonly name: string },
) {
	const values = new Map(Object.entries(initial));
	return {
		values,
		getItem: vi.fn((key: string) => values.get(key) ?? null),
		setItem: vi.fn((key: string, value: string) => {
			if (failOn?.key === key) throw new DOMException("refused", failOn.name);
			values.set(key, value);
		}),
	};
}

const chosen = { ...DEFAULT_PREFERENCES, spaceIndicators: "all" } as const;

describe("an unreadable stored payload", () => {
	it.each([
		["damaged JSON", "{not json", "invalid-json"],
		[
			"a newer version",
			JSON.stringify({
				...DEFAULT_PREFERENCES,
				version: PREFERENCES_VERSION + 1,
			}),
			"future-version",
		],
		[
			"an invalid current payload",
			JSON.stringify({ ...DEFAULT_PREFERENCES, wrap: "yes" }),
			"current-schema-invalid",
		],
		[
			"an older payload that cannot migrate",
			JSON.stringify({ version: 2, spaceIndicators: "all" }),
			"migration-failed",
		],
	] as const)(
		"keeps %s untouched, reports it, and runs on the defaults",
		(_name, raw, reason) => {
			const storage = memoryStorage({ [PREFERENCES_STORAGE_KEY]: raw });

			const store = createPreferencesStore(storage);

			expect(store.getSnapshot()).toEqual(DEFAULT_PREFERENCES);
			expect(store.getIssue()).toEqual({ kind: "unreadable", reason, raw });
			expect(storage.setItem).not.toHaveBeenCalled();
			expect(storage.values.get(PREFERENCES_STORAGE_KEY)).toBe(raw);
		},
	);

	it("applies a change for the session without overwriting the payload", () => {
		const raw = "{not json";
		const storage = memoryStorage({ [PREFERENCES_STORAGE_KEY]: raw });
		const store = createPreferencesStore(storage);
		const listener = vi.fn();
		store.subscribe(listener);

		expect(store.commit(chosen)).toEqual({ status: "blocked" });

		expect(store.getSnapshot()).toEqual(chosen);
		expect(listener).toHaveBeenCalledOnce();
		expect(storage.setItem).not.toHaveBeenCalled();
		expect(store.getIssue()?.raw).toBe(raw);
	});

	it("copies the payload to the recovery key before replacing it", () => {
		const raw = "{not json";
		const storage = memoryStorage({ [PREFERENCES_STORAGE_KEY]: raw });
		const store = createPreferencesStore(storage);
		store.commit(chosen);

		expect(store.replaceUnreadable()).toEqual({ status: "saved" });

		expect(storage.setItem.mock.calls.map(([key]) => key)).toEqual([
			PREFERENCES_RECOVERY_KEY,
			PREFERENCES_STORAGE_KEY,
		]);
		expect(storage.values.get(PREFERENCES_RECOVERY_KEY)).toBe(raw);
		expect(storage.values.get(PREFERENCES_STORAGE_KEY)).toBe(
			serializePreferences(chosen),
		);
		expect(store.getIssue()).toBeNull();
		// Once the original is safe, a change is an ordinary write again.
		expect(store.commit(DEFAULT_PREFERENCES)).toEqual({ status: "saved" });
	});

	it("writes nothing over the payload when the recovery copy fails", () => {
		const raw = "{not json";
		const storage = memoryStorage(
			{ [PREFERENCES_STORAGE_KEY]: raw },
			{ key: PREFERENCES_RECOVERY_KEY, name: "QuotaExceededError" },
		);
		const store = createPreferencesStore(storage);

		expect(store.replaceUnreadable()).toEqual({ status: "failed" });

		expect(storage.values.get(PREFERENCES_STORAGE_KEY)).toBe(raw);
		expect(store.getIssue()).toEqual({
			kind: "unreadable",
			reason: "invalid-json",
			raw,
			replacementFailure: "quota",
		});
		expect(store.commit(chosen)).toEqual({ status: "blocked" });
		expect(storage.values.get(PREFERENCES_STORAGE_KEY)).toBe(raw);
	});

	it("resolves the issue once the original is kept, even if the new write fails", () => {
		const raw = "{not json";
		const storage = memoryStorage(
			{ [PREFERENCES_STORAGE_KEY]: raw },
			{ key: PREFERENCES_STORAGE_KEY, name: "SecurityError" },
		);
		const store = createPreferencesStore(storage);

		expect(store.replaceUnreadable()).toEqual({ status: "not-saved" });

		expect(storage.values.get(PREFERENCES_RECOVERY_KEY)).toBe(raw);
		expect(store.getIssue()).toBeNull();
	});

	it("loads a payload the migration chain carries forward without an issue", () => {
		const storage = memoryStorage({
			[PREFERENCES_STORAGE_KEY]: JSON.stringify({
				version: 3,
				spaceIndicators: "all",
				tabIndicators: true,
				emptyValueIndicators: true,
			}),
		});

		const store = createPreferencesStore(storage);

		expect(store.getSnapshot()).toEqual(DEFAULT_PREFERENCES);
		expect(store.getIssue()).toBeNull();
		expect(store.commit(chosen)).toEqual({ status: "saved" });
	});
});

describe("preferences store", () => {
	it("loads valid preferences independently from table persistence", () => {
		const saved = {
			version: PREFERENCES_VERSION,
			wrap: true,
			spaceIndicators: "none",
			tabIndicators: false,
			emptyValueIndicators: false,
			lineBreakIndicators: true,
			alignColumns: true,
		} as const;
		const storage = {
			getItem: vi.fn((key: string) =>
				key === PREFERENCES_STORAGE_KEY ? serializePreferences(saved) : null,
			),
			setItem: vi.fn(),
		};

		const store = createPreferencesStore(storage);

		expect(store.getSnapshot()).toEqual(saved);
		expect(storage.getItem).toHaveBeenCalledOnce();
		expect(storage.getItem).toHaveBeenCalledWith(PREFERENCES_STORAGE_KEY);
	});

	it("publishes one committed update only after one successful write", () => {
		const storage = { getItem: vi.fn(() => null), setItem: vi.fn() };
		const store = createPreferencesStore(storage);
		const listener = vi.fn();
		store.subscribe(listener);
		const next = {
			version: PREFERENCES_VERSION,
			wrap: false,
			spaceIndicators: "all",
			tabIndicators: true,
			emptyValueIndicators: false,
			lineBreakIndicators: false,
			alignColumns: false,
		} as const;

		expect(store.commit(next)).toEqual({ status: "saved" });
		expect(storage.setItem).toHaveBeenCalledOnce();
		expect(storage.setItem).toHaveBeenCalledWith(
			PREFERENCES_STORAGE_KEY,
			serializePreferences(next),
		);
		expect(listener).toHaveBeenCalledOnce();
		expect(store.getSnapshot()).toEqual(next);
	});

	it("keeps the previous committed preferences when storage refuses the write", () => {
		const storage = {
			getItem: vi.fn(() => null),
			setItem: vi.fn(() => {
				throw new DOMException("Storage is unavailable.", "SecurityError");
			}),
		};
		const store = createPreferencesStore(storage);
		const listener = vi.fn();
		store.subscribe(listener);

		expect(
			store.commit({ ...DEFAULT_PREFERENCES, spaceIndicators: "all" }),
		).toEqual({
			status: "unavailable",
		});
		expect(store.getSnapshot()).toEqual(DEFAULT_PREFERENCES);
		expect(listener).not.toHaveBeenCalled();
	});

	it("falls back safely when storage cannot be read", () => {
		const storage = {
			getItem: vi.fn(() => {
				throw new DOMException("Storage is unavailable.", "SecurityError");
			}),
			setItem: vi.fn(),
		};

		expect(createPreferencesStore(storage).getSnapshot()).toEqual(
			DEFAULT_PREFERENCES,
		);
	});
});
