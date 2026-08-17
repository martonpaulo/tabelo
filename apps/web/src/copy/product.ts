// Product identity is build-time and runtime copy. Keeping it framework-free
// lets the HTML shell, manifest, and interface share one owner.
export const product = {
	name: "Tabelo",
	tagline: "Edit one table in every view, always in sync",
	copyright: "© 2026 Marton Paulo",
	documentTitle: "Tabelo: Edit one table in every view",
	description:
		"Edit one table visually or through synchronized text formats, entirely in your browser",
	openGraphType: "website",
	twitterCard: "summary",
} as const;

export const DEFAULT_TABLE_NAME = "Untitled table";
export const MAX_TABLE_NAME_CODE_POINTS = 120;

export type TableNameValidation =
	| { readonly ok: true; readonly name: string }
	| { readonly ok: false; readonly reason: "empty" | "too-long" };

export function validateTableName(value: string): TableNameValidation {
	const name = value.trim();
	if (name === "") return { ok: false, reason: "empty" };
	if ([...name].length > MAX_TABLE_NAME_CODE_POINTS) {
		return { ok: false, reason: "too-long" };
	}
	return { ok: true, name };
}

export function tableDocumentTitle(tableName: string): string {
	return `${tableName} · ${product.name}`;
}
