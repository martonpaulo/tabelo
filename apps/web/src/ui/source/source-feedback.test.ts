import { describe, expect, it } from "vitest";
import { copy } from "@/copy/copy";
import { sourceFeedbackIds } from "./source-feedback";

describe("source feedback copy", () => {
	it("maps parser codes to product copy with source lines", () => {
		expect(
			copy.source.issue({
				code: "delimited-unclosed-quote",
				line: 2,
			}),
		).toBe("Line 2: A quoted field is not closed.");
	});

	it("keeps actionable Markdown guidance", () => {
		expect(
			copy.source.issue({ code: "markdown-divider-required", line: 2 }),
		).toBe("Line 2: The second line must be a divider like | --- | --- |.");
	});
});

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
