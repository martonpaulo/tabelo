import { createContext, useContext, useEffect, useState } from "react";

export const PaneEntryContext = createContext(false);

// Whether the pane has been entered, derived from where focus actually is
// rather than stored, so it can never disagree with the DOM.
//
// Entered means focus is in the pane's *content*. The header's own triggers are
// chrome and sit in the workspace ring beside the pane frame. Counting them as
// entry is what used to open every per-row and per-column control in the grid
// into that same ring the moment Tab reached "Change view", which is the defect
// the two-level model exists to remove. See docs/design-system.md §9.
export function usePaneEntry(ref: React.RefObject<HTMLElement | null>) {
	const [entered, setEntered] = useState(false);

	useEffect(() => {
		const node = ref.current;
		if (!node) return;

		const check = () => {
			requestAnimationFrame(() => {
				const body = node.querySelector('[data-slot="panel-body"]');
				const active = document.activeElement;
				setEntered(Boolean(body && active && body.contains(active)));
			});
		};

		check();
		node.addEventListener("focusin", check);
		node.addEventListener("focusout", check);
		return () => {
			node.removeEventListener("focusin", check);
			node.removeEventListener("focusout", check);
		};
	}, [ref]);

	return entered;
}

export function usePaneEntered() {
	return useContext(PaneEntryContext);
}
