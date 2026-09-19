import { cn } from "@tabelo/ui/lib/utils";
import { IconPhotoOff } from "@tabler/icons-react";
import { createElement, type ReactNode, useState } from "react";
import { copy } from "@/copy/copy";
import type { InlineMark, InlineText, TextContent } from "@/core/types";
import { imageLoads, linkActivation, openLink } from "./url-policy";

// A cell's content as semantic React elements (#306): `strong`, `em`, `u`,
// `s`, `code`, `a`, and `img`, built from the document's validated nodes.
// Authored markup never reaches the page: nothing here takes an HTML string,
// and there is no dangerouslySetInnerHTML. Line breaks stay characters, so the
// surface it sits in keeps `whitespace-pre-wrap` as it did for plain text.
// Formatting is carried by the elements themselves, never by colour, so it
// holds in forced-colour mode. See docs/adr/0011.
//
// Two surfaces draw it. The rendered preview is a document, so its links are
// ordinary links. The Visual Table is a grid with one tab stop, whose click
// selects a cell: there a link stays a link to assistive technology but takes
// no tab stop and opens only on Mod+click, and an image is drawn no taller
// than a line unless its column wraps.
export type InlineSurface = "document" | "grid" | "grid-wrapped";

// The element each mark is drawn with, outermost first. Code stands alone:
// the model never combines it with another mark. The cell editor builds the
// same elements from this list, so what a cell shows while it is edited and
// after it is committed cannot drift apart.
type MarkTag = "strong" | "em" | "u" | "s" | "code";

const markTagOrder: readonly (readonly [InlineMark, MarkTag])[] = [
	["bold", "strong"],
	["italic", "em"],
	["underline", "u"],
	["strikethrough", "s"],
];

function markTags(marks: readonly InlineMark[]): readonly MarkTag[] {
	if (marks.includes("code")) return ["code"];
	return markTagOrder
		.filter(([mark]) => marks.includes(mark))
		.map(([, tag]) => tag);
}

// Code is drawn on the value face, like every value that must read exactly.
const codeClass = "font-value";
const linkClass = "underline underline-offset-2";
const inertLinkClass = "underline decoration-dotted underline-offset-2";

function markedRun(run: InlineText): ReactNode {
	return markTags(run.marks).reduceRight<ReactNode>(
		(inner, tag) =>
			createElement(
				tag,
				tag === "code" ? { className: codeClass } : null,
				inner,
			),
		run.text,
	);
}

function isGrid(surface: InlineSurface): boolean {
	return surface !== "document";
}

function Link({
	url,
	surface,
	children,
}: {
	readonly url: string;
	readonly surface: InlineSurface;
	readonly children: ReactNode;
}) {
	const activation = linkActivation(url);
	if (activation === "inert") {
		// Visible and readable, never activatable: an address Tabelo will not
		// open says so instead of pretending to be a link.
		return (
			<span
				data-inert-link
				title={copy.a11y.inertLink}
				aria-description={copy.a11y.inertLink}
				className={inertLinkClass}
			>
				{children}
			</span>
		);
	}
	const grid = isGrid(surface);
	return (
		<a
			href={url}
			data-inline-link={grid ? url : undefined}
			// A web page opens in its own browsing context and learns nothing
			// about the page that opened it. An email address is left to the
			// browser's ordinary mailto handling.
			{...(activation === "web"
				? {
						target: "_blank",
						rel: "noopener noreferrer",
						"aria-description": grid
							? copy.a11y.gridLinkOpens
							: copy.a11y.opensInNewTab,
					}
				: grid
					? { "aria-description": copy.a11y.gridLinkOpens }
					: {})}
			// In the grid a link is not a tab stop of its own (the grid keeps one),
			// is never dragged out of a cell, and a plain click selects the cell
			// rather than following it. Mod+click is the grid's way to open it.
			{...(grid
				? {
						tabIndex: -1,
						draggable: false,
						onClick: (event: React.MouseEvent) => {
							event.preventDefault();
							if (event.metaKey || event.ctrlKey) openLink(url);
						},
					}
				: {})}
			className={linkClass}
		>
			{children}
		</a>
	);
}

// An image loads lazily, sends no referrer, and never grows past the shared
// inline-image size. One that may not load, or fails to, shows its
// alternative text in a stable place instead of a broken image.
function Image({
	url,
	alt,
	surface,
}: {
	readonly url: string;
	readonly alt: string;
	readonly surface: InlineSurface;
}) {
	const [failed, setFailed] = useState(false);
	if (failed || !imageLoads(url)) {
		return (
			<span
				role="img"
				aria-label={alt}
				aria-description={copy.a11y.imageNotShown}
				data-image-state="unavailable"
				className="inline-flex items-baseline gap-1 text-muted-foreground"
			>
				<IconPhotoOff aria-hidden className="size-content-line self-center" />
				<span aria-hidden>{alt}</span>
			</span>
		);
	}
	return (
		<img
			src={url}
			alt={alt}
			loading="lazy"
			referrerPolicy="no-referrer"
			draggable={isGrid(surface) ? false : undefined}
			onError={() => setFailed(true)}
			className={cn(
				"inline-block max-w-full align-middle",
				// A row that does not wrap is one line tall, so an image in it is
				// too; a wrapped row grows to the shared inline-image size.
				surface === "grid" ? "max-h-content-line" : "max-h-inline-image",
			)}
		/>
	);
}

export function InlineContentView({
	value,
	surface = "document",
}: {
	readonly value: TextContent;
	readonly surface?: InlineSurface;
}) {
	if (typeof value === "string") return value;
	return value.nodes.map((node, index) => {
		// The nodes are the cell's own normalized sequence, and a change to any
		// of them re-renders the cell, so their position is a stable key.
		const key = `${index}:${node.kind}`;
		switch (node.kind) {
			case "text":
				return <span key={key}>{markedRun(node)}</span>;
			case "link":
				return (
					<Link key={key} url={node.url} surface={surface}>
						{node.children.map((child, childIndex) => (
							<span key={`${childIndex}:${child.text.length}`}>
								{markedRun(child)}
							</span>
						))}
					</Link>
				);
			case "image":
				// Keyed by its URL too, so a new address starts a fresh load
				// rather than inheriting the failure of the old one.
				return (
					<Image
						key={`${key}:${node.url}`}
						url={node.url}
						alt={node.alt}
						surface={surface}
					/>
				);
		}
		return null;
	});
}
