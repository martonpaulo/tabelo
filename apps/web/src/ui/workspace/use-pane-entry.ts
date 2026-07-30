import { createContext, useContext, useEffect, useState } from "react";

export const PaneEntryContext = createContext(false);

export function usePaneEntry(ref: React.RefObject<HTMLElement | null>) {
	const [entered, setEntered] = useState(false);

	useEffect(() => {
		const node = ref.current;
		if (!node) return;

		const check = () => {
			requestAnimationFrame(() => {
				const active = document.activeElement;
				if (!node) return;
				setEntered(node.contains(active) && active !== node);
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
