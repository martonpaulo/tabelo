import { describe, expect, it } from "vitest";
import { minimalChange } from "./minimal-change";

// Applying a change the way CodeMirror does, so a case is only correct when the
// change it describes actually produces the requested text.
function apply(current: string, next: string): string | null {
	const change = minimalChange(current, next);
	if (!change) return null;
	return (
		current.slice(0, change.from) + change.insert + current.slice(change.to)
	);
}

describe("minimalChange", () => {
	it("reports nothing when the text is unchanged", () => {
		expect(minimalChange("a\tb\n1\t2", "a\tb\n1\t2")).toBeNull();
	});

	it("touches only the run that differs", () => {
		const change = minimalChange(
			"Name\tCity\nIngrid\tRio",
			"Name\tCity\nMabel\tRio",
		);
		expect(change).toEqual({ from: 10, to: 16, insert: "Mabel" });
	});

	// A view change now reconfigures the editor instead of remounting it, so the
	// step from one format to another arrives here as a single change over text
	// that shares almost nothing.
	it("rewrites a whole document when two formats share no structure", () => {
		const markdown = "| Name | City |\n| --- | --- |\n| Ingrid | Rio |";
		const records = '[\n\t{\n\t\t"Name": "Ingrid",\n\t\t"City": "Rio"\n\t}\n]';
		expect(apply(markdown, records)).toBe(records);
		expect(apply(records, markdown)).toBe(markdown);
	});

	it("describes emptying and filling the document", () => {
		expect(apply("Name\tCity", "")).toBe("");
		expect(apply("", "Name\tCity")).toBe("Name\tCity");
	});

	// The shared run has to be counted from both ends independently: a repeated
	// substring around the edit is where an index kept for the wrong side of the
	// change would produce text neither document ever held.
	it("keeps the change inside the document when the edges repeat", () => {
		expect(apply("aaaa", "aa")).toBe("aa");
		expect(apply("aa", "aaaa")).toBe("aaaa");
	});
});
