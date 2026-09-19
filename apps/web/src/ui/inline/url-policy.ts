// What an authored URL may do when a cell is rendered (#306). The document
// keeps every URL exactly as written; this decides only whether the rendering
// activates or loads it, so an unsafe or unknown address stays visible and
// editable but inert. See docs/adr/0011.

function protocolOf(url: string): string | null {
	try {
		// No base: a relative address has no scheme of its own, and resolving it
		// against Tabelo's page would invent one the author never wrote.
		return new URL(url).protocol;
	} catch {
		return null;
	}
}

// How a link opens: a web page in a separate browsing context, an email
// address through the browser's normal mailto handling, or not at all.
export type LinkActivation = "web" | "mail" | "inert";

export function linkActivation(url: string): LinkActivation {
	switch (protocolOf(url)) {
		case "https:":
		case "http:":
			return "web";
		case "mailto:":
			return "mail";
		default:
			return "inert";
	}
}

// Only a secure remote image loads. `http:`, `data:`, `blob:`, `file:`,
// `javascript:`, and anything unknown render the alternative-text state.
export function imageLoads(url: string): boolean {
	return protocolOf(url) === "https:";
}

// Opens a link the way the rendered page would, for the surfaces where the
// link is not a native activation target: the grid, whose cells select on a
// click and open a link only on Mod+click, and the cell editor's Mod+Enter.
// Returns whether anything opened, so an inert address can say why not.
export function openLink(url: string): boolean {
	const activation = linkActivation(url);
	if (activation === "inert") return false;
	const anchor = document.createElement("a");
	anchor.href = url;
	if (activation === "web") {
		anchor.target = "_blank";
		anchor.rel = "noopener noreferrer";
	}
	anchor.click();
	return true;
}
