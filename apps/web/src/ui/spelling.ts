import type { Spelling, TableCodec } from "@/formats/types";
import type { SourceDisplay } from "@/preferences/contract";
import { preferencesStore } from "@/preferences/store";
import { usePreferences } from "@/preferences/use-preferences";
import { useTabeloStore } from "@/state/store";
import { getView } from "@/views/registry";
import type { WorkspacePane } from "@/workspace/layout";
import {
	INHERIT_SOURCE_DISPLAY,
	resolveSourceDisplay,
	type SourceDisplayOverrides,
} from "@/workspace/source-display";

// Which spelling a format's text is written in (#397). One answer for every
// output of a format, so what its pane shows is what a download, a copy, or
// the clipboard holds: the resolved display of the pane showing the format's
// text view, or the global default while no pane shows it. Each view appears
// at most once in a workspace, so there is never a second pane to disagree.

function spellingOf(display: SourceDisplay): Spelling {
	return {
		lineBreakTags: display.lineBreakTags,
		booleanMarks: display.booleanMarks,
	};
}

function resolvedSpelling(overrides: SourceDisplayOverrides): Spelling {
	return spellingOf(
		resolveSourceDisplay(preferencesStore.getSnapshot(), overrides),
	);
}

// The spelling one pane writes in, read at the moment it is needed.
export function paneSpelling(paneId: string): Spelling {
	const pane = useTabeloStore
		.getState()
		.workspace.panes.find((candidate) => candidate.id === paneId);
	return resolvedSpelling(pane ?? INHERIT_SOURCE_DISPLAY);
}

// The pane showing a format's text view, if any.
function paneShowing(panes: readonly WorkspacePane[], codec: TableCodec) {
	return panes.find((candidate) => {
		const view = getView(candidate.view);
		return view.kind === "source" && view.codec === codec;
	});
}

// The spelling every output of a format writes in.
export function codecSpelling(codec: TableCodec): Spelling {
	const pane = paneShowing(useTabeloStore.getState().workspace.panes, codec);
	return resolvedSpelling(pane ?? INHERIT_SOURCE_DISPLAY);
}

// The same answer for something that renders from it, such as the rendered
// preview following the HTML spelling (#485): it changes as the default or
// that pane's override does.
export function useCodecSpelling(codec: TableCodec | undefined): Spelling {
	const preferences = usePreferences();
	const pane = useTabeloStore((state) =>
		codec ? paneShowing(state.workspace.panes, codec) : undefined,
	);
	if (!codec) return {};
	return spellingOf(
		resolveSourceDisplay(preferences, pane ?? INHERIT_SOURCE_DISPLAY),
	);
}
