import { type RefObject, useEffect, useLayoutEffect, useRef } from "react";
import { textMatches } from "@/core/find";
import type { TableDocument } from "@/core/types";
import {
	type FindSummary,
	type FindTarget,
	usePaneFind,
} from "@/ui/workspace/use-pane-find";

// Find in the rendered preview (#280), over the text the reader is shown. It
// is read-only, so its target offers no replacing at all.
//
// The current occurrence is painted with the CSS Custom Highlight API: a
// `Range` over the text node, registered under a name the stylesheet styles
// with `::highlight()`. Nothing in the preview's DOM changes, which is the only
// way to keep the neutral-document treatment docs/design-system.md §3 commits
// it to, and to leave the accessible text and every copy path holding one
// unbroken value. Chromium is the only supported browser and has the API, so
// this is the platform's answer rather than a wrapper element or a dependency.
// https://developer.mozilla.org/en-US/docs/Web/API/CSS_Custom_Highlight_API
//
// Matching is the grid's own literal rule, applied to each value as the
// preview shows it: a preview value is exactly one text node, so no match can
// span two cells, just as a grid match never does. Only the table is searched:
// the empty state's own words are not the reader's content.

// The one name the stylesheet paints. Shared by every preview surface, each of
// which adds and removes only its own range, so a second one could never erase
// the first one's mark.
const CURRENT_HIGHLIGHT = "tabelo-find-current";

// The paint for that name, the same pair the grid's mark and a source pane's
// current match wear (docs/design-system.md §1). Adopted from here rather than
// written in the global stylesheet because the build's CSS optimizer does not
// know the `::highlight()` pseudo-element and warns on every build; it keeps
// the name and its paint beside each other as a bonus.
function adoptHighlightStyle(): void {
	const sheet = new CSSStyleSheet();
	sheet.replaceSync(
		`::highlight(${CURRENT_HIGHLIGHT}) { background-color: var(--primary); color: var(--primary-foreground); }`,
	);
	document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
}

function currentHighlight(): Highlight {
	const existing = CSS.highlights.get(CURRENT_HIGHLIGHT);
	if (existing) return existing;
	adoptHighlightStyle();
	const created = new Highlight();
	CSS.highlights.set(CURRENT_HIGHLIGHT, created);
	return created;
}

function matchRanges(
	root: HTMLElement,
	query: string,
	caseSensitive: boolean,
): Range[] {
	const table = root.querySelector("table");
	if (query === "" || !table) return [];
	const ranges: Range[] = [];
	const walker = document.createTreeWalker(table, NodeFilter.SHOW_TEXT);
	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		for (const { start, end } of textMatches(
			node.textContent ?? "",
			query,
			caseSensitive,
		)) {
			const range = new Range();
			range.setStart(node, start);
			range.setEnd(node, end);
			ranges.push(range);
		}
	}
	return ranges;
}

// Registers the preview's find target with its pane and keeps its matches in
// step with what the preview renders. `root` is the rendered table's scroller,
// which is also where closing the bar returns the keyboard.
export function usePreviewFind(
	root: RefObject<HTMLElement | null>,
	document: TableDocument,
): void {
	const paneFind = usePaneFind();
	const paneFindRef = useRef(paneFind);
	paneFindRef.current = paneFind;
	const search = useRef({ query: "", caseSensitive: false });
	const ranges = useRef<Range[]>([]);
	const index = useRef(-1);
	const marked = useRef<Range | null>(null);

	// Everything below reads refs, so the target is built once per pane and the
	// functions it holds never describe a stale match list.
	const target = useRef<{
		readonly find: FindTarget;
		readonly refresh: () => void;
	} | null>(null);
	if (!target.current) {
		// Reported on every change, and handed back to the press that caused it.
		// The surface is the one owner of where its matches are (use-pane-find).
		const summary = (): FindSummary | null => {
			const current: FindSummary | null =
				search.current.query === ""
					? null
					: { total: ranges.current.length, index: index.current };
			paneFindRef.current.report(current);
			return current;
		};

		const paint = (reveal: boolean) => {
			const highlight = currentHighlight();
			if (marked.current) highlight.delete(marked.current);
			const current = ranges.current[index.current] ?? null;
			marked.current = current;
			if (!current) return;
			highlight.add(current);
			if (reveal) {
				current.startContainer.parentElement?.scrollIntoView({
					block: "nearest",
					inline: "nearest",
				});
			}
		};

		const recompute = () => {
			const element = root.current;
			ranges.current = element
				? matchRanges(
						element,
						search.current.query,
						search.current.caseSensitive,
					)
				: [];
		};

		target.current = {
			find: {
				search: (query, caseSensitive) => {
					search.current = { query, caseSensitive };
					recompute();
					index.current = ranges.current.length > 0 ? 0 : -1;
					paint(true);
					return summary();
				},
				step: (offset) => {
					const total = ranges.current.length;
					if (total === 0) return summary();
					index.current = (index.current + offset + total) % total;
					paint(true);
					return summary();
				},
				close: () => {
					search.current = { query: "", caseSensitive: false };
					ranges.current = [];
					index.current = -1;
					paint(false);
					summary();
				},
				focus: () => root.current?.focus(),
			},
			// The table re-rendered: the old ranges point at text nodes that may
			// be gone. The position is kept where it was, clamped into the new
			// list, like the grid's after an edit elsewhere in the table.
			refresh: () => {
				if (search.current.query === "") return;
				recompute();
				const total = ranges.current.length;
				index.current =
					total === 0 ? -1 : Math.min(Math.max(index.current, 0), total - 1);
				paint(false);
				summary();
			},
		};
	}

	useEffect(() => {
		const current = target.current;
		if (!current) return;
		const unregister = paneFind.register(current.find);
		return () => {
			current.find.close();
			unregister();
			paneFind.report(null);
		};
	}, [paneFind]);

	// After the commit that rendered the new document, so the ranges are taken
	// over the text nodes that are actually on screen.
	// biome-ignore lint/correctness/useExhaustiveDependencies: the document is the trigger, read through the DOM rather than directly
	useLayoutEffect(() => {
		target.current?.refresh();
	}, [document]);
}
