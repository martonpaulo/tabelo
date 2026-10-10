import type { TypedValueType } from "@/core/cell-value";
import {
	hasColumnAlignment,
	hasInlineContent,
	typedValueTypes,
} from "@/core/document";
import type { TableDocument } from "@/core/types";
import { listDownloadableCodecs } from "@/formats";
import type { TableCodec } from "@/formats/types";
import { getView } from "./registry";
import type { ViewDefinition, ViewId } from "./types";

// Where inline structure would become plain text (#306). A format whose codec
// declares inline content unexpressed shows a formatted document only as its
// projection: an unchanged cell keeps its structure through reconciliation,
// but an edited one, a copy, or a file in that format holds visible text and
// alternative text only. Decided by the codec's declared capability, never by
// naming a format. See docs/adr/0011.

export function flattensInlineContent(codec: TableCodec): boolean {
	return codec.reconciliation.inlineContent === "unexpressed";
}

// The open views a user can edit a formatted document through while seeing only
// its projection, in workspace order and each once.
export function plainEditableViews(
	viewIds: readonly ViewId[],
): readonly ViewDefinition[] {
	const views: ViewDefinition[] = [];
	for (const id of viewIds) {
		const view = getView(id);
		if (
			view.capabilities.editable &&
			view.codec &&
			flattensInlineContent(view.codec) &&
			!views.includes(view)
		) {
			views.push(view);
		}
	}
	return views;
}

// What a dismissal of the projection notice is remembered against: the set of
// plain views that were open. Opening another one is a new situation, so the
// notice returns for it.
export function plainViewsSignature(views: readonly ViewDefinition[]): string {
	return views.map((view) => view.id).join(",");
}

// What a file in one format leaves out of this document (#431), said beside
// the format choice before anything is written. Each loss is a fact the
// document holds that the codec declares it cannot spell, read from the same
// reconciliation facts a source pane relies on, so this is the one owner of
// the rule and no format is named. A loss offers only formats that keep that
// one property and can write this table, so nothing suggests a format keeps
// what it does not. An empty result means the file says everything the
// table's text, types, and alignment say.
//
// A column's expected type is not here: it guides entry in the grid, no
// format writes it, JSON included, so a warning about it would follow every
// typed table with no alternative to offer.
export interface ExportLosses {
	readonly inlineContent: boolean;
	// The kinds of non-text value present, in the fixed order. Empty when the
	// format keeps types or the cells hold text only.
	readonly typedValues: readonly TypedValueType[];
	readonly typedValueAlternatives: readonly TableCodec[];
	readonly alignment: boolean;
	readonly alignmentAlternatives: readonly TableCodec[];
}

export function exportLosses(
	document: TableDocument,
	codec: TableCodec,
): ExportLosses {
	const facts = codec.reconciliation;
	const typedValues =
		facts.cellValues === "text" ? typedValueTypes(document) : [];
	const alignment =
		facts.columnAlignment === "unexpressed" && hasColumnAlignment(document);
	const writable =
		typedValues.length > 0 || alignment ? listDownloadableCodecs(document) : [];
	return {
		inlineContent: hasInlineContent(document) && flattensInlineContent(codec),
		typedValues,
		typedValueAlternatives:
			typedValues.length > 0
				? writable.filter(
						(candidate) => candidate.reconciliation.cellValues === "typed",
					)
				: [],
		alignment,
		alignmentAlternatives: alignment
			? writable.filter(
					(candidate) => candidate.reconciliation.columnAlignment === "carried",
				)
			: [],
	};
}

export function hasExportLoss(losses: ExportLosses): boolean {
	return (
		losses.inlineContent || losses.typedValues.length > 0 || losses.alignment
	);
}
