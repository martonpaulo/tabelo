import type {
	CellValue,
	InlineContent,
	InlineMark,
	InlineNode,
	InlineText,
	TextContent,
} from "./types";

// Structured inline content: the normalized node model, its plain projection,
// and the pure range operations an editor applies to it. Framework-free, and
// the only owner of what "normalized" means. See docs/adr/0011.
//
// Every offset here is a UTF-16 code unit offset into the plain projection,
// the same string `cellText` returns, so find, selection, and an editor all
// share one coordinate system. An image occupies the length of its alternative
// text there and is atomic: a range edge that falls inside it snaps outward,
// and so does one that falls between the two halves of a surrogate pair.

// The canonical mark order. Normalization sorts every run's marks into it, so
// two runs with the same formatting always compare equal.
export const INLINE_MARKS = [
	"bold",
	"italic",
	"underline",
	"strikethrough",
	"code",
] as const satisfies readonly InlineMark[];

// Markdown and Jira cannot round trip inline code combined with another mark
// or spanning a line break, so the model cannot hold either (#306).
const LINE_BREAK = /[\r\n]/;

export function isInlineContent(value: CellValue): value is InlineContent {
	return typeof value === "object" && value !== null;
}

// Formatting applies to text and nothing else. A number, a boolean, or `null`
// is never formatted, because formatting it would first have to convert it,
// and a conversion is always the user's explicit choice (docs/adr/0008).
export function isTextContent(value: CellValue): value is TextContent {
	return typeof value === "string" || isInlineContent(value);
}

function nodeText(node: InlineNode): string {
	switch (node.kind) {
		case "text":
			return node.text;
		case "link":
			return node.children.map((child) => child.text).join("");
		case "image":
			return node.alt;
	}
}

// The plain projection of structured content: text and link labels as they
// read, and each image's alternative text in its place, in document order.
// `cellText` is the public owner and delegates here.
export function inlineText(content: InlineContent): string {
	return content.nodes.map(nodeText).join("");
}

// The linear form every operation works on: one flat run per stretch of text
// that shares its marks and its link, and one entry per image. Links are only
// a property of the text inside them here, which is what lets a range cut
// across a link boundary without special cases, and what makes rebuilding the
// node tree the one normalization step.
type Segment =
	| {
			readonly kind: "text";
			readonly text: string;
			readonly marks: readonly InlineMark[];
			readonly link: string | null;
	  }
	| { readonly kind: "image"; readonly url: string; readonly alt: string };

function canonicalMarks(marks: readonly InlineMark[]): InlineMark[] {
	return INLINE_MARKS.filter((mark) => marks.includes(mark));
}

function nodeSegments(node: InlineNode): Segment[] {
	switch (node.kind) {
		case "text":
			return [
				{
					kind: "text",
					text: node.text,
					marks: canonicalMarks(node.marks),
					link: null,
				},
			];
		case "link":
			return node.children.map((child) => ({
				kind: "text",
				text: child.text,
				marks: canonicalMarks(child.marks),
				link: node.url,
			}));
		case "image":
			return [{ kind: "image", url: node.url, alt: node.alt }];
	}
}

function segmentsOf(value: TextContent): Segment[] {
	if (typeof value === "string") {
		return value === ""
			? []
			: [{ kind: "text", text: value, marks: [], link: null }];
	}
	return value.nodes.flatMap(nodeSegments);
}

function segmentLength(segment: Segment): number {
	return segment.kind === "text" ? segment.text.length : segment.alt.length;
}

function sameMarks(
	left: readonly InlineMark[],
	right: readonly InlineMark[],
): boolean {
	return (
		left.length === right.length &&
		left.every((mark, index) => mark === right[index])
	);
}

// Appends a run, merging it into the previous one when their marks match.
function appendRun(runs: InlineText[], text: string, marks: InlineMark[]) {
	const previous = runs.at(-1);
	if (previous && sameMarks(previous.marks, marks)) {
		runs[runs.length - 1] = { ...previous, text: previous.text + text };
	} else {
		runs.push({ kind: "text", text, marks });
	}
}

// Rebuilds the node tree from the linear form, and in doing so normalizes it:
// empty runs disappear, adjacent runs with identical marks merge, adjacent
// stretches of one URL become one link, and content left with no structure at
// all is the plain string it reads as. None of that changes the projection, a
// code point, or an authored URL.
function contentOf(segments: readonly Segment[]): TextContent {
	const nodes: InlineNode[] = [];
	// The runs of the node being built, which is the last one in `nodes` when it
	// is a text run or a link. Kept mutable here only, while it is being built.
	let topRuns: InlineText[] = [];
	let linkRuns: InlineText[] | null = null;
	let linkUrl: string | null = null;

	const flush = () => {
		for (const run of topRuns) nodes.push(run);
		topRuns = [];
		if (linkRuns && linkUrl !== null) {
			nodes.push({ kind: "link", url: linkUrl, children: linkRuns });
		}
		linkRuns = null;
		linkUrl = null;
	};

	for (const segment of segments) {
		if (segment.kind === "image") {
			flush();
			nodes.push({ kind: "image", url: segment.url, alt: segment.alt });
			continue;
		}
		if (segment.text === "") continue;
		const marks = canonicalMarks(segment.marks);
		if (segment.link === null) {
			if (linkRuns) flush();
			appendRun(topRuns, segment.text, marks);
			continue;
		}
		if (linkRuns === null || linkUrl !== segment.link) {
			flush();
			linkRuns = [];
			linkUrl = segment.link;
		}
		appendRun(linkRuns, segment.text, marks);
	}
	flush();

	const [only] = nodes;
	if (nodes.length === 0) return "";
	if (nodes.length === 1 && only?.kind === "text" && only.marks.length === 0) {
		return only.text;
	}
	return { kind: "inline", nodes };
}

// The one canonical form of any node list. It returns a plain string whenever
// the nodes carry no structure, so there is never a second spelling of plain
// text.
export function normalizeInline(nodes: readonly InlineNode[]): TextContent {
	return contentOf(nodes.flatMap(nodeSegments));
}

function textsEqual(left: InlineText, right: InlineText): boolean {
	return left.text === right.text && sameMarks(left.marks, right.marks);
}

function nodesEqual(left: InlineNode, right: InlineNode): boolean {
	switch (left.kind) {
		case "text":
			return right.kind === "text" && textsEqual(left, right);
		case "image":
			return (
				right.kind === "image" &&
				left.url === right.url &&
				left.alt === right.alt
			);
		case "link":
			return (
				right.kind === "link" &&
				left.url === right.url &&
				left.children.length === right.children.length &&
				left.children.every((child, index) => {
					const other = right.children[index];
					return other !== undefined && textsEqual(child, other);
				})
			);
	}
}

// Structural equality. Normalized content has one form, so equal content is
// equal node by node.
export function inlineContentEquals(
	left: InlineContent,
	right: InlineContent,
): boolean {
	return (
		left === right ||
		(left.nodes.length === right.nodes.length &&
			left.nodes.every((node, index) => {
				const other = right.nodes[index];
				return other !== undefined && nodesEqual(node, other);
			}))
	);
}

// Validation for untrusted input: persistence, the private clipboard payload,
// and anything else that claims to hold inline content. It accepts exactly the
// normalized form with no key it does not know, so a payload that differs
// from what Tabelo writes is reported rather than silently repaired.

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
	value: Record<string, unknown>,
	keys: readonly string[],
): boolean {
	const own = Object.keys(value);
	return (
		own.length === keys.length && keys.every((key) => Object.hasOwn(value, key))
	);
}

function isNonEmptyString(value: unknown): value is string {
	return typeof value === "string" && value !== "";
}

function isValidRun(value: unknown): value is InlineText {
	if (!isRecord(value) || !hasExactKeys(value, ["kind", "text", "marks"])) {
		return false;
	}
	const { kind, text, marks } = value;
	if (kind !== "text" || !isNonEmptyString(text) || !Array.isArray(marks)) {
		return false;
	}
	if (
		!marks.every((mark) => (INLINE_MARKS as readonly unknown[]).includes(mark))
	) {
		return false;
	}
	if (marks.includes("code")) {
		return marks.length === 1 && !LINE_BREAK.test(text);
	}
	return true;
}

function isValidNode(value: unknown): value is InlineNode {
	if (!isRecord(value)) return false;
	switch (value.kind) {
		case "text":
			return isValidRun(value);
		case "link":
			return (
				hasExactKeys(value, ["kind", "url", "children"]) &&
				isNonEmptyString(value.url) &&
				Array.isArray(value.children) &&
				value.children.length > 0 &&
				value.children.every(isValidRun)
			);
		case "image":
			return (
				hasExactKeys(value, ["kind", "url", "alt"]) &&
				isNonEmptyString(value.url) &&
				isNonEmptyString(value.alt)
			);
		default:
			return false;
	}
}

export function isValidInlineContent(value: unknown): value is InlineContent {
	if (!isRecord(value) || !hasExactKeys(value, ["kind", "nodes"])) return false;
	if (value.kind !== "inline" || !Array.isArray(value.nodes)) return false;
	if (value.nodes.length === 0 || !value.nodes.every(isValidNode)) return false;
	const content = value as unknown as InlineContent;
	const normalized = normalizeInline(content.nodes);
	return (
		typeof normalized !== "string" && inlineContentEquals(normalized, content)
	);
}

// Range operations. Each takes text content and returns the normalized result,
// and none of them reads text to decide what it means: a mark, a link, or an
// image exists only because an operation was asked to create it.

function projection(segments: readonly Segment[]): string {
	return segments
		.map((segment) => (segment.kind === "text" ? segment.text : segment.alt))
		.join("");
}

const isHighSurrogate = (code: number) => code >= 0xd800 && code <= 0xdbff;
const isLowSurrogate = (code: number) => code >= 0xdc00 && code <= 0xdfff;

function splitsSurrogatePair(text: string, offset: number): boolean {
	return (
		offset > 0 &&
		offset < text.length &&
		isHighSurrogate(text.charCodeAt(offset - 1)) &&
		isLowSurrogate(text.charCodeAt(offset))
	);
}

// Clamps and orders a range, then widens it so neither edge falls inside an
// image or a surrogate pair.
function snapRange(
	segments: readonly Segment[],
	start: number,
	end: number,
): readonly [number, number] {
	const text = projection(segments);
	const clamp = (offset: number) =>
		Math.max(0, Math.min(text.length, Math.trunc(offset) || 0));
	let from = Math.min(clamp(start), clamp(end));
	let to = Math.max(clamp(start), clamp(end));

	let position = 0;
	for (const segment of segments) {
		const length = segmentLength(segment);
		if (segment.kind === "image") {
			if (from > position && from < position + length) from = position;
			if (to > position && to < position + length) to = position + length;
		}
		position += length;
	}
	if (splitsSurrogatePair(text, from)) from -= 1;
	if (splitsSurrogatePair(text, to)) to += 1;
	return [from, to];
}

// Cuts the linear form at two offsets that `snapRange` has already made safe.
function partition(
	segments: readonly Segment[],
	start: number,
	end: number,
): readonly [Segment[], Segment[], Segment[]] {
	const before: Segment[] = [];
	const middle: Segment[] = [];
	const after: Segment[] = [];
	let position = 0;
	for (const segment of segments) {
		const length = segmentLength(segment);
		const segmentEnd = position + length;
		if (segment.kind === "image") {
			// Atomic: `snapRange` guarantees no edge falls inside it.
			if (segmentEnd <= start) before.push(segment);
			else if (position >= end) after.push(segment);
			else middle.push(segment);
		} else {
			const cut = (from: number, to: number): Segment => ({
				...segment,
				text: segment.text.slice(from - position, to - position),
			});
			const headEnd = Math.min(segmentEnd, start);
			const tailStart = Math.max(position, end);
			if (headEnd > position) before.push(cut(position, headEnd));
			const middleStart = Math.max(position, start);
			const middleEnd = Math.min(segmentEnd, end);
			if (middleEnd > middleStart) middle.push(cut(middleStart, middleEnd));
			if (segmentEnd > tailStart) after.push(cut(tailStart, segmentEnd));
		}
		position = segmentEnd;
	}
	return [before, middle, after];
}

// The link a position sits strictly inside, when the units on both sides of it
// belong to the same link.
function enclosingLink(
	before: readonly Segment[],
	after: readonly Segment[],
): string | null {
	const left = before.at(-1);
	const right = after[0];
	if (left?.kind !== "text" || right?.kind !== "text") return null;
	return left.link !== null && left.link === right.link ? left.link : null;
}

// The range an operation over these offsets actually acts on: ordered,
// clamped, and widened so it never cuts an image or a surrogate pair. An
// editor places its caret from this after an edit.
export function snapInlineRange(
	value: TextContent,
	start: number,
	end: number,
): readonly [number, number] {
	return snapRange(segmentsOf(value), start, end);
}

export function inlineLength(value: TextContent): number {
	return typeof value === "string" ? value.length : inlineText(value).length;
}

// The content between two offsets, with its formatting, links, and images.
export function sliceInline(
	value: TextContent,
	start: number,
	end: number,
): TextContent {
	const segments = segmentsOf(value);
	const [from, to] = snapRange(segments, start, end);
	return contentOf(partition(segments, from, to)[1]);
}

// Replaces a range with a fragment: typing, deleting, pasting, and inserting
// an image are all this. Formatted content keeps its own formatting. Plain
// text typed over a range takes the marks and link of the first text it
// replaces, the way typing over a selection does; inserted at a caret it is
// unmarked. Unlinked text inserted strictly inside a link, over nothing but
// that link's own text, joins it, so typing in the middle of a label extends
// that label; an image never joins a link,
// so inserting one there splits the link around it.
export function replaceRange(
	value: TextContent,
	start: number,
	end: number,
	fragment: TextContent,
): TextContent {
	const segments = segmentsOf(value);
	const [from, to] = snapRange(segments, start, end);
	const [before, middle, after] = partition(segments, from, to);
	const replaced = middle.find((segment) => segment.kind === "text");
	let inserted = segmentsOf(fragment);
	if (typeof fragment === "string" && replaced?.kind === "text") {
		inserted = replaced.marks.reduce<Segment[]>(
			(styled, mark) =>
				styled.flatMap((segment) =>
					segment.kind === "text" ? applyMark(segment, mark, true) : [segment],
				),
			inserted.map((segment) => ({ ...segment, link: replaced.link })),
		);
	}
	// A replaced range is inside a link only when everything it held was: two
	// separate links to one URL around unlinked text are not one link.
	const enclosing = enclosingLink(before, after);
	const link = middle.every(
		(segment) => segment.kind === "text" && segment.link === enclosing,
	)
		? enclosing
		: null;
	return contentOf([
		...before,
		...inserted.map((segment) =>
			link !== null && segment.kind === "text" && segment.link === null
				? { ...segment, link }
				: segment,
		),
		...after,
	]);
}

function applyMark(
	segment: Segment & { readonly kind: "text" },
	mark: InlineMark,
	enabled: boolean,
): Segment[] {
	if (!enabled) {
		return [
			{ ...segment, marks: segment.marks.filter((each) => each !== mark) },
		];
	}
	if (mark === "code") {
		// Code replaces every other mark and stops at each line break, which
		// keeps the marks it had.
		return segment.text
			.split(/([\r\n])/)
			.map((text) =>
				LINE_BREAK.test(text)
					? { ...segment, text }
					: { ...segment, text, marks: ["code"] },
			);
	}
	// Code text takes no other mark.
	if (segment.marks.includes("code")) return [segment];
	return [{ ...segment, marks: canonicalMarks([...segment.marks, mark]) }];
}

// Adds or removes one mark across a range. Images carry no marks and are left
// as they are, and so is code text for every mark but code itself.
export function setMark(
	value: TextContent,
	start: number,
	end: number,
	mark: InlineMark,
	enabled: boolean,
): TextContent {
	const segments = segmentsOf(value);
	const [from, to] = snapRange(segments, start, end);
	if (from === to) return value;
	const [before, middle, after] = partition(segments, from, to);
	const changed = middle.flatMap((segment) =>
		segment.kind === "text" ? applyMark(segment, mark, enabled) : [segment],
	);
	return contentOf([...before, ...changed, ...after]);
}

// Whether a mark is on across a range, for pressed and mixed control state.
// `unavailable` means the range holds nothing the mark can apply to: only
// images, only line breaks for code, or only code text for any other mark.
// A collapsed range reports the text just before it, or just after it at the
// start, which is the formatting typing there would continue.
export type MarkState = "on" | "off" | "mixed" | "unavailable";

function eligibleText(
	segment: Segment & { readonly kind: "text" },
	mark: InlineMark,
): string {
	if (mark === "code") return segment.text.replace(/[\r\n]/g, "");
	return segment.marks.includes("code") ? "" : segment.text;
}

export function markState(
	value: TextContent,
	start: number,
	end: number,
	mark: InlineMark,
): MarkState {
	const segments = segmentsOf(value);
	const [from, to] = snapRange(segments, start, end);
	let range: Segment[];
	if (from === to) {
		const [before, , after] = partition(segments, from, to);
		const neighbour = before.at(-1) ?? after[0];
		range = neighbour ? [neighbour] : [];
	} else {
		range = partition(segments, from, to)[1];
	}

	let on = false;
	let off = false;
	for (const segment of range) {
		if (segment.kind !== "text" || eligibleText(segment, mark) === "") continue;
		if (segment.marks.includes(mark)) on = true;
		else off = true;
	}
	if (on && off) return "mixed";
	if (on) return "on";
	if (off) return "off";
	return from === to ? "off" : "unavailable";
}

// A mark command: removes the mark where the whole range already has it and
// adds it everywhere otherwise.
export function toggleMark(
	value: TextContent,
	start: number,
	end: number,
	mark: InlineMark,
): TextContent {
	const state = markState(value, start, end, mark);
	if (state === "unavailable") return value;
	return setMark(value, start, end, mark, state !== "on");
}

export interface InlineLinkRange {
	readonly start: number;
	readonly end: number;
	readonly url: string;
}

// Every link with the offsets of its label, in document order.
export function inlineLinks(value: TextContent): readonly InlineLinkRange[] {
	const links: InlineLinkRange[] = [];
	let position = 0;
	for (const segment of segmentsOf(value)) {
		const length = segmentLength(segment);
		const link = segment.kind === "text" ? segment.link : null;
		const last = links.at(-1);
		if (link !== null) {
			if (last && last.end === position && last.url === link) {
				links[links.length - 1] = { ...last, end: position + length };
			} else {
				links.push({ start: position, end: position + length, url: link });
			}
		}
		position += length;
	}
	return links;
}

// Where each image sits in the projection, which is the span of its
// alternative text, in document order.
export function inlineImages(
	value: TextContent,
): readonly { readonly start: number; readonly end: number }[] {
	const images: { start: number; end: number }[] = [];
	let position = 0;
	for (const segment of segmentsOf(value)) {
		const length = segmentLength(segment);
		if (segment.kind === "image") {
			images.push({ start: position, end: position + length });
		}
		position += length;
	}
	return images;
}

// Links a range of text to a URL, replacing any link it overlaps within the
// range. Null when there is nothing to link, when the range holds an image, or
// when the URL is empty: a link cannot contain an image, and a URL is required.
export function setLink(
	value: TextContent,
	start: number,
	end: number,
	url: string,
): TextContent | null {
	if (url === "") return null;
	const segments = segmentsOf(value);
	const [from, to] = snapRange(segments, start, end);
	if (from === to) return null;
	const [before, middle, after] = partition(segments, from, to);
	if (middle.some((segment) => segment.kind === "image")) return null;
	const linked = middle.map((segment) => ({ ...segment, link: url }));
	return contentOf([...before, ...linked, ...after]);
}

// Removes every link the range touches, whole, keeping its text and marks. A
// collapsed range touches a link when it sits inside it or at either edge.
export function removeLink(
	value: TextContent,
	start: number,
	end: number,
): TextContent {
	const segments = segmentsOf(value);
	const [from, to] = snapRange(segments, start, end);
	const touched = inlineLinks(value).filter((link) =>
		from === to
			? link.start <= from && from <= link.end
			: link.start < to && from < link.end,
	);
	if (touched.length === 0) return value;
	let position = 0;
	const unlinked = segments.map((segment) => {
		const segmentStart = position;
		position += segmentLength(segment);
		if (segment.kind !== "text" || segment.link === null) return segment;
		const inTouched = touched.some(
			(link) => link.start <= segmentStart && segmentStart < link.end,
		);
		return inTouched ? { ...segment, link: null } : segment;
	});
	return contentOf(unlinked);
}
