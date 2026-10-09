import { Checkbox } from "@tabelo/ui/components/checkbox";

// A boolean cell drawn as a checkbox that toggles in place (#483). The cell
// keeps the grid's one roving tab stop, so the checkbox is never focusable on
// its own: `Space` on the focused cell reaches the grid's keyboard handler,
// and a click toggles without opening the editor. The value it shows is the
// carried boolean; nothing here reads text.
export function BooleanCellCheckbox({
	checked,
	label,
	onToggle,
}: {
	readonly checked: boolean;
	// Names the cell this checkbox stands in, since its own state says only
	// checked or not checked.
	readonly label: string;
	readonly onToggle: (next: boolean) => void;
}) {
	return (
		<Checkbox
			data-boolean-cell=""
			tabIndex={-1}
			aria-label={label}
			checked={checked}
			onCheckedChange={(next) => onToggle(next)}
			// Inline so the column's text alignment places it like a value, and
			// centred on the first line box, where a one-line value would sit.
			className="inline-flex align-middle"
			// Two clicks toggle twice and leave the value as it was; they never
			// also open the cell editor behind the checkbox.
			onDoubleClick={(event) => event.stopPropagation()}
		/>
	);
}
