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

	// Only the deploy workflow sets SITE_ORIGIN. Local builds have no public
	// deployment URL, so omitting URL metadata prevents them from advertising
	// the production site or localhost.
	if (siteOrigin) {
		const canonicalUrl = new URL(basePath, siteOrigin);
		const imageUrl = new URL("pwa-512x512.png", canonicalUrl);
		const canonical = escapeHtmlAttribute(canonicalUrl.toString());
		const image = escapeHtmlAttribute(imageUrl.toString());
		tags.push(
			`<meta property="og:url" content="${canonical}" />`,
			`<meta property="og:image" content="${image}" />`,
			`<meta name="twitter:image" content="${image}" />`,
			`<link rel="canonical" href="${canonical}" />`,
		);
	}

	return tags.join("\n    ");
}
