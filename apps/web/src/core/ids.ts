import type { ColumnId, RowId } from "./types";

// Application-owned identifiers. They keep selection, column widths, and the
// structural diff attached to the right row or column across reordering,
// re-parsing, and format switching.
//
// Eight hex characters is ample for a document of a few hundred rows and stays
// readable in devtools.
function createId(prefix: string): string {
	return `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 8)}`;
}

export const createColumnId = (): ColumnId => createId("c");
export const createRowId = (): RowId => createId("r");
