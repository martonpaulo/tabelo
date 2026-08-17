import { createContext, useContext } from "react";
import type { OccurrenceSummary } from "@/ui/source/occurrence-selection";

// How the pane header learns what the source editor's selection looks like.
//
// The editor stays the selection's owner and publishes only the derived summary
// the header needs to render. Nothing travels the other way, and nothing here
// reaches the document, the draft, or workspace persistence: a view change, a
// pane closing, or the editor remounting drops it because there is nowhere for
// it to have been kept.
export const PaneOccurrencesContext = createContext<
	(summary: OccurrenceSummary | null) => void
>(() => {});

export function useReportPaneOccurrences() {
	return useContext(PaneOccurrencesContext);
}
