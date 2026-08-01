import { product } from "./copy/product";

type ProductMetadataOptions = {
	basePath: string;
	siteOrigin?: string;
};

function escapeHtmlAttribute(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll('"', "&quot;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;");
}

export function createProductMetadata({
	basePath,
	siteOrigin,
}: ProductMetadataOptions): string {
	const title = escapeHtmlAttribute(product.documentTitle);
	const description = escapeHtmlAttribute(product.description);
	const tags = [
		`<meta property="og:title" content="${title}" />`,
		`<meta property="og:description" content="${description}" />`,
		`<meta property="og:type" content="${product.openGraphType}" />`,
		`<meta name="twitter:card" content="${product.twitterCard}" />`,
	];

	// Root-based local builds do not have a public deployment URL. Omitting URL
	// metadata prevents them from advertising the production site or localhost.
	if (basePath !== "/" && siteOrigin) {
		const canonicalUrl = escapeHtmlAttribute(
			new URL(basePath, siteOrigin).toString(),
		);
		tags.push(
			`<meta property="og:url" content="${canonicalUrl}" />`,
			`<link rel="canonical" href="${canonicalUrl}" />`,
		);
	}

	return tags.join("\n    ");
}
