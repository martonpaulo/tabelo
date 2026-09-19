import { describe, expect, it } from "vitest";
import { menuSections } from "./menu-sections";

interface Group {
	readonly id: string;
	readonly submenu?: object;
}

const plain = (id: string): Group => ({ id });
const folded = (id: string): Group => ({ id, submenu: {} });

describe("menuSections", () => {
	it("keeps every ordinary group in a section of its own", () => {
		const sections = menuSections([plain("a"), plain("b")]);
		expect(sections.map((section) => section.map(({ id }) => id))).toEqual([
			["a"],
			["b"],
		]);
	});

	it("shares one section between adjacent submenu groups", () => {
		const sections = menuSections([
			plain("edit"),
			folded("move"),
			folded("fill"),
			folded("focus"),
			plain("remove"),
		]);
		expect(sections.map((section) => section.map(({ id }) => id))).toEqual([
			["edit"],
			["move", "fill", "focus"],
			["remove"],
		]);
	});

	it("does not join submenu groups an ordinary group separates", () => {
		const sections = menuSections([folded("a"), plain("b"), folded("c")]);
		expect(sections).toHaveLength(3);
	});
});
