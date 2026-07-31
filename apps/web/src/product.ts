// Product identity is build-time and runtime copy. Keeping it framework-free
// lets the HTML shell, manifest, and interface share one owner.
export const product = {
	name: "Tabelo",
	tagline: "Edit one table in every view, always in sync.",
	documentTitle: "Tabelo: Edit one table in every view",
	description:
		"Edit one table visually or through synchronized text formats, entirely in your browser.",
	openGraphType: "website",
	twitterCard: "summary",
} as const;
