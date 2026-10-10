import { EditorState } from "@codemirror/state";
import { EditorView, lineNumbers } from "@codemirror/view";
import { useEffect, useRef } from "react";
import { tsvCodec } from "@/formats";
import type { Preferences } from "@/preferences/contract";
import { showsAlignment } from "./column-alignment";
import { syntaxTheme } from "./editor-theme";
import {
	PREVIEW_FRAME_CLASS,
	PREVIEW_MIN_HEIGHT,
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
						fieldSeparator: tsvCodec.fieldSeparator,
						lineBreakFields: tsvCodec.sourceFields,
					}),
					EditorState.readOnly.of(true),
					EditorView.editable.of(false),
					EditorView.contentAttributes.of({ "aria-label": label }),
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
			// The trailing padding keeps a clipped line off the box's edge on a
			// narrow window: the preview never scrolls, so text that does not
			// fit stops short of the edge instead of touching it.
			className={`[&_.cm-content]:select-none! pointer-events-none select-none pr-3 [&_.cm-editor]:m-0 [&_.cm-editor]:h-auto ${PREVIEW_FRAME_CLASS}`}
			style={{ minHeight: PREVIEW_MIN_HEIGHT }}
		/>
	);
}
