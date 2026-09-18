import { EditorState } from "@codemirror/state";
import { EditorView, lineNumbers } from "@codemirror/view";
import { useEffect, useRef } from "react";
import { samplePerson } from "@/core/sample-data";
import type { Preferences } from "@/preferences/contract";
import { syntaxTheme } from "./editor-theme";
import { indicatorExtensions, languageFor } from "./source-editor";

// A few synthetic TSV lines that exercise every indicator the settings switch:
// tabs between values, an empty field, a run of spaces inside a value, and
// spaces left at the end of a line.
const first = samplePerson(0);
const second = samplePerson(1);
const PREVIEW_TEXT = [
	["name", "city", "role"].join("\t"),
	[first.name, first.city, `${first.role}  `].join("\t"),
	[second.name, "", `Lead  ${second.role}`].join("\t"),
].join("\n");

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
	const { spaceIndicators, tabIndicators, emptyValueIndicators } = preferences;

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
					indicatorExtensions(
						spaceIndicators,
						tabIndicators,
						emptyValueIndicators,
						"delimited",
						"\t",
					),
					EditorState.readOnly.of(true),
					EditorView.editable.of(false),
					EditorView.contentAttributes.of({ "aria-label": label }),
				],
			}),
		});
		return () => view.destroy();
	}, [spaceIndicators, tabIndicators, emptyValueIndicators, label]);

	return (
		<div
			ref={hostRef}
			data-slot="indicator-preview"
			className="overflow-hidden rounded-interactive border border-line-subtle"
		/>
	);
}
