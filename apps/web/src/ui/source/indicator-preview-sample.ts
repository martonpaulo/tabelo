import { documentFromMatrix } from "@/core/document";
import { samplePerson } from "@/core/sample-data";
import { tsvCodec } from "@/formats";
import { sourceEndRoom, sourceLineBox, sourceTopInset } from "./source-metrics";

// What the Settings preview shows, kept apart from the editor that draws it so
// the dialog can reserve the preview's box while that editor's code is still
// on its way (#422).

// A few synthetic TSV lines that exercise every setting the dialog switches:
// tabs between values, an empty field, a run of spaces inside a value, spaces
// left at the end of a line, and a value holding a line break, written the way
// the TSV codec writes one.
const first = samplePerson(0);
const second = samplePerson(1);
export const PREVIEW_TEXT = tsvCodec.serialize(
	documentFromMatrix(
		[
			["name", "city", "role"],
			[first.name, `${first.city}\n${second.city}`, `${first.role}  `],
			[second.name, "", `Lead  ${second.role}`],
		],
		{ headerRow: true },
	),
);

// Where the sample's rows sit, from the codec's own parse, which is what column
// alignment reads in a real pane.
const parsed = tsvCodec.parse(PREVIEW_TEXT);
export const PREVIEW_ROWS = parsed.ok ? (parsed.rows ?? null) : null;

// The height the editor takes for the sample with lines unwrapped, from the
// same terms its theme lays the text out with, so the box waiting for it and
// the editor that arrives in it are the same size. Wrapped lines on a narrow
// window can only add rows to that.
const lineCount = PREVIEW_TEXT.split("\n").length;
export const PREVIEW_MIN_HEIGHT = `calc(${lineCount} * ${sourceLineBox} + ${sourceTopInset} + ${sourceEndRoom})`;

// The box both the pending and the drawn preview sit in.
export const PREVIEW_FRAME_CLASS =
	"overflow-hidden rounded-interactive bg-surface-code";
