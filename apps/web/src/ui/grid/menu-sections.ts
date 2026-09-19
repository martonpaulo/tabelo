// The visual sections a menu draws from its action groups. Every ordinary
// group is a section of its own, set apart by a separator. Adjacent groups
// that each fold into a submenu share one section instead: each is already
// named by its own trigger, so a separator between one-item groups only
// lengthened the menu and made three related directions read as three
// unrelated commands (owner, 2026-09-19).
export function menuSections<Group extends { readonly submenu?: unknown }>(
	groups: readonly Group[],
): readonly (readonly Group[])[] {
	const sections: Group[][] = [];
	for (const group of groups) {
		const previous = sections.at(-1);
		if (group.submenu && previous?.[0]?.submenu) previous.push(group);
		else sections.push([group]);
	}
	return sections;
}
