// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
	pickTextFile,
	tableDownloadFilename,
	tableFilenameStem,
} from "./files";

afterEach(() => {
	vi.restoreAllMocks();
});

function choose(file: Pick<File, "name" | "size" | "text">): void {
	vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(function (
		this: HTMLInputElement,
	) {
		Object.defineProperty(this, "files", { value: [file] });
		this.dispatchEvent(new Event("change"));
	});
}

describe("text file picker", () => {
	it("reads a selected file within the byte limit", async () => {
		const text = vi.fn().mockResolvedValue("Name,Role");
		choose({ name: "table.csv", size: 9, text });

		await expect(pickTextFile(".csv", 9)).resolves.toEqual({
			status: "selected",
			name: "table.csv",
			text: "Name,Role",
		});
		expect(text).toHaveBeenCalledOnce();
	});

	it("reports an oversized file without reading it", async () => {
		const text = vi.fn().mockResolvedValue("unread");
		choose({ name: "large.csv", size: 10, text });

		await expect(pickTextFile(".csv", 9)).resolves.toEqual({
			status: "too-large",
			name: "large.csv",
			size: 10,
		});
		expect(text).not.toHaveBeenCalled();
	});
});

describe("table download filenames", () => {
	it.each([
		["Résumé & roadmap", "resume-roadmap"],
		["  Quarterly   plan...final  ", "quarterly-plan-final"],
		["😀 東京", "untitled-table"],
		["../CON:<draft>?*", "con-draft"],
		["one---two___three", "one-two-three"],
		["", "untitled-table"],
	])("turns %j into %s", (name, expected) => {
		expect(tableFilenameStem(name)).toBe(expected);
	});

	it("caps the stem at 120 ASCII characters without a trailing separator", () => {
		const stem = tableFilenameStem(`${"a".repeat(119)} - remainder`);
		expect(stem).toHaveLength(119);
		expect(stem.endsWith("-")).toBe(false);
	});

	it("leaves the codec-owned extension outside the stem", () => {
		expect(tableDownloadFilename("Project roles", "csv")).toBe(
			"project-roles.csv",
		);
	});
});
