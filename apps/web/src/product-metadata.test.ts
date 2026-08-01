import { describe, expect, it } from "vitest";
import { createProductMetadata } from "./product-metadata";

describe("createProductMetadata", () => {
	it("emits sharing metadata and the deployment URL for a subpath build", () => {
		const metadata = createProductMetadata({
			basePath: "/tabelo/",
			siteOrigin: "https://martonpaulo.github.io",
		});

		expect(metadata).toMatch(/<meta property="og:title" content="[^"]+" \/>/);
		expect(metadata).toMatch(
			/<meta property="og:description" content="[^"]+" \/>/,
		);
		expect(metadata).toMatch(/<meta property="og:type" content="[^"]+" \/>/);
		expect(metadata).toMatch(/<meta name="twitter:card" content="[^"]+" \/>/);
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
