import { useMemo } from "react";
import { isDocumentBlank } from "@/core/document";
import { useTabeloStore } from "@/state/store";
import { copy } from "@/ui/copy";
import { Panel } from "@/ui/primitives/panel";
import { EmptyState } from "./empty-state";
import { GridToolbar } from "./grid-toolbar";
import { TableGrid } from "./table-grid";

export function TablePanel({ onImport }: { readonly onImport: () => void }) {
	const document = useTabeloStore((state) => state.document);
	const blank = useMemo(() => isDocumentBlank(document), [document]);

	return (
		<Panel>
			{/* One header row that scrolls sideways rather than wrapping, so the
			    panel's height never changes as actions come and go. */}
			<Panel.Header className="overflow-x-auto">
				<Panel.Title>{copy.panels.tableTitle}</Panel.Title>
				<Panel.Spacer />
				<GridToolbar />
			</Panel.Header>

			<Panel.Body>
				<TableGrid />
				{blank ? <EmptyState onImport={onImport} /> : null}
			</Panel.Body>
		</Panel>
	);
}
