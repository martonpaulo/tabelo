import { describe, expect, it } from "vitest";
import { sourceFeedbackIds } from "./source-feedback";

describe("source feedback ids", () => {
	it("derives stable, pane-owned relationships", () => {
		const first = sourceFeedbackIds("pane-2");

		expect(sourceFeedbackIds("pane-2")).toEqual(first);
		expect(first).toEqual({
			description: "source-feedback-pane-2",
		});
		expect(sourceFeedbackIds("pane-3").description).not.toBe(first.description);
	});
});
