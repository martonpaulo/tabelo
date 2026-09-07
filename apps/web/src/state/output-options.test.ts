import { beforeEach, describe, expect, it } from "vitest";
import { documentFromMatrix, documentToMatrix } from "@/core/document";
import { listDownloadableCodecs, outputOptionsFor } from "@/formats";
import { defaultOutputOptions } from "@/formats/types";
import { textForView, useTabeloStore } from "./store";

// An output option shapes one downloaded file and nothing else. What the
// checkbox must leave alone is everything: the table, the history, and every
// other view. The header row is not one of these choices: it is structural, so
// CSV prints it unconditionally and declares no option at all.

const initialState = useTabeloStore.getInitialState();

beforeEach(() => {
	useTabeloStore.setState(initialState, true);
	useTabeloStore.setState({
		document: documentFromMatrix(
			[
				["Name", "Role"],
				["Ingrid", "Designer"],
			],
			{ headerRow: true },
		),
	});
});

function codec(id: string) {
	const found = listDownloadableCodecs(useTabeloStore.getState().document).find(
		(candidate) => candidate.id === id,
	);
	if (!found) throw new Error(`The ${id} codec is not registered.`);
	return found;
}

describe("the download preference", () => {
	it("starts at the codec's declared default", () => {
		expect(useTabeloStore.getState().outputOptions).toEqual(
			defaultOutputOptions,
		);
	});

	it("decides what the file prints", () => {
		const document = useTabeloStore.getState().document;
		const records = codec("records");

		expect(
			records.serialize(document, { includeFirstColumnName: true }),
		).not.toBe(records.serialize(document, { includeFirstColumnName: false }));
	});

	it("changes nothing but the next file", () => {
		const before = useTabeloStore.getState();

		before.setOutputOption("includeFirstColumnName", false);

		const after = useTabeloStore.getState();
		expect(after.document).toBe(before.document);
		expect(after.past).toBe(before.past);
		expect(after.future).toBe(before.future);
		expect(after.draft).toBe(before.draft);
		// Source projections are the document's, not the download's.
		expect(textForView(after.document, "csv")).toEqual(
			expect.objectContaining({
				ok: true,
				text: expect.stringContaining("Name,Role"),
			}),
		);
		expect(textForView(after.document, "markdown")).toEqual(
			expect.objectContaining({
				ok: true,
				text: expect.stringContaining("Name"),
			}),
		);
		expect(documentToMatrix(after.document)[0]).toEqual(["Name", "Role"]);
	});

	// Formats share serializers, so a value left in would be honoured by a
	// format that never offered the choice. Narrowing to what a codec declared
	// is what keeps one format's checkbox out of another format's file.
	it("does not reach formats that never declared it", () => {
		const document = useTabeloStore.getState().document;
		const chosen = {
			includeFirstColumnName: false,
			includeEmptyValues: false,
		};

		for (const candidate of listDownloadableCodecs(document)) {
			const narrowed = outputOptionsFor(candidate, chosen);
			const declared = candidate.outputOptions ?? [];

			expect(Object.keys(narrowed).sort()).toEqual([...declared].sort());
			if (declared.length > 0) continue;

			expect(candidate.serialize(document, narrowed)).toBe(
				candidate.serialize(document),
			);
			expect(candidate.serialize(document)).toContain("Name");
		}
	});

	it("is offered by exactly the formats that can honour it", () => {
		const declaring = listDownloadableCodecs(useTabeloStore.getState().document)
			.filter((candidate) => (candidate.outputOptions ?? []).length > 0)
			.map((candidate) => candidate.id);

		expect(declaring).toEqual(["records"]);
	});

	// CSV and TSV are one serializer, and the header row is not negotiable in
	// either: no chosen option can produce a file without it.
	it.each(["csv", "tsv"] as const)(
		"always writes the header row in %s, whatever is chosen",
		(id) => {
			const document = useTabeloStore.getState().document;
			const candidate = codec(id);
			const narrowed = outputOptionsFor(candidate, {
				includeFirstColumnName: false,
				includeEmptyValues: false,
			});

			expect(candidate.serialize(document, narrowed)).toBe(
				candidate.serialize(document),
			);
			expect(candidate.serialize(document).split("\n")[0]).toBe(
				["Name", "Role"].join(candidate.fieldSeparator ?? ","),
			);
		},
	);
});
