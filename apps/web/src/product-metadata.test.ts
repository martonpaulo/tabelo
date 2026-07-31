import { describe, expect, it } from "vitest";
import { product } from "./copy/product";
import { createProductMetadata } from "./product-metadata";

describe("createProductMetadata", () => {
	it("emits sharing metadata and the deployment URL for a subpath build", () => {
		const metadata = createProductMetadata({
			basePath: "/tabelo/",
			siteOrigin: "https://martonpaulo.github.io",
		});

		expect(metadata).toContain(
			`<meta property="og:title" content="${product.documentTitle}" />`,
		);
		expect(metadata).toContain(
			`<meta property="og:description" content="${product.description}" />`,
		);
		expect(metadata).toContain(
			`<meta property="og:type" content="${product.openGraphType}" />`,
		);
		expect(metadata).toContain(
			`<meta name="twitter:card" content="${product.twitterCard}" />`,
		);
		expect(metadata).toContain(
			'<meta property="og:url" content="https://martonpaulo.github.io/tabelo/" />',
		);
		expect(metadata).toContain(
			'<link rel="canonical" href="https://martonpaulo.github.io/tabelo/" />',
		);
	});

	it("omits URL-bearing metadata from a local root build", () => {
		const metadata = createProductMetadata({
			basePath: "/",
			siteOrigin: "https://martonpaulo.github.io",
		});

		expect(metadata).not.toContain("og:url");
		expect(metadata).not.toContain('rel="canonical"');
		expect(metadata).not.toContain("martonpaulo.github.io");
	});
});
