// The one order every table context menu lists its commands in: the Visual
// Table's cell, row, and column menus and every source view's text, line
// number, and letter menus alike (owner, 2026-09-19). A menu builds its groups
// in whatever order is convenient and this list sorts them, so the order is
// written once rather than kept in step across two renderers. A menu omits
// what it cannot support; what it keeps sits where this list says.
//
// What comes before these groups is the menu's own subject, drawn by the menu
// itself: the Format and Cell type choices of a cell, the settings of a column.
// Delete is always last.
const menuOrder = {
	clipboard: ["cut", "copy", "paste"],
	history: ["undo", "redo"],
	select: ["select-all", "select-row", "select-column", "select-next-match"],
	insert: [
		"insert-row-above",
		"insert-row-below",
		"insert-column-left",
		"insert-column-right",
	],
	edit: ["duplicate", "clear"],
	// The four submenus, in this order, share one section (menu-sections.ts).
	move: ["move-up", "move-down", "move-left", "move-right"],
	sort: ["sort-ascending", "sort-descending"],
	fill: ["fill-up", "fill-down", "fill-left", "fill-right"],
	focus: ["focus-up", "focus-down", "focus-left", "focus-right"],
	remove: ["delete-rows", "delete-columns"],
} as const;

export type MenuGroupId = keyof typeof menuOrder;
export type MenuCommandId = (typeof menuOrder)[MenuGroupId][number];

const groupRank = new Map<string, number>(
	Object.keys(menuOrder).map((id, index) => [id, index]),
);
const commandRank = new Map<string, number>(
	Object.values(menuOrder).flatMap((ids) =>
		ids.map((id, index) => [id, index] as const),
	),
);

interface OrderedGroup {
	readonly id: MenuGroupId;
	readonly actions: readonly { readonly id: MenuCommandId }[];
}

// The groups in the canonical order, each group's commands in theirs, and the
// groups left empty by what a menu cannot support dropped.
export function orderMenuGroups<Group extends OrderedGroup>(
	groups: readonly Group[],
): Group[] {
	const rank = (map: Map<string, number>, id: string) => map.get(id) ?? 0;
	return groups
		.filter((group) => group.actions.length > 0)
		.map((group) => ({
			...group,
			actions: [...group.actions].sort(
				(a, b) => rank(commandRank, a.id) - rank(commandRank, b.id),
			),
		}))
		.sort((a, b) => rank(groupRank, a.id) - rank(groupRank, b.id));
}
