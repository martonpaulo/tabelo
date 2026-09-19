import { INLINE_MARKS, normalizeInline } from "@/core/inline-content";
import type {
	InlineMark,
	InlineNode,
	InlineText,
	TextContent,
} from "@/core/types";
import type { EscapeKind } from "./types";

// The machinery the text formats that spell inline structure share (#306):
// Markdown and Jira. Each owns its grammar, its escapes, and its tokenizer;
// this module owns only what is the same for both, so neither grows a second,
// slightly different idea of how a mark nests or when a delimiter may pair.
// HTML reads markup through the platform and writes tags, and uses only the
// mark nesting below. See docs/adr/0011.

// Every mark but code, which is a span of its own in both text grammars
// rather than a delimiter that may open and close around other content.
export type DelimitedMark = Exclude<InlineMark, "code">;

// What sits beside a delimiter. The two grammars decide whether a delimiter
// may open or close from nothing else: whitespace on its inner side, or a
// letter or digit on its outer side, keeps it literal.
export type CharClass = "none" | "space" | "alnum" | "other";

const SPACE = /^\s$/u;
const ALNUM = /^[\p{L}\p{N}]$/u;

export function classOf(char: string | null | undefined): CharClass {
	if (char === null || char === undefined || char === "") return "none";
	if (SPACE.test(char)) return "space";
	if (ALNUM.test(char)) return "alnum";
	return "other";
}

// The whole code point that ends just before `index`, or starts at it, so a
// letter outside the Basic Multilingual Plane is classified as the letter it
// is rather than as half of a surrogate pair.
export function codePointBefore(
	text: string,
	index: number,
	from: number,
): string | null {
	if (index <= from) return null;
	const low = text.charCodeAt(index - 1);
	if (low >= 0xdc00 && low <= 0xdfff && index - 2 >= from) {
		const high = text.charCodeAt(index - 2);
		if (high >= 0xd800 && high <= 0xdbff) return text.slice(index - 2, index);
	}
	return text[index - 1] ?? null;
}

export function codePointAt(
	text: string,
	index: number,
	to: number,
): string | null {
	if (index >= to) return null;
	const point = text.codePointAt(index);
	if (point === undefined) return null;
	const char = String.fromCodePoint(point);
	return index + char.length <= to ? char : (text[index] ?? null);
}

// A decimal character reference, the one spelling both grammars use for a
// character that cannot stand for itself in its position.
export function numericEntity(char: string): string {
	return `&#${char.codePointAt(0) ?? 0};`;
}

// The two grammars read one character reference: whitespace, which boundary
// padding would otherwise eat or which would stop a delimiter from opening,
// and a letter or digit beside a delimiter that must not touch one. Returns
// what it stands for, or null for any other reference, which stays literal.
export function decodableEntity(
	codePoint: number,
): { readonly decoded: string; readonly whitespace: boolean } | null {
	if (codePoint > 0x10ffff || codePoint === 13) return null;
	const decoded = String.fromCodePoint(codePoint);
	if (SPACE.test(decoded)) return { decoded, whitespace: true };
	if (ALNUM.test(decoded)) return { decoded, whitespace: false };
	return null;
}

// What a decodable reference is to a reader: a line break, which is now the
// spelling Markdown writes for one (#397), or whitespace, or a character.
export function entityKind(decodable: {
	readonly decoded: string;
	readonly whitespace: boolean;
}): EscapeKind {
	if (decodable.decoded === "\n") return "line-break";
	return decodable.whitespace ? "whitespace" : "character";
}

// The syntax both text grammars share for normalizing line endings: a cell
// holds `\n`, and a carriage return is folded into it exactly as the plain
// escapers always did.
export function normalizeBreaks(text: string): string {
	return text.replace(/\r\n?/g, "\n");
}

// Parsing

// What a tokenizer hands back: literal text already decoded, a delimiter that
// has not been paired yet, and the atomic pieces its grammar recognized whole.
export type ParseToken =
	| { readonly kind: "text"; readonly text: string }
	| {
			readonly kind: "delimiter";
			readonly mark: DelimitedMark;
			readonly raw: string;
			readonly canOpen: boolean;
			readonly canClose: boolean;
	  }
	| { readonly kind: "code"; readonly text: string }
	| {
			readonly kind: "link";
			readonly url: string;
			readonly children: readonly ParseToken[];
	  }
	| { readonly kind: "image"; readonly url: string; readonly alt: string };

// Pairs delimiters the way the CommonMark emphasis algorithm does, reduced to
// what these grammars need: each closer takes the nearest earlier opener of
// its own mark with content between them, and any opener left between the two
// can no longer pair, which is what keeps every span properly nested. An
// unpaired delimiter is literal text, spelled exactly as it was written.
function pairDelimiters(tokens: readonly ParseToken[]): Map<number, number> {
	const pairs = new Map<number, number>();
	const openers: number[] = [];
	tokens.forEach((token, index) => {
		if (token.kind !== "delimiter") return;
		if (token.canClose) {
			for (let at = openers.length - 1; at >= 0; at -= 1) {
				const opener = openers[at];
				if (opener === undefined) continue;
				const candidate = tokens[opener];
				if (candidate?.kind !== "delimiter" || candidate.mark !== token.mark) {
					continue;
				}
				// A delimiter between the two that never paired is literal text by
				// now, so it counts as content.
				let hasContent = false;
				for (let between = opener + 1; between < index; between += 1) {
					if (tokens[between]?.kind !== "delimiter" || !pairs.has(between)) {
						hasContent = true;
						break;
					}
				}
				if (!hasContent) continue;
				pairs.set(opener, index);
				pairs.set(index, opener);
				openers.length = at;
				return;
			}
		}
		if (token.canOpen) openers.push(index);
	});
	return pairs;
}

function resolveRuns(
	tokens: readonly ParseToken[],
	outer: readonly InlineMark[],
): InlineNode[] {
	const pairs = pairDelimiters(tokens);
	const counts = new Map<DelimitedMark, number>();
	const active = (): InlineMark[] => [
		...outer,
		...[...counts].filter(([, count]) => count > 0).map(([mark]) => mark),
	];
	const nodes: InlineNode[] = [];
	tokens.forEach((token, index) => {
		switch (token.kind) {
			case "text":
				nodes.push({ kind: "text", text: token.text, marks: active() });
				return;
			case "code":
				// Code carries no other mark (docs/adr/0011), so formatting written
				// around it applies to the text beside it and not to the code.
				nodes.push({ kind: "text", text: token.text, marks: ["code"] });
				return;
			case "image":
				nodes.push({ kind: "image", url: token.url, alt: token.alt });
				return;
			case "link": {
				const children = resolveRuns(token.children, active()).filter(
					(child): child is InlineText => child.kind === "text",
				);
				nodes.push({ kind: "link", url: token.url, children });
				return;
			}
			case "delimiter": {
				const partner = pairs.get(index);
				if (partner === undefined) {
					nodes.push({ kind: "text", text: token.raw, marks: active() });
					return;
				}
				const count = counts.get(token.mark) ?? 0;
				counts.set(token.mark, partner > index ? count + 1 : count - 1);
				return;
			}
		}
	});
	return nodes;
}

// The canonical content a tokenized cell spells.
export function inlineFromTokens(tokens: readonly ParseToken[]): TextContent {
	return normalizeInline(resolveRuns(tokens, []));
}

// The plain projection of tokens, for an image's alternative text: a label is
// parsed like any other inline content and only what it reads as is kept.
export function tokensText(tokens: readonly ParseToken[]): string {
	const content = inlineFromTokens(tokens);
	if (typeof content === "string") return content;
	return content.nodes
		.map((node) =>
			node.kind === "text"
				? node.text
				: node.kind === "link"
					? node.children.map((child) => child.text).join("")
					: node.alt,
		)
		.join("");
}

// Serializing

// One element of a cell as the writers see it: a run of text with its marks, a
// code run, a link with its runs, or an image.
export type InlineElement =
	| {
			readonly kind: "text";
			readonly text: string;
			readonly marks: DelimitedMark[];
	  }
	| { readonly kind: "code"; readonly text: string }
	| {
			readonly kind: "link";
			readonly url: string;
			readonly children: readonly InlineElement[];
	  }
	| { readonly kind: "image"; readonly url: string; readonly alt: string };

// What the nesting pass emits, in document order.
export type MarkEvent =
	| { readonly kind: "open"; readonly mark: DelimitedMark }
	| { readonly kind: "close"; readonly mark: DelimitedMark }
	| { readonly kind: "element"; readonly element: InlineElement };

function delimitedMarks(marks: readonly InlineMark[]): DelimitedMark[] {
	return marks.filter((mark): mark is DelimitedMark => mark !== "code");
}

function runElement(run: InlineText): InlineElement {
	return run.marks.includes("code")
		? { kind: "code", text: run.text }
		: { kind: "text", text: run.text, marks: delimitedMarks(run.marks) };
}

export function inlineElements(content: TextContent): InlineElement[] {
	if (typeof content === "string") {
		return content === "" ? [] : [{ kind: "text", text: content, marks: [] }];
	}
	return content.nodes.map((node): InlineElement => {
		if (node.kind === "text") return runElement(node);
		if (node.kind === "link") {
			return {
				kind: "link",
				url: node.url,
				children: node.children.map(runElement),
			};
		}
		return { kind: "image", url: node.url, alt: node.alt };
	});
}

// The marks an element asks the surrounding nesting for. Code carries no other
// mark, so it asks for none: formatting closes before it, because every
// renderer would otherwise draw the code bold or struck through. An image is
// transparent, since no renderer draws a mark on one and the parsers drop a
// mark written around it, so formatting stays open across it. A link asks for
// the marks all of its runs share, which lets `**[a](url)**` be written
// instead of repeating the mark inside.
function wantedMarks(element: InlineElement): DelimitedMark[] | null {
	switch (element.kind) {
		case "text":
			return element.marks;
		case "code":
			return [];
		case "image":
			return null;
		case "link":
			return INLINE_MARKS.filter((mark): mark is DelimitedMark =>
				element.children.every(
					(run) =>
						run.kind === "text" && run.marks.includes(mark as DelimitedMark),
				),
			);
	}
}

// Strips marks a link already opened around itself from its runs.
export function linkChildren(
	element: InlineElement & { readonly kind: "link" },
): InlineElement[] {
	const shared = wantedMarks(element) ?? [];
	return element.children.map((child) =>
		child.kind === "text"
			? {
					...child,
					marks: child.marks.filter((mark) => !shared.includes(mark)),
				}
			: child,
	);
}

// Nests marks as delimiters or tags: one stack, closed down to the first mark
// an element no longer wants and reopened above it. Marks opened together are
// ordered longest-lasting first, so a mark that outlives its neighbours sits
// outside them and is written once.
export function markEvents(elements: readonly InlineElement[]): MarkEvent[] {
	const events: MarkEvent[] = [];
	const stack: DelimitedMark[] = [];
	const wanted = elements.map(wantedMarks);

	const lasting = (mark: DelimitedMark, from: number): number => {
		let count = 0;
		for (let index = from; index < elements.length; index += 1) {
			const marks = wanted[index];
			if (marks === null || marks === undefined) continue;
			if (!marks.includes(mark)) break;
			count += 1;
		}
		return count;
	};

	elements.forEach((element, index) => {
		const marks = wanted[index];
		if (marks !== null && marks !== undefined) {
			const firstUnwanted = stack.findIndex((mark) => !marks.includes(mark));
			if (firstUnwanted !== -1) {
				while (stack.length > firstUnwanted) {
					const mark = stack.pop();
					if (mark) events.push({ kind: "close", mark });
				}
			}
			const opening = marks
				.filter((mark) => !stack.includes(mark))
				.map((mark) => ({ mark, length: lasting(mark, index) }))
				.sort(
					(left, right) =>
						right.length - left.length ||
						INLINE_MARKS.indexOf(left.mark) - INLINE_MARKS.indexOf(right.mark),
				);
			for (const { mark } of opening) {
				events.push({ kind: "open", mark });
				stack.push(mark);
			}
		}
		events.push({ kind: "element", element });
	});
	while (stack.length > 0) {
		const mark = stack.pop();
		if (mark) events.push({ kind: "close", mark });
	}
	return events;
}

// The text grammars write through one intermediate form: every literal code
// point with the zone it sits in, every delimiter, and every piece of fixed
// syntax. Deciding how to spell a literal needs its neighbours as they will be
// written, which is why the whole cell is laid out before anything is spelled.
export type LiteralZone = "text" | "code" | "label" | "alt";

export type OutToken =
	| {
			readonly kind: "literal";
			readonly char: string;
			readonly zone: LiteralZone;
			entity: boolean;
	  }
	| {
			readonly kind: "delimiter";
			readonly mark: DelimitedMark;
			readonly role: "open" | "close";
			readonly raw: string;
	  }
	| { readonly kind: "syntax"; readonly raw: string };

export interface TextGrammar {
	readonly delimiter: (mark: DelimitedMark, role: "open" | "close") => string;
	// Whether a delimiter needs non-whitespace inside it and no letter or digit
	// outside it to open or close. The writer satisfies what is declared here
	// by spelling the offending neighbour as a character reference.
	readonly flanking: (mark: DelimitedMark) => {
		readonly inner: boolean;
		readonly outer: boolean;
	};
	readonly codeOpen: string;
	readonly codeClose: string;
	readonly linkOpen: string;
	readonly linkClose: (url: string) => string;
	readonly imageOpen: (url: string) => string;
	readonly imageClose: (url: string) => string;
	// Whether whitespace at either edge of the cell is spelled as a reference,
	// because the format trims cell padding.
	readonly protectsEdges: boolean;
	// How one literal is written, given every token of the cell.
	readonly spell: (tokens: readonly OutToken[], index: number) => string;
}

function pushLiterals(out: OutToken[], text: string, zone: LiteralZone) {
	for (const char of normalizeBreaks(text)) {
		out.push({ kind: "literal", char, zone, entity: false });
	}
}

function layOut(
	out: OutToken[],
	elements: readonly InlineElement[],
	grammar: TextGrammar,
	zone: "text" | "label",
) {
	for (const event of markEvents(elements)) {
		if (event.kind !== "element") {
			out.push({
				kind: "delimiter",
				mark: event.mark,
				role: event.kind,
				raw: grammar.delimiter(event.mark, event.kind),
			});
			continue;
		}
		const element = event.element;
		switch (element.kind) {
			case "text":
				pushLiterals(out, element.text, zone);
				break;
			case "code":
				out.push({ kind: "syntax", raw: grammar.codeOpen });
				pushLiterals(out, element.text, "code");
				out.push({ kind: "syntax", raw: grammar.codeClose });
				break;
			case "image":
				out.push({ kind: "syntax", raw: grammar.imageOpen(element.url) });
				pushLiterals(out, element.alt, "alt");
				out.push({ kind: "syntax", raw: grammar.imageClose(element.url) });
				break;
			case "link":
				out.push({ kind: "syntax", raw: grammar.linkOpen });
				layOut(out, linkChildren(element), grammar, "label");
				out.push({ kind: "syntax", raw: grammar.linkClose(element.url) });
				break;
		}
	}
}

// The character a token shows on one side once written, for the neighbour
// rules. A literal spelled as a reference shows `&` or `;`, and a line break
// is never written as whitespace in either grammar, so it reads as syntax.
export function neighbourChar(
	tokens: readonly OutToken[],
	index: number,
	direction: -1 | 1,
): string | null {
	const token = tokens[index + direction];
	if (!token) return null;
	if (token.kind === "literal") {
		if (token.entity) return direction === -1 ? ";" : "&";
		return token.char === "\n" ? " " : token.char;
	}
	if (token.raw === "") return null;
	return direction === -1
		? (codePointBefore(token.raw, token.raw.length, 0) ?? null)
		: (codePointAt(token.raw, 0, token.raw.length) ?? null);
}

export function neighbourClass(
	tokens: readonly OutToken[],
	index: number,
	direction: -1 | 1,
): CharClass {
	const char = neighbourChar(tokens, index, direction);
	return char === " " ? "other" : classOf(char);
}

function protectFlanks(tokens: OutToken[], grammar: TextGrammar) {
	tokens.forEach((token, index) => {
		if (token.kind !== "delimiter") return;
		const { inner, outer } = grammar.flanking(token.mark);
		const inside = tokens[index + (token.role === "open" ? 1 : -1)];
		const outside = tokens[index + (token.role === "open" ? -1 : 1)];
		if (
			inner &&
			inside?.kind === "literal" &&
			inside.char !== "\n" &&
			SPACE.test(inside.char)
		) {
			inside.entity = true;
		}
		if (outer && outside?.kind === "literal" && ALNUM.test(outside.char)) {
			outside.entity = true;
		}
	});
}

function protectEdges(tokens: readonly OutToken[]) {
	for (const token of tokens) {
		if (token.kind !== "literal" || !SPACE.test(token.char)) break;
		token.entity = true;
	}
	for (let index = tokens.length - 1; index >= 0; index -= 1) {
		const token = tokens[index];
		if (token?.kind !== "literal" || !SPACE.test(token.char)) break;
		token.entity = true;
	}
}

// Writes one cell in a text grammar.
export function writeInline(
	content: TextContent,
	grammar: TextGrammar,
): string {
	const tokens: OutToken[] = [];
	layOut(tokens, inlineElements(content), grammar, "text");
	protectFlanks(tokens, grammar);
	if (grammar.protectsEdges) protectEdges(tokens);
	let out = "";
	tokens.forEach((token, index) => {
		if (token.kind !== "literal") {
			out += token.raw;
		} else if (token.entity) {
			out += numericEntity(token.char);
		} else {
			out += grammar.spell(tokens, index);
		}
	});
	return out;
}

// The literal characters following `index` in one zone, for a rule that has to
// look ahead at what the text spells, such as a literal `<br>`.
export function literalsAhead(
	tokens: readonly OutToken[],
	index: number,
	length: number,
): string {
	let text = "";
	for (
		let at = index + 1;
		at < tokens.length && text.length < length;
		at += 1
	) {
		const token = tokens[at];
		if (token?.kind !== "literal" || token.entity) break;
		text += token.char;
	}
	return text;
}
