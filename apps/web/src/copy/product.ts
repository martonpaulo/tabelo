// Product identity is build-time and runtime copy. Keeping it framework-free
// lets the HTML shell, manifest, and interface share one owner.
const author = {
	name: "Marton Paulo",
	url: "https://martonpaulo.com",
} as const;

export const product = {
	name: "Tabelo",
	tagline: "Edit one table in every view, always in sync",
	author,
	copyright: `© 2026 ${author.name}`,
	repositoryUrl: "https://github.com/martonpaulo/tabelo",
	creditLabel: "Made by",
	sourceLabel: "View source on GitHub",
	// The shared title pattern of the owner's sites (#373): ` · ` between parts,
	// the product first on its home page, and no owner name on a product site.
	// After the name comes the search phrase people type (#377).
	documentTitle: "Tabelo · Table editor for Markdown, CSV, JSON and more",
	// No closing period: the static intro appends its own sentence end.
	description:
		"Edit one table as a visual grid or as Markdown, CSV, TSV, HTML, Jira, JSON or Records, every view kept in sync, entirely in your browser",
	socialCardAlt:
		"Tabelo on a denim card: the Markdown and Table panes of one workspace showing the same table of cities, kept in sync.",
	openGraphType: "website",
	twitterCard: "summary_large_image",
} as const;

export const DEFAULT_TABLE_NAME = "Untitled table";
export function tableDocumentTitle(tableName: string): string {
	return `${tableName} · ${product.name}`;
}
