import { IconPhotoOff } from "@tabler/icons-react";
import { type ReactNode, useState } from "react";
import { copy } from "@/copy/copy";
import type { InlineText, TextContent } from "@/core/types";
import { imageLoads, linkActivation } from "./url-policy";

// A cell's content as semantic React elements (#306): `strong`, `em`, `u`,
// `s`, `code`, `a`, and `img`, built from the document's validated nodes.
// Authored markup never reaches the page: nothing here takes an HTML string,
// and there is no dangerouslySetInnerHTML. Line breaks stay characters, so the
// surface it sits in keeps `whitespace-pre-wrap` as it did for plain text.
// Formatting is carried by the elements themselves, never by colour, so it
// holds in forced-colour mode. See docs/adr/0011.

function markedRun(run: InlineText): ReactNode {
	if (run.marks.includes("code")) {
		return <code className="font-value">{run.text}</code>;
	}
	let node: ReactNode = run.text;
	if (run.marks.includes("strikethrough")) node = <s>{node}</s>;
	if (run.marks.includes("underline")) node = <u>{node}</u>;
	if (run.marks.includes("italic")) node = <em>{node}</em>;
	if (run.marks.includes("bold")) node = <strong>{node}</strong>;
	return node;
}

function Link({
	url,
	children,
}: {
	readonly url: string;
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
				className="underline decoration-dotted underline-offset-2"
			>
				{children}
			</span>
		);
	}
	return (
		<a
			href={url}
			// A web page opens in its own browsing context and learns nothing
			// about the page that opened it. An email address is left to the
			// browser's ordinary mailto handling.
			{...(activation === "web"
				? {
						target: "_blank",
						rel: "noopener noreferrer",
						"aria-description": copy.a11y.opensInNewTab,
					}
				: {})}
			className="underline underline-offset-2"
		>
			{children}
		</a>
	);
}

// An image loads lazily, sends no referrer, and never grows past the shared
// inline-image size. One that may not load, or fails to, shows its
// alternative text in a stable place instead of a broken image.
function Image({ url, alt }: { readonly url: string; readonly alt: string }) {
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
			onError={() => setFailed(true)}
			className="inline-block max-h-inline-image max-w-full align-middle"
		/>
	);
}

export function InlineContentView({ value }: { readonly value: TextContent }) {
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
					<Link key={key} url={node.url}>
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
					<Image key={`${key}:${node.url}`} url={node.url} alt={node.alt} />
				);
		}
		return null;
	});
}
