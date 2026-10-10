import { describe, expect, it } from "vitest";
import { documentFromMatrix } from "@/core/document";
import { setAlignment, setCell } from "@/core/operations";
import { samplePeopleMatrix } from "@/core/sample-data";
import type { InlineContent, TableDocument } from "@/core/types";
import { canSerialize, listCodecs } from "@/formats";
import { exportLosses, hasExportLoss } from "./projection-loss";

// What the export chooser discloses (#431) follows from the document and the
// facts each codec declares, never from a format's name, so every case runs
// over the whole registry and reads its expectation from those facts.

const boldIngrid: InlineContent = {
	kind: "inline",
	nodes: [{ kind: "text", text: "Ingrid", marks: ["bold"] }],
};

function textRoster(): TableDocument {
	return documentFromMatrix(
		samplePeopleMatrix(2).map((row) => row.map(String)),
		{ headerRow: true },
	);
}

function typedRoster(): TableDocument {
	// Ages are numbers because the roster declares them; one is cleared to
	// null and one city replaced by a boolean, so all three kinds are present.
	const roster = documentFromMatrix(samplePeopleMatrix(2), {
		headerRow: true,
	});
	return setCell(setCell(roster, 0, 3, null), 1, 1, true);
}

describe("exportLosses", () => {
	it("discloses nothing for a table of plain, unaligned text", () => {
		const document = textRoster();
		for (const codec of listCodecs()) {
			expect(hasExportLoss(exportLosses(document, codec)), codec.id).toBe(
				false,
			);
		}
	});

	it("names the typed kinds present only where the format spells text", () => {
		const document = typedRoster();
		for (const codec of listCodecs()) {
			const losses = exportLosses(document, codec);
			if (codec.reconciliation.cellValues === "text") {
				expect(losses.typedValues, codec.id).toEqual([
					"number",
					"boolean",
					"null",
				]);
			} else {
				expect(losses.typedValues, codec.id).toEqual([]);
				expect(losses.typedValueAlternatives, codec.id).toEqual([]);
			}
			expect(losses.inlineContent, codec.id).toBe(false);
			expect(losses.alignment, codec.id).toBe(false);
		}
	});

	it("names only the typed kinds the cells actually hold", () => {
		const document = documentFromMatrix(samplePeopleMatrix(2), {
			headerRow: true,
		});
		for (const codec of listCodecs()) {
			if (codec.reconciliation.cellValues !== "text") continue;
			expect(exportLosses(document, codec).typedValues, codec.id).toEqual([
				"number",
			]);
		}
	});

	it("offers for types only formats that keep them and can write the table", () => {
		const document = typedRoster();
		const lossy = listCodecs().filter(
			(codec) => codec.reconciliation.cellValues === "text",
		);
		expect(lossy.length).toBeGreaterThan(0);
		for (const codec of lossy) {
			const alternatives = exportLosses(document, codec).typedValueAlternatives;
			expect(alternatives.length, codec.id).toBeGreaterThan(0);
			for (const alternative of alternatives) {
				expect(alternative.reconciliation.cellValues).toBe("typed");
				expect(canSerialize(alternative, document)).toBeNull();
			}
		}
	});

	it("discloses alignment only where the format cannot spell it", () => {
		const document = setAlignment(textRoster(), 0, "center");
		for (const codec of listCodecs()) {
			const losses = exportLosses(document, codec);
			expect(losses.alignment, codec.id).toBe(
				codec.reconciliation.columnAlignment === "unexpressed",
			);
			for (const alternative of losses.alignmentAlternatives) {
				expect(alternative.reconciliation.columnAlignment).toBe("carried");
				expect(canSerialize(alternative, document)).toBeNull();
			}
			if (losses.alignment) {
				expect(losses.alignmentAlternatives.length, codec.id).toBeGreaterThan(
					0,
				);
			}
			expect(losses.typedValues, codec.id).toEqual([]);
		}
	});

	it("discloses inline formatting only where the format flattens it", () => {
		const document = setCell(textRoster(), 0, 0, boldIngrid);
		for (const codec of listCodecs()) {
			const losses = exportLosses(document, codec);
			expect(losses.inlineContent, codec.id).toBe(
				codec.reconciliation.inlineContent === "unexpressed",
			);
			expect(losses.typedValues, codec.id).toEqual([]);
			expect(losses.alignment, codec.id).toBe(false);
		}
	});

	it("offers no alternative a table cannot be written in", () => {
		// Two columns with one name: a keyed format cannot write this table, so
		// it is never offered as the way to keep anything.
		const document = setAlignment(
			documentFromMatrix(
				[
					["name", "name"],
					["Ingrid", 35],
				],
				{ headerRow: true },
			),
			0,
			"right",
		);
		const refused = listCodecs().filter(
			(codec) => canSerialize(codec, document) !== null,
		);
		expect(refused.length).toBeGreaterThan(0);
		for (const codec of listCodecs()) {
			const losses = exportLosses(document, codec);
			for (const alternative of [
				...losses.typedValueAlternatives,
				...losses.alignmentAlternatives,
			]) {
				expect(refused, alternative.id).not.toContain(alternative);
			}
		}
	});
});
