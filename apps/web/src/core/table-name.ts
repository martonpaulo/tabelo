// The table name's rule: trimmed, never blank, and at most this many code
// points. A domain rule rather than copy, so persistence can validate a stored
// name without depending on the product's wording.
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
