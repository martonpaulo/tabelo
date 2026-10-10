import { describe, expect, it } from "vitest";
import { submenuRefusal } from "./submenu-refusal";

// Reasons are opaque here: the helper passes them through or replaces them,
// and never reads their wording.
const blocked = "blocked";
const elsewhere = "elsewhere";

describe("submenuRefusal", () => {
	it("leaves a submenu enabled while any row can run", () => {
		expect(submenuRefusal([blocked, undefined])).toBeUndefined();
		expect(submenuRefusal([undefined, blocked])).toBeUndefined();
		expect(submenuRefusal([undefined, undefined])).toBeUndefined();
	});

	it("does not refuse an empty submenu", () => {
		expect(submenuRefusal([])).toBeUndefined();
	});

	it("passes up the one reason every row shares", () => {
		expect(submenuRefusal([blocked])).toBe(blocked);
		expect(submenuRefusal([blocked, blocked, blocked])).toBe(blocked);
	});

	it("gives one general reason when the rows disagree", () => {
		const reason = submenuRefusal([blocked, elsewhere]);
		expect(reason).toBeTruthy();
		expect(reason).not.toBe(blocked);
		expect(reason).not.toBe(elsewhere);
		expect(submenuRefusal([elsewhere, blocked])).toBe(reason);
	});
});
