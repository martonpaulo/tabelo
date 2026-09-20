// A pane id is any non-empty string the stored workspace carries, and four
// places look one up with `querySelector`, where a quote or a bracket in the
// id would end the attribute early or throw. The pane's own anchor name
// escapes for the same reason; this is the selector half of that rule.
export function paneSelector(paneId: string, within = ""): string {
	return `[data-pane-id="${CSS.escape(paneId)}"]${within ? ` ${within}` : ""}`;
}
