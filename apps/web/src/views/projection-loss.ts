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
