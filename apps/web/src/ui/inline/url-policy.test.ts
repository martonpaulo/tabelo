import { describe, expect, it } from "vitest";
import { imageLoads, linkActivation } from "./url-policy";

describe("link activation", () => {
	it.each([
		["https://example.com/ingrid", "web"],
		["HTTP://example.com/paulo", "web"],
		["mailto:ingrid@example.com", "mail"],
		["javascript:alert(1)", "inert"],
		["data:text/html,hi", "inert"],
		["file:///etc/hosts", "inert"],
		["relative/rio.png", "inert"],
		["", "inert"],
	] as const)("treats %j as %s", (url, activation) => {
		expect(linkActivation(url)).toBe(activation);
	});
});

describe("image loading", () => {
	it.each([
		["https://example.com/rio.png", true],
		["http://example.com/rio.png", false],
		["data:image/png;base64,AAAA", false],
		["blob:https://example.com/1", false],
		["file:///rio.png", false],
		["javascript:alert(1)", false],
		["relative/rio.png", false],
	] as const)("loads %j: %s", (url, loads) => {
		expect(imageLoads(url)).toBe(loads);
	});
});
