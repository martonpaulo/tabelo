import { describe, expect, it } from "vitest";
import { documentFromMatrix } from "@/core/document";
import { samplePeopleMatrix } from "@/core/sample-data";
import { markdownCodec } from "./markdown";
import { markdownDividerAssistance } from "./markdown-assistance";
import { minimalChange } from "./minimal-change";

// Applies one user edit, `before` to `after`, the way the source editor does:
// the helper sees both drafts and the range the edit changed in `after`, and
// whatever it returns is applied on top. Returns the final text.
function edit(before: string, after: string): string {
	const change = minimalChange(before, after);
	const changed = change
		? [{ from: change.from, to: change.from + change.insert.length }]
		: [];
	const assisted = markdownDividerAssistance(before, after, changed);
	if (!assisted) return after;
	return (
		after.slice(0, assisted.from) + assisted.insert + after.slice(assisted.to)
	);
}

const table = ["| name | city |", "| ---- | ---- |", "| Ingrid | Rio |"].join(
	"\n",
);

describe("markdown divider assistance", () => {
	it("leaves a table the serializer wrote exactly as it is", () => {
		const text = markdownCodec.serialize(
			documentFromMatrix(samplePeopleMatrix(2), { headerRow: true }),
		);
		expect(
			markdownDividerAssistance(text, text, [{ from: 0, to: text.length }]),
		).toBeNull();
	});

	it("widens the divider as a header cell grows", () => {
		const before = "| name | city |\n| ---- | ---- |";
		const after = "| name | cityname |\n| ---- | ---- |";
		expect(edit(before, after)).toBe(
			"| name | cityname |\n| ---- | -------- |",
		);
	});

	it("widens and narrows it with the widest body cell", () => {
		const wider = edit(table, table.replace("Ingrid", "Ingrid Rio"));
		expect(wider.split("\n")[1]).toBe("| ---------- | ---- |");
		const narrower = edit(wider, wider.replace("Ingrid Rio", "Ina"));
		expect(narrower.split("\n")[1]).toBe("| ---- | ---- |");
	});

	it("never writes fewer than three dashes", () => {
		expect(edit("| a |\n| --- |", "| b |\n| --- |")).toBe("| b |\n| --- |");
		expect(edit("| a |\n| --- |\n| x |", "| a |\n| --- |\n| |")).toBe(
			"| a |\n| ----- |\n| |",
		);
	});

	it("measures wide characters by display width", () => {
		const after = "| 東京 | x |\n| --- | --- |";
		expect(edit("| a | x |\n| --- | --- |", after)).toBe(
			"| 東京 | x |\n| ---- | --- |",
		);
	});

	it("measures escapes as the characters they are written with", () => {
		const after = "| a\\|b<br>c | x |\n| --- | --- |";
		expect(edit("| a | x |\n| --- | --- |", after).split("\n")[1]).toBe(
			"| --------- | --- |",
		);
	});

	it("keeps blank text around the table and its CRLF line breaks", () => {
		const before = "\n\n| a | b |\r\n| --- | --- |\r\n\ntrailing\n";
		const after = "\n\n| a | bbbb |\r\n| --- | --- |\r\n\ntrailing\n";
		expect(edit(before, after)).toBe(
			"\n\n| a | bbbb |\r\n| --- | ---- |\r\n\ntrailing\n",
		);
	});

	it("follows a row added and a row removed", () => {
		const added = edit(table, `${table}\n| Paulo | Madrid |`);
		expect(added.split("\n")[1]).toBe("| ------ | ------ |");
		const removed = edit(added, added.split("\n").slice(0, 3).join("\n"));
		expect(removed.split("\n")[1]).toBe("| ------ | ---- |");
	});

	it("adds an unmarked cell for a new column where it was inserted", () => {
		const before = "| name | city |\n| :--- | ---: |";
		expect(edit(before, "| name | age | city |\n| :--- | ---: |")).toBe(
			"| name | age | city |\n| :--- | --- | ---: |",
		);
		expect(edit(before, "| name | city | age |\n| :--- | ---: |")).toBe(
			"| name | city | age |\n| :--- | ---: | --- |",
		);
	});

	it("drops the cell of a removed column with its marker", () => {
		const before = "| name | age | city |\n| :--- | :-: | ---: |";
		expect(edit(before, "| name | city |\n| :--- | :-: | ---: |")).toBe(
			"| name | city |\n| :--- | ---: |",
		);
	});

	it("takes a valid marker edit as the new alignment", () => {
		const before = "| name |\n| ---- |";
		expect(edit(before, "| name |\n| ----: |")).toBe("| name |\n| ---: |");
		expect(edit(before, "| name |\n| :---- |")).toBe("| name |\n| :--- |");
	});

	it("repairs a marker the edit made malformed from the previous one", () => {
		const before = "| name | city |\n| :--- | ---: |";
		expect(edit(before, "| name | city |\n| :-x-- | ---: |")).toBe(before);
		expect(edit(before, "| name | city |\n| :--- ---: |")).toBe(before);
	});

	it("keeps the spacing and pipes the divider was written with", () => {
		const before = "|name|city|\n|---|---|";
		expect(edit(before, "|name|cityname|\n|---|---|")).toBe(
			"|name|cityname|\n|----|--------|",
		);
	});

	it("leaves a pasted table that is already consistent alone", () => {
		const text = markdownCodec.serialize(
			documentFromMatrix(samplePeopleMatrix(2), { headerRow: true }),
		);
		expect(edit("", text)).toBe(text);
	});

	it("changes nothing when the divider cannot be identified", () => {
		// The divider line replaced with arbitrary text alongside a header edit.
		const before = "| name |\n| ---- |";
		const invalid = "| names |\nnot a divider";
		expect(edit(before, invalid)).toBe(invalid);
		// A new line typed between the header and the divider.
		const inserted = "| name |\nx\n| ---- |";
		expect(edit(before, inserted)).toBe(inserted);
		// The divider deleted outright.
		const deleted = "| name |\n| Ingrid |";
		expect(edit("| name |\n| ---- |\n| Ingrid |", deleted)).toBe(deleted);
		// The divider line alone replaced with text that is no marker at all.
		const withBody = "| name |\n| ---- |\n| Ingrid |";
		const replaced = "| name |\n| not a divider |\n| Ingrid |";
		expect(edit(withBody, replaced)).toBe(replaced);
		// A header on its own.
		expect(edit("| name", "| names")).toBe("| names");
	});

	it("leaves a column-count mismatch it did not cause", () => {
		const before = "| a | b |\n| --- |\n| x | y |";
		const after = "| a | b |\n| --- |\n| xx | y |";
		expect(edit(before, after)).toBe(after);
	});

	it("ignores an edit outside the table block", () => {
		const before = "| name |\n| --- |\n\nnotes";
		const after = "| name |\n| --- |\n\nnotes!";
		expect(edit(before, after)).toBe(after);
	});

	it("returns a range no larger than the differing divider bytes", () => {
		const before = "| name | city |\n| ---- | ---- |";
		const after = "| name | cityy |\n| ---- | ---- |";
		const change = minimalChange(before, after);
		if (!change) throw new Error("expected a change");
		const assisted = markdownDividerAssistance(before, after, [
			{ from: change.from, to: change.from + change.insert.length },
		]);
		expect(assisted).toEqual({ from: 30, to: 30, insert: "-" });
	});
});
