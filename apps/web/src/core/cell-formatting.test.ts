import { describe, expect, it } from "vitest";
import {
	applyLink,
	insertImage,
	linkDraft,
	noTextReason,
	selectionMarkState,
	toggleMarkInCells,
} from "./cell-formatting";
import { cellText, readCell } from "./cell-value";
import { documentFromMatrix } from "./document";
import { inlineImages, inlineLinks, markState } from "./inline-content";
import { samplePeopleMatrix, samplePerson } from "./sample-data";
import { type CellRect, HEADER_ROW } from "./selection";
import type { TableDocument, TextContent } from "./types";

const ingrid = samplePerson(0);
const paulo = samplePerson(1);

// name, city, role, age: two people, their ages real numbers.
const roster = (): TableDocument =>
	documentFromMatrix(samplePeopleMatrix(2), { headerRow: true });

const cell = (document: TableDocument, row: number, column: number) => {
	const target = document.columns[column];
	if (!target) throw new Error("no such column");
	if (row === HEADER_ROW) return target.header;
	const data = document.rows[row];
	if (!data) throw new Error("no such row");
	return readCell(data, target.id);
};

const rect = (
	top: number,
	left: number,
	bottom = top,
	right = left,
): CellRect => ({ top, left, bottom, right });

const whole = (value: TextContent) => cellText(value).length;

describe("formatting the grid selection", () => {
	it("marks the whole text of every selected textual cell in one change", () => {
		const document = roster();
		const next = toggleMarkInCells(document, [rect(0, 0, 1, 1)], "bold");

		for (const row of [0, 1]) {
			for (const column of [0, 1]) {
				const value = cell(next, row, column) as TextContent;
				expect(markState(value, 0, whole(value), "bold")).toBe("on");
			}
		}
		expect(cellText(cell(next, 0, 0))).toBe(ingrid.name);
		expect(selectionMarkState(next, [rect(0, 0, 1, 1)], "bold")).toBe("on");
	});

	it("removes the mark only when every selected cell already has it", () => {
		const document = roster();
		const once = toggleMarkInCells(document, [rect(0, 0)], "italic");
		expect(selectionMarkState(once, [rect(0, 0, 1, 0)], "italic")).toBe(
			"mixed",
		);

		const both = toggleMarkInCells(once, [rect(0, 0, 1, 0)], "italic");
		expect(selectionMarkState(both, [rect(0, 0, 1, 0)], "italic")).toBe("on");

		const neither = toggleMarkInCells(both, [rect(0, 0, 1, 0)], "italic");
		expect(cell(neither, 0, 0)).toBe(ingrid.name);
		expect(cell(neither, 1, 0)).toBe(paulo.name);
	});

	it("formats a cell once when overlapping areas cover it twice", () => {
		const document = roster();
		const twice = toggleMarkInCells(
			document,
			[rect(0, 0, 1, 1), rect(0, 0)],
			"underline",
		);
		expect(twice).toEqual(
			toggleMarkInCells(document, [rect(0, 0, 1, 1)], "underline"),
		);
	});

	it("reaches the header row when the selection covers it", () => {
		const next = toggleMarkInCells(roster(), [rect(HEADER_ROW, 0)], "code");
		const header = cell(next, HEADER_ROW, 0) as TextContent;
		expect(markState(header, 0, whole(header), "code")).toBe("on");
	});

	it("never converts a number, a boolean, or null", () => {
		const document = roster();
		// The age column holds real numbers.
		const ages = [rect(0, 3, 1, 3)];
		expect(selectionMarkState(document, ages, "bold")).toBe("no-text");
		expect(noTextReason(document, ages)).toBe("typed");
		expect(toggleMarkInCells(document, ages, "bold")).toBe(document);

		// Mixed with text, the numbers are left exactly as they were.
		const next = toggleMarkInCells(document, [rect(0, 2, 0, 3)], "bold");
		expect(cell(next, 0, 3)).toBe(ingrid.age);
	});

	it("says an empty selection has nothing to format", () => {
		const document = documentFromMatrix([["", ""]], { headerRow: false });
		expect(selectionMarkState(document, [rect(0, 0)], "bold")).toBe("no-text");
		expect(noTextReason(document, [rect(0, 0)])).toBe("empty");
	});
});

describe("links over a range", () => {
	const url = "https://example.com/rio";

	it("links text and keeps its formatting when the label is unchanged", () => {
		const document = toggleMarkInCells(roster(), [rect(0, 0)], "bold");
		const value = cell(document, 0, 0) as TextContent;
		const linked = applyLink(value, 0, whole(value), ingrid.name, url);
		expect(linked).not.toBeNull();
		if (!linked) return;
		expect(inlineLinks(linked)).toEqual([
			{ start: 0, end: ingrid.name.length, url },
		]);
		expect(markState(linked, 0, whole(linked), "bold")).toBe("on");
	});

	it("edits the link a caret sits in, label and address", () => {
		const linked = applyLink(`${ingrid.name} lives`, 0, 6, ingrid.name, url);
		if (!linked) throw new Error("expected a link");
		expect(linkDraft(linked, 3, 3)).toEqual({
			text: ingrid.name,
			url,
			linked: true,
			holdsImage: false,
		});
		const relabeled = applyLink(linked, 3, 3, ingrid.city, `${url}/2`);
		expect(relabeled && cellText(relabeled)).toBe(`${ingrid.city} lives`);
		expect(relabeled && inlineLinks(relabeled)).toEqual([
			{ start: 0, end: ingrid.city.length, url: `${url}/2` },
		]);
	});

	it("refuses an empty label, an empty address, or a range holding an image", () => {
		expect(applyLink(ingrid.name, 0, 6, "", url)).toBeNull();
		expect(applyLink(ingrid.name, 0, 6, ingrid.name, "")).toBeNull();
		const pictured = insertImage(ingrid.name, 6, 6, url, ingrid.city);
		if (!pictured) throw new Error("expected an image");
		expect(linkDraft(pictured, 0, whole(pictured)).holdsImage).toBe(true);
	});
});

describe("inserting an image", () => {
	it("puts an image with its alternative text in place of a range", () => {
		const next = insertImage(
			ingrid.name,
			6,
			6,
			"https://example.com/rio.png",
			ingrid.city,
		);
		expect(next && cellText(next)).toBe(`${ingrid.name}${ingrid.city}`);
		expect(next && inlineImages(next)).toEqual([
			{ start: 6, end: 6 + ingrid.city.length },
		]);
	});

	it("requires an address and alternative text", () => {
		expect(insertImage(ingrid.name, 0, 0, "", ingrid.city)).toBeNull();
		expect(
			insertImage(ingrid.name, 0, 0, "https://example.com/a.png", " "),
		).toBeNull();
	});
});
