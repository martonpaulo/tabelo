import { product } from "./copy/product";

type ProductMetadataOptions = {
	basePath: string;
	siteOrigin?: string;
	buildSha?: string;
};

// JSON inside a <script> block is not attribute content: escaping quotes there
// would corrupt it. Only "<" can end the block early, so that is what is hidden.
function escapeJsonLd(value: unknown): string {
	return JSON.stringify(value).replaceAll("<", "\\u003c");
}

function escapeHtmlAttribute(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll('"', "&quot;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;");
}

// What the page says before the application mounts: the product, what it is,
// who made it, and where its source lives. A crawler that does not run
// JavaScript reads this, and a visitor sees it for the moment before the app
// replaces it (#362). Built from the same product copy as the interface.
export function createStaticIntro(): string {
	const heading = escapeHtmlAttribute(`${product.name}: ${product.tagline}`);
	const description = escapeHtmlAttribute(product.description);
	const author = escapeHtmlAttribute(product.author.name);
	const link = (href: string, label: string) =>
		`<a href="${escapeHtmlAttribute(href)}" class="text-foreground underline underline-offset-2">${escapeHtmlAttribute(label)}</a>`;
	return [
		`<main class="mx-auto max-w-xl p-6 text-muted-foreground text-sm leading-relaxed">`,
		`<h1 class="mb-2 font-semibold text-base text-foreground">${heading}</h1>`,
		`<p>${description}.</p>`,
		`<p class="mt-4 text-xs">${escapeHtmlAttribute(product.creditLabel)} ${link(product.author.url, author)} · ${link(product.repositoryUrl, product.sourceLabel)}</p>`,
		"</main>",
	].join("");
}

export function createProductMetadata({
	basePath,
	siteOrigin,
	buildSha,
}: ProductMetadataOptions): string {
	const title = escapeHtmlAttribute(product.documentTitle);
	const description = escapeHtmlAttribute(product.description);
	const name = escapeHtmlAttribute(product.name);
	const tags = [
		`<meta property="og:title" content="${title}" />`,
		`<meta property="og:description" content="${description}" />`,
		`<meta property="og:type" content="${product.openGraphType}" />`,
		`<meta property="og:site_name" content="${name}" />`,
		`<meta property="og:locale" content="en_US" />`,
		`<meta name="twitter:card" content="${product.twitterCard}" />`,
		`<meta name="twitter:title" content="${title}" />`,
	];

	// Only the deploy workflow sets SITE_ORIGIN. Local builds have no public
	// deployment URL, so omitting URL metadata prevents them from advertising
	// the production site or localhost.
	if (siteOrigin) {
		const canonicalUrl = new URL(basePath, siteOrigin);
		// The 1200x630 card is what a link preview crops to; the PWA icon is square
		// and every platform letterboxes it.
		const imageUrl = new URL("social-card.jpg", canonicalUrl);
		const canonical = escapeHtmlAttribute(canonicalUrl.toString());
		const image = escapeHtmlAttribute(imageUrl.toString());
		tags.push(
			`<meta property="og:url" content="${canonical}" />`,
			`<meta property="og:image" content="${image}" />`,
			`<meta name="twitter:image" content="${image}" />`,
			`<meta property="og:image:width" content="1200" />`,
			`<meta property="og:image:height" content="630" />`,
			`<meta property="og:image:type" content="image/jpeg" />`,
			`<meta property="og:image:alt" content="${escapeHtmlAttribute(product.socialCardAlt)}" />`,
			`<link rel="canonical" href="${canonical}" />`,
			// One SoftwareApplication node: it is what a search engine reads to
			// show the product as an application rather than as a page.
			`<script type="application/ld+json">${escapeJsonLd({
				"@context": "https://schema.org",
				"@type": "SoftwareApplication",
				name: product.name,
				url: canonicalUrl.toString(),
				description: product.description,
				applicationCategory: "BusinessApplication",
				operatingSystem: "Any browser",
				image: imageUrl.toString(),
				isAccessibleForFree: true,
				offers: {
					"@type": "Offer",
					price: "0",
					priceCurrency: "EUR",
				},
				author: {
					"@type": "Person",
					name: product.author.name,
					url: product.author.url,
				},
			})}</script>`,
			// Google names the site in its results from a WebSite node on the home page;
			// without one it shows the bare hostname (#377).
			`<script type="application/ld+json">${escapeJsonLd({
				"@context": "https://schema.org",
				"@type": "WebSite",
				name: product.name,
				url: canonicalUrl.toString(),
			})}</script>`,
		);
	}

	// The deploy workflow stamps the commit it built, so its last step can read
	// the live page back and fail when Pages still serves another build (#586).
	if (buildSha) {
		tags.push(
			`<meta name="build" content="${escapeHtmlAttribute(buildSha)}" />`,
		);
	}

	return tags.join("\n    ");
}

const CANONICAL_LINK = /\s*<link rel="canonical"[^>]*>/g;
const OG_URL_META = /\s*<meta property="og:url"[^>]*>/g;

// GitHub Pages has no rewrite rule, so the built index.html also ships as
// 404.html: a deep link then loads the application, which normalizes the path
// to the canonical one before it mounts (docs/adr/0007). The copy answers with
// a 404 status, so it asks search engines not to index it and drops the tags
// that claim it is the home page (#586).
export function createNotFoundPage(indexHtml: string): string {
	if (!indexHtml.includes("</head>"))
		throw new Error("index.html has no </head> to add noindex before");
	return indexHtml
		.replace(CANONICAL_LINK, "")
		.replace(OG_URL_META, "")
		.replace("</head>", '<meta name="robots" content="noindex" /></head>');
}
