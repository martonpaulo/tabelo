import { describe, expect, it, vi } from "vitest";
import {
	DEFAULT_PREFERENCES,
	PREFERENCES_STORAGE_KEY,
	PREFERENCES_VERSION,
	serializePreferences,
} from "./contract";
import { createPreferencesStore } from "./store";

describe("preferences store", () => {
	it("loads valid preferences independently from table persistence", () => {
		const saved = {
			version: PREFERENCES_VERSION,
			theme: "light",
			spaceIndicators: "none",
			tabIndicators: false,
			emptyValueIndicators: false,
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
			theme: "dark",
			spaceIndicators: "all",
			tabIndicators: true,
			emptyValueIndicators: false,
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

		expect(store.commit({ ...DEFAULT_PREFERENCES, theme: "dark" })).toEqual({
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
