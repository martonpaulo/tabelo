import { copy } from "@/copy/copy";

// Why a submenu is disabled as a whole, or `undefined` while it holds a row
// that can run (#497). A submenu whose every row is disabled would open onto
// nothing a keyboard can reach, because Base UI moves focus past disabled
// rows, so its trigger is disabled instead and says why. Every row refused
// for the same reason passes that reason up unchanged; rows refused for
// different reasons share one general sentence rather than a list of them.
// An empty submenu is not drawn at all, so it is not refused either.
export function submenuRefusal(
	rowReasons: readonly (string | undefined)[],
): string | undefined {
	const [first, ...rest] = rowReasons;
	if (first === undefined) return undefined;
	if (rest.some((reason) => reason === undefined)) return undefined;
	return rest.every((reason) => reason === first)
		? first
		: copy.disabled.submenuNothingApplies;
}
