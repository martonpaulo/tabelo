import { describe, expect, it } from "vitest";
import { cellText, cellValuesEqual, cellValueType } from "./cell-value";
import {
	inlineImages,
	inlineLinks,
	isTextContent,
	isValidInlineContent,
	markState,
	normalizeInline,
	removeLink,
	replaceRange,
	setLink,
	setMark,
	sliceInline,
	toggleMark,
} from "./inline-content";
import { samplePerson } from "./sample-data";
import type {
	InlineContent,
	InlineMark,
	InlineNode,
	InlineText,
} from "./types";

const ingrid = samplePerson(0);
const paulo = samplePerson(1);

const run = (text: string, ...marks: InlineMark[]): InlineText => ({
	kind: "text",
	text,
	marks,
});

function content(...nodes: InlineNode[]): InlineContent {
	const normalized = normalizeInline(nodes);
	if (typeof normalized === "string") {
		throw new Error("the fixture must carry structure");
	}
	return normalized;
}

// Ingrid, linked by email, beside a picture of her city and a line break.
const roster = content(
	{
		kind: "link",
		url: "mailto:ingrid@example.com",
		children: [run(ingrid.name, "bold")],
	},
	run(" in "),
	{ kind: "image", url: "https://example.com/rio.png", alt: ingrid.city },
	run("\nnext: "),
	run(paulo.name, "italic"),
);

describe("the plain projection", () => {
	it("reads link labels and image alternative text in document order", () => {
		expect(cellText(roster)).toBe(
			`${ingrid.name} in ${ingrid.city}\nnext: ${paulo.name}`,
		);
	});

	it("keeps formatted text a string-typed value", () => {
		expect(cellValueType(roster)).toBe("string");
	});

	it("offers formatting to text only, never to a native value", () => {
		expect(isTextContent("")).toBe(true);
		expect(isTextContent(roster)).toBe(true);
		for (const native of [ingrid.age, 0, true, false, null]) {
			expect(isTextContent(native)).toBe(false);
		}
	});
});

describe("normalization", () => {
	it("merges adjacent runs with the same marks and drops empty ones", () => {
		expect(
			normalizeInline([
				run("In", "bold"),
				run(""),
				run("grid", "bold"),
				run("", "italic"),
			]),
		).toEqual(content(run(ingrid.name, "bold")));
	});

	it("sorts marks into their canonical order and removes repeats", () => {
		expect(
			normalizeInline([run(ingrid.name, "strikethrough", "bold", "bold")]),
		).toEqual({
			kind: "inline",
			nodes: [
				{ kind: "text", text: ingrid.name, marks: ["bold", "strikethrough"] },
			],
		});
	});

	it("is plain text when nothing carries structure", () => {
		expect(normalizeInline([run("Ing"), run("rid")])).toBe(ingrid.name);
		expect(normalizeInline([])).toBe("");
	});

	it("joins adjacent stretches of one URL into one link", () => {
		const url = "https://example.com/ingrid";
		expect(
			normalizeInline([
				{ kind: "link", url, children: [run("Ing")] },
				{ kind: "link", url, children: [run("rid", "bold")] },
			]),
		).toEqual(
			content({
				kind: "link",
				url,
				children: [run("Ing"), run("rid", "bold")],
			}),
		);
	});

	it("drops a link whose label is empty", () => {
		expect(
			normalizeInline([
				{ kind: "link", url: "https://example.com", children: [run("")] },
				run(ingrid.name),
			]),
		).toBe(ingrid.name);
	});

	it("never touches an authored URL or a code point", () => {
		const url = "HTTPS://Example.com/a b?c=<d>";
		const normalized = content({
			kind: "link",
			url,
			children: [run("🧪 é́", "code")],
		});
		expect(inlineLinks(normalized)).toEqual([{ start: 0, end: 5, url }]);
		expect(cellText(normalized)).toBe("🧪 é́");
	});
});

describe("validation", () => {
	it("accepts normalized content", () => {
		expect(isValidInlineContent(roster)).toBe(true);
	});

	it.each([
		["a plain string", ingrid.name],
		["null", null],
		["content that should be plain", { kind: "inline", nodes: [run("x")] }],
		[
			"code with another mark",
			{ kind: "inline", nodes: [run("x", "bold", "code")] },
		],
		[
			"code across a line break",
			{ kind: "inline", nodes: [run("a\nb", "code")] },
		],
		[
			"an image with no alternative text",
			{
				kind: "inline",
				nodes: [{ kind: "image", url: "https://example.com", alt: "" }],
			},
		],
		[
			"a link inside a link",
			{
				kind: "inline",
				nodes: [
					{
						kind: "link",
						url: "https://example.com",
						children: [
							{
								kind: "link",
								url: "https://example.com",
								children: [run("x")],
							},
						],
					},
				],
			},
		],
		[
			"an image with children",
			{
				kind: "inline",
				nodes: [
					{ kind: "image", url: "https://example.com", alt: "x", children: [] },
				],
			},
		],
	])("refuses %s", (_name, value) => {
		expect(isValidInlineContent(value)).toBe(false);
	});
});

describe("equality", () => {
	it("compares structure, and keeps formatted and plain text apart", () => {
		const bold = content(run(ingrid.name, "bold"));
		expect(cellValuesEqual(bold, content(run(ingrid.name, "bold")))).toBe(true);
		expect(cellValuesEqual(bold, ingrid.name)).toBe(false);
		expect(cellValuesEqual(bold, content(run(ingrid.name, "italic")))).toBe(
			false,
		);
		expect(cellValuesEqual(ingrid.age, String(ingrid.age))).toBe(false);
	});
});

describe("marks over a range", () => {
	it("adds a mark to part of plain text", () => {
		expect(setMark(ingrid.name, 0, 3, "bold", true)).toEqual(
			content(run("Ing", "bold"), run("rid")),
		);
	});

	it("toggles off only when the whole range already has the mark", () => {
		const partly = content(run("Ing", "bold"), run("rid"));
		expect(markState(partly, 0, 6, "bold")).toBe("mixed");
		expect(toggleMark(partly, 0, 6, "bold")).toEqual(
			content(run(ingrid.name, "bold")),
		);
		expect(toggleMark(content(run(ingrid.name, "bold")), 0, 6, "bold")).toBe(
			ingrid.name,
		);
	});

	it("lets code replace other marks and stop at a line break", () => {
		const text = `${ingrid.name}\n${paulo.name}`;
		const bold = setMark(text, 0, text.length, "bold", true);
		expect(setMark(bold, 0, text.length, "code", true)).toEqual(
			content(
				run(ingrid.name, "code"),
				run("\n", "bold"),
				run(paulo.name, "code"),
			),
		);
	});

	it("does not mark code text with anything else", () => {
		const code = content(run(ingrid.name, "code"));
		expect(markState(code, 0, 6, "bold")).toBe("unavailable");
		expect(toggleMark(code, 0, 6, "bold")).toBe(code);
	});

	it("reports the formatting typing would continue at a caret", () => {
		const partly = content(run("Ing", "bold"), run("rid"));
		expect(markState(partly, 3, 3, "bold")).toBe("on");
		expect(markState(partly, 4, 4, "bold")).toBe("off");
		expect(markState(partly, 0, 0, "bold")).toBe("on");
	});

	it("never splits a surrogate pair", () => {
		const text = "a🧪b";
		expect(setMark(text, 2, 3, "bold", true)).toEqual(
			content(run("a"), run("🧪", "bold"), run("b")),
		);
	});
});

describe("replacing a range", () => {
	it("gives text typed over a range the formatting of what it replaces", () => {
		const code = `${ingrid.name}\n${paulo.name}`;
		const bold = setMark(code, 0, code.length, "bold", true);
		expect(replaceRange(bold, 0, 6, "Ana")).toEqual(
			content(run(`Ana\n${paulo.name}`, "bold")),
		);
		const coded = content(run(ingrid.name, "code"));
		expect(replaceRange(coded, 0, 6, "a\nb")).toEqual(
			content(run("a", "code"), run("\n"), run("b", "code")),
		);
	});

	it("keeps the formatting around an edit", () => {
		const bold = content(run(ingrid.name, "bold"));
		expect(replaceRange(bold, 3, 3, "-")).toEqual(
			content(run("Ing", "bold"), run("-"), run("rid", "bold")),
		);
	});

	it("extends a link label when typing inside it", () => {
		const url = "https://example.com/ingrid";
		const linked = content({ kind: "link", url, children: [run(ingrid.name)] });
		expect(inlineLinks(replaceRange(linked, 3, 3, "-"))).toEqual([
			{ start: 0, end: 7, url },
		]);
		expect(inlineLinks(replaceRange(linked, 6, 6, "!"))).toEqual([
			{ start: 0, end: 6, url },
		]);
	});

	it("keeps two links to one URL apart when the text between is replaced", () => {
		const url = "https://example.com/rio";
		const link = (text: string): InlineNode => ({
			kind: "link",
			url,
			children: [run(text)],
		});
		const apart = content(link(ingrid.name), run(" "), link(paulo.name));
		const gap = ingrid.name.length;
		expect(replaceRange(apart, gap, gap + 1, " ")).toEqual(apart);
		expect(replaceRange(apart, gap + 1, gap, "-")).toEqual(
			content(link(ingrid.name), run("-"), link(paulo.name)),
		);
	});

	it("splits a link around an inserted image", () => {
		const url = "https://example.com/ingrid";
		const linked = content({ kind: "link", url, children: [run(ingrid.name)] });
		const image = content({
			kind: "image",
			url: "https://example.com/rio.png",
			alt: ingrid.city,
		});
		const next = replaceRange(linked, 3, 3, image);
		expect(cellText(next)).toBe(`Ing${ingrid.city}rid`);
		expect(inlineLinks(next)).toEqual([
			{ start: 0, end: 3, url },
			{ start: 6, end: 9, url },
		]);
		expect(inlineImages(next)).toEqual([{ start: 3, end: 6 }]);
	});

	it("removes an image whole when a range reaches into it", () => {
		const offset = `${ingrid.name} in `.length;
		const next = replaceRange(roster, offset + 1, offset + 2, "");
		expect(inlineImages(next)).toEqual([]);
		expect(cellText(next)).toBe(`${ingrid.name} in \nnext: ${paulo.name}`);
	});

	it("slices with formatting intact", () => {
		expect(sliceInline(roster, 0, 3)).toEqual(
			content({
				kind: "link",
				url: "mailto:ingrid@example.com",
				children: [run("Ing", "bold")],
			}),
		);
	});
});

// A fragment copied out of one cell's editor and pasted into another's is a
// slice inserted with `replaceRange` (#306).
describe("inline fragments", () => {
	const rosterLength = cellText(roster).length;

	it("puts back every slice it took, exactly", () => {
		for (let start = 0; start <= rosterLength; start += 1) {
			for (let end = start; end <= rosterLength; end += 1) {
				const slice = sliceInline(roster, start, end);
				expect(replaceRange(roster, start, end, slice)).toEqual(roster);
			}
		}
	});

	it("inserts a slice elsewhere with its marks, link, and image", () => {
		const imageStart = `${ingrid.name} in `.length;
		const slice = sliceInline(roster, 0, imageStart + ingrid.city.length);
		const next = replaceRange(paulo.name, 2, 2, slice);
		expect(cellText(next)).toBe(
			`Pa${ingrid.name} in ${ingrid.city}${paulo.name.slice(2)}`,
		);
		expect(markState(next, 2, 2 + ingrid.name.length, "bold")).toBe("on");
		expect(inlineLinks(next)).toEqual([
			{
				start: 2,
				end: 2 + ingrid.name.length,
				url: "mailto:ingrid@example.com",
			},
		]);
		expect(inlineImages(next)).toEqual([
			{ start: 2 + imageStart, end: 2 + imageStart + ingrid.city.length },
		]);
	});

	it("keeps a fragment's own formatting rather than its surroundings'", () => {
		const bold = content(run(paulo.name, "bold"));
		const italic = content(run("x", "italic"));
		expect(replaceRange(bold, 2, 2, italic)).toEqual(
			content(run("Pa", "bold"), run("x", "italic"), run("ulo", "bold")),
		);
		expect(replaceRange(bold, 0, paulo.name.length, italic)).toEqual(italic);
	});

	it("keeps a pasted link apart from the link it lands in", () => {
		const rio = "https://example.com/rio";
		const madrid = "https://example.com/madrid";
		const linked = content({ kind: "link", url: rio, children: [run("Rio")] });
		const pasted = content({
			kind: "link",
			url: madrid,
			children: [run("Madrid")],
		});
		expect(inlineLinks(replaceRange(linked, 1, 1, pasted))).toEqual([
			{ start: 0, end: 1, url: rio },
			{ start: 1, end: 7, url: madrid },
			{ start: 7, end: 9, url: rio },
		]);
	});
});

describe("links", () => {
	it("links a range and refuses one that holds an image or has no URL", () => {
		expect(
			inlineLinks(setLink(paulo.name, 0, 5, "https://example.com") ?? ""),
		).toEqual([{ start: 0, end: 5, url: "https://example.com" }]);
		const offset = `${ingrid.name} in `.length;
		expect(
			setLink(roster, offset - 1, offset + 1, "https://example.com"),
		).toBeNull();
		expect(setLink(paulo.name, 0, 5, "")).toBeNull();
		expect(setLink(paulo.name, 2, 2, "https://example.com")).toBeNull();
	});

	it("removes a whole link from a caret inside it, keeping its marks", () => {
		expect(removeLink(roster, 2, 2)).toEqual(
			content(
				run(ingrid.name, "bold"),
				run(" in "),
				{ kind: "image", url: "https://example.com/rio.png", alt: ingrid.city },
				run("\nnext: "),
				run(paulo.name, "italic"),
			),
		);
	});
});
