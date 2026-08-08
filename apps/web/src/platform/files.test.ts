// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";
import { pickTextFile } from "./files";

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
