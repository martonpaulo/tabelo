// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { normalizeInline } from "@/core/inline-content";
import { samplePerson } from "@/core/sample-data";
import type { TextContent } from "@/core/types";
import { offsetAt, pointAt, renderEditorContent } from "./editor-dom";

// The rich cell editor speaks the core's projection offsets; the page speaks
// DOM boundary points. These are the two translations between them, over
// content with marks, a link, an image, and a trailing line break.

const ingrid = samplePerson(0);

const content: TextContent = normalizeInline([
	{ kind: "text", text: ingrid.name, marks: ["bold"] },
	{ kind: "text", text: " in ", marks: [] },
	{
		kind: "link",
		url: "https://example.com/rio",
		children: [{ kind: "text", text: ingrid.city, marks: ["italic"] }],
	},
	{ kind: "image", url: "http://example.com/rio.png", alt: "Sugarloaf" },
	{ kind: "text", text: "!\n", marks: [] },
]);
const projection = `${ingrid.name} in ${ingrid.city}Sugarloaf!\n`;

function editor(): HTMLElement {
	const root = document.createElement("div");
	document.body.append(root);
	renderEditorContent(root, content, { icon: () => null, wrapped: false });
	return root;
}

describe("the rich editor's DOM", () => {
	it("draws the marks as their semantic elements", () => {
		const root = editor();
		expect(root.querySelector("strong")?.textContent).toBe(ingrid.name);
		expect(root.querySelector("[data-editor-link] em")?.textContent).toBe(
			ingrid.city,
		);
		const image = root.querySelector("[data-editor-image]");
		expect(image?.getAttribute("contenteditable")).toBe("false");
		// An address that may not load shows its alternative text instead.
		expect(root.querySelector("img")).toBeNull();
		expect(
			image?.querySelector('[role="img"]')?.getAttribute("aria-label"),
		).toBe("Sugarloaf");
	});

	it("maps every offset to a point and back", () => {
		const root = editor();
		const imageStart = `${ingrid.name} in ${ingrid.city}`.length;
		const imageEnd = imageStart + "Sugarloaf".length;
		for (let offset = 0; offset <= projection.length; offset += 1) {
			const point = pointAt(root, offset);
			const back = offsetAt(root, point.node, point.offset);
			// Inside the atomic image, a point stands at its far edge.
			const expected =
				offset > imageStart && offset < imageEnd ? imageEnd : offset;
			expect(back).toBe(expected);
		}
	});

	it("counts a point inside the image as its far edge", () => {
		const root = editor();
		const inside = root.querySelector("[data-editor-image] span");
		if (!inside) throw new Error("expected the unavailable image");
		const imageEnd = `${ingrid.name} in ${ingrid.city}Sugarloaf`.length;
		expect(offsetAt(root, inside, 0)).toBe(imageEnd);
	});

	it("gives an empty editor a line for the caret", () => {
		const root = document.createElement("div");
		renderEditorContent(root, "", { icon: () => null, wrapped: false });
		expect(root.querySelector("br")).not.toBeNull();
		expect(pointAt(root, 0)).toEqual({ node: root, offset: 0 });
	});
});
