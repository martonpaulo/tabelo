import { describe, expect, it } from "vitest";
import { createProductMetadata } from "./product-metadata";

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
			'<meta property="og:image" content="https://tabelo.martonpaulo.com/social-card.png" />',
		);
		expect(metadata).toContain(
			'<meta name="twitter:image" content="https://tabelo.martonpaulo.com/social-card.png" />',
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
			'<meta property="og:image" content="https://tabelo.martonpaulo.com/preview/social-card.png" />',
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
		expect(node.image).toBe("https://tabelo.martonpaulo.com/social-card.png");
		expect(node.offers.price).toBe("0");
	});

	it("omits URL-bearing metadata from a build without a site origin", () => {
		const metadata = createProductMetadata({ basePath: "/" });

		expect(metadata).not.toContain("og:url");
		expect(metadata).not.toContain("ld+json");
		expect(metadata).not.toContain("og:image");
		expect(metadata).not.toContain('rel="canonical"');
		expect(metadata).not.toContain("tabelo.martonpaulo.com");
	});
});
