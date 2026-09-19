import { cellTextContentAt } from "@/core/cell-value";
import { normalizeMatrix } from "@/core/document";
import { normalizeInline } from "@/core/inline-content";
import type {
	Alignment,
	InlineMark,
	InlineNode,
	TableDocument,
	TextContent,
} from "@/core/types";
import {
	type DelimitedMark,
	type InlineElement,
	inlineElements,
	linkChildren,
	markEvents,
} from "./inline-syntax";
import { toDocumentParseResult } from "./parse";
import type {
	EscapeMatcher,
	MatrixParseResult,
	ParseIssue,
	TableCodec,
} from "./types";

// HTML parsing uses the platform's own parser rather than a hand-rolled one.
// Real pasted markup is messy, with nested elements, entities, and attributes.
// DOMParser handles all of it correctly for free.
//
// The markup is untrusted (#306). It is only ever read as a tree: the elements
// that mean an approved inline feature become structure, and nothing else does.
// Unsupported formatting keeps its text and says so in a warning; content with
// no text to keep, such as an embedded video or an image without alternative
// text, refuses the parse rather than disappearing.

const ALIGNMENTS: Record<string, Alignment> = {
	left: "left",
	center: "center",
	right: "right",
};

export function escapeHtmlText(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

// HTML carries one line break, and this codec spells it "\n" in both
// directions. A CRLF pair collapses to a single break rather than two, which is
// why this is one regex and not two chained replacements.
//
// Exported because the clipboard writes its own HTML flavour: it has to spell
// a line break the same way this codec reads one back, and the private payload
// beside it has to be compared on those terms.
export function normalizeLineEndings(value: string): string {
	return value.replace(/\r\n?/g, "\n");
}

// The line break as it is spelled in HTML source, at one offset: `<br>`, the
// one spelling the serializer writes, and the `<br/>` and `<br />` spellings
// the browser's parser reads as the same element. A source view draws its
// line-break marker over exactly these characters, so what counts as a break
// has one owner, the codec, rather than a second guess in the editor.
// Sticky, so the match is anchored at `lastIndex`.
const LINE_BREAK_ELEMENT = /<br\s*\/?>/iy;

export const matchHtmlLineBreak: EscapeMatcher = (value, index) => {
	if (value[index] !== "<") return null;
	LINE_BREAK_ELEMENT.lastIndex = index;
	const element = LINE_BREAK_ELEMENT.exec(value);
	return element
		? { source: element[0], decoded: "\n", kind: "line-break" }
		: null;
};

// Reading one cell

// The elements that mean an approved mark. `<b>` and `<i>` are the equivalent
// presentational spellings and normalize to bold and italic.
const MARK_ELEMENTS: Record<string, DelimitedMark> = {
	STRONG: "bold",
	B: "bold",
	EM: "italic",
	I: "italic",
	U: "underline",
	S: "strikethrough",
	STRIKE: "strikethrough",
};

// Formatting the product deliberately does not carry (#306 non-goals). Its text
// stays, and the warning says the formatting did not.
const UNSUPPORTED_FORMATTING = new Set([
	"SUP",
	"SUB",
	"MARK",
	"DEL",
	"INS",
	"SMALL",
	"BIG",
	"FONT",
	"Q",
	"ABBR",
	"KBD",
	"SAMP",
	"VAR",
	"TT",
	"CITE",
	"DFN",
	"BLINK",
]);

// Content that has no text to keep. Projecting it would lose what the reader
// sees, so the parse refuses instead.
const EMBEDDED_CONTENT = new Set([
	"VIDEO",
	"AUDIO",
	"IFRAME",
	"OBJECT",
	"EMBED",
	"CANVAS",
	"SVG",
	"MATH",
]);

// Never shown to a reader, so never part of a cell.
const INVISIBLE = new Set(["SCRIPT", "STYLE", "TEMPLATE"]);

type CellIssue = Extract<
	ParseIssue,
	{
		readonly code:
			| "html-formatting-unsupported"
			| "html-linked-image-unsupported"
			| "html-image-alt-required"
			| "html-embedded-content-unsupported";
	}
>;

interface CellReading {
	readonly nodes: InlineNode[];
	readonly warnings: CellIssue[];
	refusal: CellIssue | null;
}

interface Context {
	readonly marks: readonly DelimitedMark[];
	// The tag that opened each mark, for a warning about one code drops.
	readonly markTags: readonly string[];
	readonly code: boolean;
	readonly link: string | null;
}

function pushText(reading: CellReading, text: string, context: Context) {
	if (text === "") return;
	const pieces = context.code ? text.split(/(\n)/) : [text];
	for (const piece of pieces) {
		if (piece === "") continue;
		// Code carries no other mark and never crosses a line break
		// (docs/adr/0011), so a break inside `<code>` is ordinary text.
		const marks: InlineMark[] =
			context.code && piece !== "\n" ? ["code"] : [...context.marks];
		const run = { kind: "text" as const, text: piece, marks };
		reading.nodes.push(
			context.link === null
				? run
				: { kind: "link", url: context.link, children: [run] },
		);
	}
}

function warn(reading: CellReading, issue: CellIssue) {
	if (
		!reading.warnings.some(
			(existing) =>
				existing.code === issue.code &&
				("tag" in existing ? existing.tag : "") ===
					("tag" in issue ? issue.tag : ""),
		)
	) {
		reading.warnings.push(issue);
	}
}

function tagOf(element: Element): string {
	return element.tagName.toLowerCase();
}

// The DOM's node-type numbers, spelled out rather than read from the global
// `Node`, which only exists where a DOM does: a DOMParser supplied from
// elsewhere (the browser suite reads copied HTML in Node) brings no globals.
const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

function readNode(node: Node, reading: CellReading, context: Context) {
	if (reading.refusal) return;
	if (node.nodeType === TEXT_NODE) {
		pushText(reading, normalizeLineEndings(node.textContent ?? ""), context);
		return;
	}
	if (node.nodeType !== ELEMENT_NODE) return;
	const element = node as Element;
	const name = element.tagName.toUpperCase();

	if (INVISIBLE.has(name)) return;
	if (EMBEDDED_CONTENT.has(name)) {
		reading.refusal = {
			code: "html-embedded-content-unsupported",
			tag: tagOf(element),
		};
		return;
	}
	if (name === "BR") {
		pushText(reading, "\n", context);
		return;
	}
	if (name === "IMG") {
		const alt = normalizeLineEndings(element.getAttribute("alt") ?? "");
		const url = element.getAttribute("src") ?? "";
		if (alt === "") {
			reading.refusal = { code: "html-image-alt-required" };
			return;
		}
		if (url === "") {
			// A browser shows an image with no source as its alternative text,
			// so that text is what the reader sees and what the cell keeps.
			warn(reading, { code: "html-formatting-unsupported", tag: "img" });
			pushText(reading, alt, context);
			return;
		}
		// A link holds text only, so an image inside one keeps its image and
		// loses the link around it.
		if (context.link !== null) {
			warn(reading, { code: "html-linked-image-unsupported" });
		}
		reading.nodes.push({ kind: "image", url, alt });
		return;
	}

	let next = context;
	const mark = MARK_ELEMENTS[name];
	if (mark) {
		if (context.code) {
			warn(reading, {
				code: "html-formatting-unsupported",
				tag: tagOf(element),
			});
		} else if (!context.marks.includes(mark)) {
			next = {
				...context,
				marks: [...context.marks, mark],
				markTags: [...context.markTags, tagOf(element)],
			};
		}
	} else if (name === "CODE") {
		// Code carries no other mark, so the formatting around it stops at it.
		const outer = context.markTags[0];
		if (outer !== undefined) {
			warn(reading, { code: "html-formatting-unsupported", tag: outer });
		}
		next = { ...context, code: true };
	} else if (name === "A") {
		const href = element.getAttribute("href");
		if (href && context.link === null) next = { ...context, link: href };
	} else if (UNSUPPORTED_FORMATTING.has(name)) {
		warn(reading, { code: "html-formatting-unsupported", tag: tagOf(element) });
	}
	for (const child of element.childNodes) readNode(child, reading, next);
}

function readCell(cell: Element): CellReading {
	const reading: CellReading = { nodes: [], warnings: [], refusal: null };
	const context: Context = {
		marks: [],
		markTags: [],
		code: false,
		link: null,
	};
	for (const child of cell.childNodes) readNode(child, reading, context);
	return reading;
}

function alignmentOf(cell: Element): Alignment {
	const inline = (cell as HTMLElement).style?.textAlign?.toLowerCase();
	if (inline && ALIGNMENTS[inline]) return ALIGNMENTS[inline];
	const attribute = cell.getAttribute("align")?.toLowerCase();
	if (attribute && ALIGNMENTS[attribute]) return ALIGNMENTS[attribute];
	return "default";
}

export interface HtmlTable {
	readonly matrix: TextContent[][];
	readonly headerRow: boolean;
	readonly alignments: readonly Alignment[];
	readonly warnings: readonly ParseIssue[];
}

export type HtmlTableReading =
	| { readonly ok: true; readonly table: HtmlTable }
	| { readonly ok: false; readonly issue: ParseIssue };

// Extracts the first table from an HTML fragment. Shared by this codec and the
// clipboard, which faces the same problem from a different direction. Null
// when there is no table to read at all.
export function readHtmlTable(html: string): HtmlTableReading | null {
	if (typeof DOMParser === "undefined") return null;
	if (!html.trim()) return null;

	const parsed = new DOMParser().parseFromString(html, "text/html");
	const table = parsed.querySelector("table");
	if (!table) return null;

	const rows = [...table.querySelectorAll("tr")];
	if (rows.length === 0) return null;

	const warnings: ParseIssue[] = [];
	const matrix: TextContent[][] = [];
	for (const row of rows) {
		const values: TextContent[] = [];
		for (const cell of row.querySelectorAll("th, td")) {
			const reading = readCell(cell);
			if (reading.refusal) return { ok: false, issue: reading.refusal };
			for (const warning of reading.warnings) {
				if (
					!warnings.some(
						(existing) => JSON.stringify(existing) === JSON.stringify(warning),
					)
				) {
					warnings.push(warning);
				}
			}
			values.push(normalizeInline(reading.nodes));
		}
		matrix.push(values);
	}
	if (!matrix.some((row) => row.length > 0)) return null;

	const headerCells = [...(rows[0]?.querySelectorAll("th, td") ?? [])];
	// A row is the document header only when every cell is marked as one. A
	// mixed row commonly uses <th> as a row label inside body data; treating it
	// as the table header would drop that row from the imported data.
	const headerRow =
		headerCells.length > 0 &&
		headerCells.every((cell) => cell.tagName === "TH");
	const alignments = headerCells.map((cell) => alignmentOf(cell));

	return {
		ok: true,
		table: {
			matrix: normalizeMatrix(matrix) as TextContent[][],
			headerRow,
			alignments,
			warnings,
		},
	};
}

function parseHtmlMatrix(text: string): MatrixParseResult {
	if (text.trim() === "") {
		return { ok: false, issues: [{ code: "empty-source" }] };
	}
	if (typeof DOMParser === "undefined") {
		return {
			ok: false,
			issues: [{ code: "html-unavailable" }],
		};
	}

	const reading = readHtmlTable(text);
	if (!reading) {
		return {
			ok: false,
			issues: [{ code: "html-table-required" }],
		};
	}
	if (!reading.ok) return { ok: false, issues: [reading.issue] };

	const { table } = reading;
	return {
		ok: true,
		table: {
			matrix: table.matrix,
			headerRow: table.headerRow,
			alignments: table.alignments,
		},
		warnings: table.warnings.length > 0 ? table.warnings : undefined,
	};
}

// Writing one cell

const MARK_TAGS: Record<DelimitedMark, string> = {
	bold: "strong",
	italic: "em",
	underline: "u",
	strikethrough: "s",
};

// A newline in the value is real data; <br> is how HTML carries it. The
// normalization runs before the substitution so a CRLF becomes one <br>.
function textMarkup(text: string): string {
	return escapeHtmlText(normalizeLineEndings(text)).replace(/\n/g, "<br>");
}

function elementsMarkup(elements: readonly InlineElement[]): string {
	let out = "";
	for (const event of markEvents(elements)) {
		if (event.kind === "open") {
			out += `<${MARK_TAGS[event.mark]}>`;
			continue;
		}
		if (event.kind === "close") {
			out += `</${MARK_TAGS[event.mark]}>`;
			continue;
		}
		const element = event.element;
		switch (element.kind) {
			case "text":
				out += textMarkup(element.text);
				break;
			case "code":
				out += `<code>${textMarkup(element.text)}</code>`;
				break;
			case "image":
				out += `<img src="${escapeHtmlText(element.url)}" alt="${escapeHtmlText(element.alt)}">`;
				break;
			case "link":
				out += `<a href="${escapeHtmlText(element.url)}">${elementsMarkup(
					linkChildren(element),
				)}</a>`;
				break;
		}
	}
	return out;
}

// What a value reads as once this codec has written it and read it back: its
// projection, with each run's line endings folded where the writer folds them.
// A carriage return that ends one run and a line feed that starts the next are
// two breaks here, because each run is written on its own.
export function htmlProjection(value: TextContent): string {
	if (typeof value === "string") return normalizeLineEndings(value);
	return value.nodes
		.map((node) => {
			switch (node.kind) {
				case "text":
					return normalizeLineEndings(node.text);
				case "link":
					return node.children
						.map((child) => normalizeLineEndings(child.text))
						.join("");
				case "image":
					return normalizeLineEndings(node.alt);
			}
			return "";
		})
		.join("");
}

// The markup for one header or cell's content, semantic elements included.
// Exported because the clipboard's public HTML flavour writes cells the same
// way this codec reads them back.
export function htmlCellContent(value: TextContent): string {
	return typeof value === "string"
		? textMarkup(value)
		: elementsMarkup(inlineElements(value));
}

function cellMarkup(
	tag: "th" | "td",
	value: TextContent,
	align: Alignment,
): string {
	const style = align === "default" ? "" : ` style="text-align: ${align}"`;
	return `      <${tag}${style}>${htmlCellContent(value)}</${tag}>`;
}

// Indented and line-broken on purpose: this output is meant to be read and
// pasted by a person, not minified.
function serializeHtml(document: TableDocument): string {
	const header = document.columns
		.map((column) => cellMarkup("th", column.header, column.align))
		.join("\n");

	const body = document.rows
		.map((row) => {
			const cells = document.columns
				.map((column) =>
					cellMarkup("td", cellTextContentAt(row, column.id), column.align),
				)
				.join("\n");
			return `    <tr>\n${cells}\n    </tr>`;
		})
		.join("\n");

	return [
		"<table>",
		"  <thead>",
		"    <tr>",
		header,
		"    </tr>",
		"  </thead>",
		"  <tbody>",
		body,
		"  </tbody>",
		"</table>",
	].join("\n");
}

export const htmlCodec: TableCodec = {
	id: "html",
	reconciliation: {
		cellValues: "text",
		columnAlignment: "carried",
		inlineContent: "carried",
	},
	extension: "html",
	mimeType: "text/html",
	parseMatrix: parseHtmlMatrix,
	parse: (text) => toDocumentParseResult(parseHtmlMatrix(text)),
	serialize: serializeHtml,
};
