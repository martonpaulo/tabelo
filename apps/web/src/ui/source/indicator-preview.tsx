import { EditorState } from "@codemirror/state";
import { EditorView, lineNumbers } from "@codemirror/view";
import { useEffect, useRef } from "react";
import { documentFromMatrix } from "@/core/document";
import { samplePerson } from "@/core/sample-data";
import { tsvCodec } from "@/formats";
import type { Preferences } from "@/preferences/contract";
import { syntaxTheme } from "./editor-theme";
import { indicatorExtensions, languageFor } from "./source-editor";

// A few synthetic TSV lines that exercise every setting the dialog switches:
// tabs between values, an empty field, a run of spaces inside a value, spaces
// left at the end of a line, and a value holding a line break, written the way
// the TSV codec writes one.
const first = samplePerson(0);
const second = samplePerson(1);
const PREVIEW_TEXT = tsvCodec.serialize(
	documentFromMatrix(
		[
			["name", "city", "role"],
			[first.name, `${first.city}\n${second.city}`, `${first.role}  `],
			[second.name, "", `Lead  ${second.role}`],
		],
		{ headerRow: true },
	),
);

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
					languageFor("delimited"),
					wrap ? EditorView.lineWrapping : [],
					indicatorExtensions({
						spaces: spaceIndicators,
						tabs: tabIndicators,
						emptyValues: emptyValueIndicators,
						lineBreaks: lineBreakIndicators,
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
		label,
	]);

	return (
		<div
			ref={hostRef}
			data-slot="indicator-preview"
			// The trailing padding keeps a clipped line off the box's edge on a
			// narrow window: the preview never scrolls, so text that does not
			// fit stops short of the edge instead of touching it.
			className="[&_.cm-content]:select-none! pointer-events-none select-none overflow-hidden rounded-interactive bg-surface-code pr-3 [&_.cm-editor]:m-0 [&_.cm-editor]:h-auto"
		/>
	);
}
