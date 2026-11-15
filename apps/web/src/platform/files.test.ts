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

function choose(file: Pick<File, "name" | "size" | "arrayBuffer">): void {
	vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(function (
		this: HTMLInputElement,
	) {
		Object.defineProperty(this, "files", { value: [file] });
		this.dispatchEvent(new Event("change"));
	});
}

describe("text file picker", () => {
	function bytes(...values: number[]) {
		return vi.fn().mockResolvedValue(new Uint8Array(values).buffer);
	}
	const utf8 = (text: string) => [...new TextEncoder().encode(text)];

	it("reads a selected file within the byte limit", async () => {
		const arrayBuffer = bytes(...utf8("Name,Role"));
		choose({ name: "table.csv", size: 9, arrayBuffer });

		await expect(pickTextFile(".csv", 9)).resolves.toEqual({
			status: "selected",
			name: "table.csv",
			text: "Name,Role",
		});
		expect(arrayBuffer).toHaveBeenCalledOnce();
	});

	it("reports an oversized file without reading it", async () => {
		const arrayBuffer = bytes(...utf8("unread"));
		choose({ name: "large.csv", size: 10, arrayBuffer });

		await expect(pickTextFile(".csv", 9)).resolves.toEqual({
			status: "too-large",
			name: "large.csv",
			size: 10,
		});
		expect(arrayBuffer).not.toHaveBeenCalled();
	});

	// #547: Latin-1 bytes for "Name" and "Jos" plus e9 decoded as UTF-8 with
	// replacement, so the accented letter was silently lost.
	it("refuses a file that is not UTF-8", async () => {
		choose({
			name: "legacy.csv",
			size: 10,
			arrayBuffer: bytes(
				0x4e,
				0x61,
				0x6d,
				0x65,
				0x0a,
				0x4a,
				0x6f,
				0x73,
				0xe9,
				0x0a,
			),
		});

		await expect(pickTextFile(".csv", 10)).resolves.toEqual({
			status: "not-utf8",
			name: "legacy.csv",
		});
	});

	it("reads a UTF-8 file with a byte order mark as its text alone", async () => {
		const content = utf8("Name\nJosé\n");
		choose({
			name: "bom.csv",
			size: content.length + 3,
			arrayBuffer: bytes(0xef, 0xbb, 0xbf, ...content),
		});

		await expect(pickTextFile(".csv", 20)).resolves.toEqual({
			status: "selected",
			name: "bom.csv",
			text: "Name\nJosé\n",
		});
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
