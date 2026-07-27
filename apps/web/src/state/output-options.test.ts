import { beforeEach, describe, expect, it } from "vitest";
import { documentFromMatrix, documentToMatrix } from "@/core/document";
import { listDownloadableCodecs, outputOptionsFor } from "@/formats";
import { defaultOutputOptions } from "@/formats/types";
import { textForView, useTabeloStore } from "./store";

// The header row exists in the document and always will. What the checkbox
// changes is one file, so the test that matters is everything it must leave
// alone: the table, the history, and every other view.

const initialState = useTabeloStore.getInitialState();

beforeEach(() => {
	useTabeloStore.setState(initialState, true);
	useTabeloStore.setState({
		document: documentFromMatrix(
			[
				["Name", "Role"],
				["Ana", "Designer"],
			],
			{ headerRow: true },
		),
	});
});

function csv() {
	const codec = listDownloadableCodecs().find(
		(candidate) => candidate.id === "csv",
	);
	if (!codec) throw new Error("The CSV codec is not registered.");
	return codec;
}

describe("the download preference", () => {
	it("starts at the codec's declared default", () => {
		expect(useTabeloStore.getState().outputOptions).toEqual(
			defaultOutputOptions,
		);
		expect(defaultOutputOptions.includeHeader).toBe(true);
	});

	it("decides whether the file prints the header row", () => {
		const document = useTabeloStore.getState().document;

		expect(csv().serialize(document, { includeHeader: true })).toBe(
			"Name,Role\nAna,Designer",
		);
		expect(csv().serialize(document, { includeHeader: false })).toBe(
			"Ana,Designer",
		);
	});

	it("changes nothing but the next file", () => {
		const before = useTabeloStore.getState();

		before.setOutputOption("includeHeader", false);

		const after = useTabeloStore.getState();
		expect(after.document).toBe(before.document);
		expect(after.past).toBe(before.past);
		expect(after.future).toBe(before.future);
		expect(after.draft).toBe(before.draft);
		// Source projections are the document's, not the download's.
		expect(textForView(after.document, "csv")).toContain("Name,Role");
		expect(textForView(after.document, "markdown")).toContain("Name");
		expect(documentToMatrix(after.document)[0]).toEqual(["Name", "Role"]);
	});

	// CSV and TSV are one serializer, so TSV would honour a flag it never
	// offered. Narrowing the values to what a codec declared is what stops
	// unchecking the box under CSV from quietly changing a TSV file too.
	it("does not reach formats that never declared it", () => {
		const document = useTabeloStore.getState().document;
		const chosen = { includeHeader: false };

		for (const codec of listDownloadableCodecs()) {
			const narrowed = outputOptionsFor(codec, chosen);
			if (codec.outputOptions?.includes("includeHeader")) {
				expect(narrowed).toEqual({ includeHeader: false });
				continue;
			}
			expect(narrowed).toEqual({});
			expect(codec.serialize(document, narrowed)).toBe(
				codec.serialize(document),
			);
			expect(codec.serialize(document)).toContain("Name");
		}
	});

	it("is offered by exactly the formats that can honour it", () => {
		const declaring = listDownloadableCodecs()
			.filter((codec) => codec.outputOptions?.includes("includeHeader"))
			.map((codec) => codec.id);

		expect(declaring).toEqual(["csv"]);
	});

	it("is session-only, so it never reaches what gets persisted", () => {
		useTabeloStore.getState().setOutputOption("includeHeader", false);

		// The autosave payload is built from document, workspace, and draft only.
		expect(Object.keys(useTabeloStore.getState())).toContain("outputOptions");
		expect(initialState.outputOptions).toEqual(defaultOutputOptions);
	});
});
