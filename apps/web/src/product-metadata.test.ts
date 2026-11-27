import { describe, expect, it } from "vitest";
import { product } from "./copy/product";
import {
	createNotFoundPage,
	createProductMetadata,
	createStaticIntro,
} from "./product-metadata";

describe("createProductMetadata", () => {
	it("emits sharing metadata and the deployment URL for a root build with an origin", () => {
		const metadata = createProductMetadata({
			basePath: "/",
			siteOrigin: "https://tabelo.martonpaulo.com",
		});

		expect(metadata).toMatch(/<meta property="og:title" content="[^"]+" \/>/);
		expect(metadata).toMatch(
			/<meta property="og:description" content="[^"]+" \/>/,
		);
		expect(metadata).toMatch(/<meta property="og:type" content="[^"]+" \/>/);
		expect(metadata).toMatch(/<meta name="twitter:card" content="[^"]+" \/>/);
		expect(metadata).toContain(
			'<meta property="og:url" content="https://tabelo.martonpaulo.com/" />',
		);
		expect(metadata).toContain(
			'<meta property="og:image" content="https://tabelo.martonpaulo.com/social-card.jpg" />',
		);
		expect(metadata).toContain(
			'<meta name="twitter:image" content="https://tabelo.martonpaulo.com/social-card.jpg" />',
		);
		expect(metadata).toContain(
			'<meta property="og:site_name" content="Tabelo" />',
		);
		expect(metadata).toContain(
			'<link rel="canonical" href="https://tabelo.martonpaulo.com/" />',
		);
	});

	it("resolves the deployment URL against a subpath base", () => {
		const metadata = createProductMetadata({
			basePath: "/preview/",
			siteOrigin: "https://tabelo.martonpaulo.com",
		});

		expect(metadata).toContain(
			'<link rel="canonical" href="https://tabelo.martonpaulo.com/preview/" />',
		);
		expect(metadata).toContain(
			'<meta property="og:image" content="https://tabelo.martonpaulo.com/preview/social-card.jpg" />',
		);
	});

	it("describes the product as a free application for search engines", () => {
		const metadata = createProductMetadata({
			basePath: "/",
			siteOrigin: "https://tabelo.martonpaulo.com",
		});

		const jsonLd = metadata.match(
			/<script type="application\/ld\+json">(.*?)<\/script>/s,
		);
		expect(jsonLd).not.toBeNull();
		const node = JSON.parse((jsonLd as RegExpMatchArray)[1] as string);
		expect(node["@type"]).toBe("SoftwareApplication");
		expect(node.url).toBe("https://tabelo.martonpaulo.com/");
		expect(node.image).toBe("https://tabelo.martonpaulo.com/social-card.jpg");
		expect(node.offers.price).toBe("0");
	});

	it("names the site for search results with a WebSite node", () => {
		const metadata = createProductMetadata({
			basePath: "/",
			siteOrigin: "https://tabelo.martonpaulo.com",
		});

		const nodes = [
			...metadata.matchAll(
				/<script type="application\/ld\+json">(.*?)<\/script>/gs,
			),
		].map((match) => JSON.parse(match[1] as string));
		const website = nodes.find((node) => node["@type"] === "WebSite");
		expect(website).toEqual({
			"@context": "https://schema.org",
			"@type": "WebSite",
			name: "Tabelo",
			url: "https://tabelo.martonpaulo.com/",
		});
	});

	it("omits URL-bearing metadata from a build without a site origin", () => {
		const metadata = createProductMetadata({ basePath: "/" });

		expect(metadata).not.toContain("og:url");
		expect(metadata).not.toContain("ld+json");
		expect(metadata).not.toContain("og:image");
		expect(metadata).not.toContain('rel="canonical"');
		expect(metadata).not.toContain("tabelo.martonpaulo.com");
	});

	it("stamps the built commit only when the build names one", () => {
		const sha = "0123456789abcdef0123456789abcdef01234567";
		expect(createProductMetadata({ basePath: "/", buildSha: sha })).toContain(
			`<meta name="build" content="${sha}" />`,
		);
		expect(createProductMetadata({ basePath: "/" })).not.toContain(
			'name="build"',
		);
	});
});

// #586: the copy of index.html that Pages serves with a 404 status.
describe("createNotFoundPage", () => {
	const indexHtml = `<!doctype html>
<html lang="en">
  <head>
    ${createProductMetadata({
			basePath: "/",
			siteOrigin: "https://tabelo.martonpaulo.com",
		})}
  </head>
  <body></body>
</html>`;

	it("asks search engines not to index it", () => {
		expect(createNotFoundPage(indexHtml)).toMatch(
			/<meta name="robots" content="noindex" \/>\s*<\/head>/,
		);
	});

	it("claims neither a canonical address nor the home page's URL", () => {
		const page = createNotFoundPage(indexHtml);
		expect(page).not.toContain('rel="canonical"');
		expect(page).not.toContain("og:url");
		expect(page).toContain("og:title");
	});

	it("refuses a document with no head to add noindex to", () => {
		expect(() => createNotFoundPage("<html></html>")).toThrow("</head>");
	});
});

// #362: what a crawler without JavaScript reads, built from the product copy.
describe("createStaticIntro", () => {
	it("names the product, credits the author, and links the repository", () => {
		const intro = createStaticIntro();
		expect(intro.match(/<h1\b/g)).toHaveLength(1);
		expect(intro).toContain(`href="${product.author.url}"`);
		expect(intro).toContain(`href="${product.repositoryUrl}"`);
	});

	it("escapes the copy it is built from", () => {
		expect(createStaticIntro()).not.toMatch(/<(?!\/?(?:main|h1|p|a)\b)/);
	});
});
