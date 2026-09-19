import { cellText } from "@/core/cell-value";
import type { InlineText, TextContent } from "@/core/types";
import {
	codeClass,
	inertLinkClass,
	linkClass,
	markTags,
} from "@/ui/inline/inline-content";
import { imageLoads, linkActivation } from "@/ui/inline/url-policy";

// The rich cell editor's DOM (#306). The table document owns the content and
// the editor's model owns the selection; this module only draws that content
// into the editable element and translates between DOM positions and the
// projection offsets every core operation speaks. It is built with DOM calls
// rather than React because the browser writes into the editable element on
// its own during IME composition, and a React tree underneath would then
// disagree with the page. Nothing here parses markup: every element comes
// from a validated node, the same elements the grid renders, through the same
// mark order (`markTags`).

const IMAGE_ATTRIBUTE = "data-editor-image";
const SENTINEL_ATTRIBUTE = "data-editor-sentinel";

function runElement(run: InlineText): Node {
	return markTags(run.marks).reduceRight<Node>((inner, tag) => {
		const element = document.createElement(tag);
		if (tag === "code") element.className = codeClass;
		element.append(inner);
		return element;
	}, document.createTextNode(run.text));
}

// An image is one atomic, uneditable unit whose length in the projection is
// its alternative text's. It shows the picture where one may load, and the
// alternative text in the muted tone where it may not or fails to.
function imageElement(
	url: string,
	alt: string,
	options: EditorRenderOptions,
): HTMLElement {
	const wrapper = document.createElement("span");
	wrapper.setAttribute(IMAGE_ATTRIBUTE, String(alt.length));
	wrapper.contentEditable = "false";
	wrapper.className = "inline-block align-middle";
	const fallback = () => {
		const unavailable = document.createElement("span");
		unavailable.setAttribute("role", "img");
		unavailable.setAttribute("aria-label", alt);
		unavailable.dataset.imageState = "unavailable";
		unavailable.className =
			"inline-flex items-baseline gap-1 text-muted-foreground";
		const glyph = options.icon();
		if (glyph) unavailable.append(glyph);
		const text = document.createElement("span");
		text.setAttribute("aria-hidden", "true");
		text.textContent = alt;
		unavailable.append(text);
		wrapper.replaceChildren(unavailable);
	};
	if (!imageLoads(url)) {
		fallback();
		return wrapper;
	}
	const image = document.createElement("img");
	image.src = url;
	image.alt = alt;
	image.loading = "lazy";
	image.referrerPolicy = "no-referrer";
	image.draggable = false;
	// As tall as the cell shows it: one line, or the shared inline-image size
	// in a column that wraps.
	image.className = `inline-block max-w-full align-middle ${
		options.wrapped ? "max-h-inline-image" : "max-h-content-line"
	}`;
	image.addEventListener("error", fallback, { once: true });
	wrapper.append(image);
	return wrapper;
}

export interface EditorRenderOptions {
	// A fresh copy of the unavailable-image glyph, drawn by React elsewhere so
	// the icon has one source.
	readonly icon: () => Node | null;
	readonly wrapped: boolean;
}

export function renderEditorContent(
	root: HTMLElement,
	content: TextContent,
	options: EditorRenderOptions,
): void {
	const children: Node[] = [];
	if (typeof content === "string") {
		if (content !== "") children.push(document.createTextNode(content));
	} else {
		for (const node of content.nodes) {
			if (node.kind === "text") children.push(runElement(node));
			else if (node.kind === "image") {
				children.push(imageElement(node.url, node.alt, options));
			} else {
				const link = document.createElement("span");
				link.dataset.editorLink = node.url;
				link.className =
					linkActivation(node.url) === "inert" ? inertLinkClass : linkClass;
				link.append(...node.children.map(runElement));
				children.push(link);
			}
		}
	}
	// An empty editor, or one ending in a line break, needs something after
	// the last character for the caret to have a line to stand on. The
	// sentinel counts for nothing in the projection.
	const text = cellText(content);
	if (text === "" || text.endsWith("\n")) {
		const sentinel = document.createElement("br");
		sentinel.setAttribute(SENTINEL_ATTRIBUTE, "");
		children.push(sentinel);
	}
	root.replaceChildren(...children);
}

function isImage(node: Node): boolean {
	return node instanceof Element && node.hasAttribute(IMAGE_ATTRIBUTE);
}

// The units the projection is made of, in document order: text nodes, and
// images as single atomic units whose insides are never visited.
function leaves(root: HTMLElement): (Text | Element)[] {
	const found: (Text | Element)[] = [];
	const visit = (node: Node) => {
		for (const child of node.childNodes) {
			if (child instanceof Text) found.push(child);
			else if (child instanceof Element) {
				if (isImage(child)) found.push(child);
				else if (!child.hasAttribute(SENTINEL_ATTRIBUTE)) visit(child);
			}
		}
	};
	visit(root);
	return found;
}

function leafLength(leaf: Text | Element): number {
	return leaf instanceof Text
		? leaf.data.length
		: Number(leaf.getAttribute(IMAGE_ATTRIBUTE));
}

// The projection offset of a DOM boundary point inside the editor. A point
// inside an image resolves to the image's far edge, which the core snaps to
// anyway, since an image is atomic.
export function offsetAt(
	root: HTMLElement,
	container: Node,
	offset: number,
): number {
	if (!root.contains(container)) return 0;
	const range = root.ownerDocument.createRange();
	range.setStart(root, 0);
	range.setEnd(container, offset);
	let total = 0;
	for (const leaf of leaves(root)) {
		if (leaf === container) return total + offset;
		if (!range.intersectsNode(leaf)) break;
		total += leafLength(leaf);
	}
	return total;
}

export interface DomPoint {
	readonly node: Node;
	readonly offset: number;
}

function before(node: Node): DomPoint {
	const parent = node.parentNode as Node;
	return {
		node: parent,
		offset: Array.prototype.indexOf.call(parent.childNodes, node),
	};
}

function after(node: Node): DomPoint {
	const point = before(node);
	return { node: point.node, offset: point.offset + 1 };
}

// The DOM boundary point for a projection offset. At the seam between two
// runs it stays at the end of the earlier one; an offset inside an image
// resolves to its far edge.
export function pointAt(root: HTMLElement, offset: number): DomPoint {
	let position = 0;
	let last: Text | Element | null = null;
	for (const leaf of leaves(root)) {
		const length = leafLength(leaf);
		if (leaf instanceof Text) {
			if (offset <= position + length) {
				return { node: leaf, offset: Math.max(0, offset - position) };
			}
		} else {
			if (offset <= position) return before(leaf);
			if (offset < position + length) return after(leaf);
		}
		position += length;
		last = leaf;
	}
	if (last instanceof Text) return { node: last, offset: last.data.length };
	if (last) return after(last);
	return { node: root, offset: 0 };
}
