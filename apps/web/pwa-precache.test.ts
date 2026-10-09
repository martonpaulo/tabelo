import { globSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { precacheGlobPatterns } from "./pwa-precache";

// Public files are copied to the root of the build, which is where Workbox
// resolves the patterns, so matching them against `public` answers whether a
// file reaches the precache without running a build.
const publicDir = new URL("./public/", import.meta.url);

function precachedPublicFiles(): string[] {
	return globSync(precacheGlobPatterns, { cwd: publicDir });
}

// The images `index.html` asks the browser to fetch before first paint: the
// shell treats them as part of its first frame, so an offline start needs them.
function preloadedPublicImages(): string[] {
	const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
	const links = html.match(/<link\b[^>]*>/g) ?? [];
	return links
		.filter((link) => /\brel="preload"/.test(link) && /\bas="image"/.test(link))
		.map((link) => /\bhref="%BASE_URL%([^"]+)"/.exec(link)?.[1])
		.filter((href): href is string => href !== undefined);
}

describe("service-worker precache", () => {
	it("keeps the mark the welcome state and app menu render", () => {
		expect(precachedPublicFiles()).toContain("logo.svg");
	});

	it("keeps every image the document preloads", () => {
		const preloaded = preloadedPublicImages();
		expect(preloaded.length).toBeGreaterThan(0);
		expect(precachedPublicFiles()).toEqual(expect.arrayContaining(preloaded));
	});
});
