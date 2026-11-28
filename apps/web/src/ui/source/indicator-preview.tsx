import { EditorState } from "@codemirror/state";
import { EditorView, lineNumbers } from "@codemirror/view";
import { useEffect, useRef } from "react";
import { tsvCodec } from "@/formats";
import type { Preferences } from "@/preferences/contract";
import { showsAlignment } from "./column-alignment";
import { syntaxTheme } from "./editor-theme";
import {
	PREVIEW_FRAME_CLASS,
	PREVIEW_HEIGHT,
	PREVIEW_ROWS,
	PREVIEW_TEXT,
} from "./indicator-preview-sample";
import { indicatorExtensions, languageFor } from "./source-editor";
import { sourceRowsField } from "./source-rows";

// The settings preview is a real source editor, read-only, built from the same
// extensions every text view uses, so what it shows cannot drift from what the
// views draw.
export default function IndicatorPreview({
	preferences,
	label,
}: {
	readonly preferences: Preferences;
	readonly label: string;
}) {
	const hostRef = useRef<HTMLDivElement>(null);
	const {
		wrap,
		spaceIndicators,
		tabIndicators,
		emptyValueIndicators,
		lineBreakIndicators,
		alignColumns,
	} = preferences;

	useEffect(() => {
		const host = hostRef.current;
		if (!host) return;
		const view = new EditorView({
			parent: host,
			state: EditorState.create({
				doc: PREVIEW_TEXT,
				extensions: [
					syntaxTheme,
					lineNumbers(),
					sourceRowsField.init(() => PREVIEW_ROWS),
					languageFor("delimited"),
					wrap ? EditorView.lineWrapping : [],
					indicatorExtensions({
						spaces: spaceIndicators,
						tabs: tabIndicators,
						emptyValues: emptyValueIndicators,
						lineBreaks: lineBreakIndicators,
						align: showsAlignment(alignColumns, wrap),
						language: "delimited",
						codec: tsvCodec,
						lineBreakFields: tsvCodec.sourceFields,
					}),
					EditorState.readOnly.of(true),
					EditorView.editable.of(false),
					// A tab stop, so the lines that scroll inside the fixed box
					// can be scrolled from the keyboard too.
					EditorView.contentAttributes.of({
						"aria-label": label,
						tabindex: "0",
					}),
				],
			}),
		});
		return () => view.destroy();
	}, [
		wrap,
		spaceIndicators,
		tabIndicators,
		emptyValueIndicators,
		lineBreakIndicators,
		alignColumns,
		label,
	]);

	return (
		<div
			ref={hostRef}
			data-slot="indicator-preview"
			// The box keeps its height and the editor scrolls inside it, so
			// lines wrapped on a narrow window never move the settings under
			// it (decided on #559). The trailing padding keeps a line off the
			// box's edge.
			className={`pr-3 select-none [&_.cm-content]:select-none! [&_.cm-editor]:m-0 [&_.cm-editor]:h-full ${PREVIEW_FRAME_CLASS}`}
			style={{ height: PREVIEW_HEIGHT }}
		/>
	);
}
