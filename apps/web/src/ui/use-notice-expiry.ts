import { useEffect, useRef, useSyncExternalStore } from "react";
import { useTabeloStore } from "@/state/store";

// When an expiring notice actually counts down (#450). Which notices expire,
// and after how long, stays with `autoDismissDelay`; this decides only when
// the clock runs. A notice the user is reading or reaching for must not vanish
// under them, so the countdown stops while the pointer rests on the notice,
// while focus is inside it, and while the page itself is out of sight or the
// window is not the one in use. When attention leaves, it continues with the
// time it had left. See docs/design-system/4-interaction-states.md.

function subscribeAttention(onChange: () => void): () => void {
	window.addEventListener("focus", onChange);
	window.addEventListener("blur", onChange);
	document.addEventListener("visibilitychange", onChange);
	return () => {
		window.removeEventListener("focus", onChange);
		window.removeEventListener("blur", onChange);
		document.removeEventListener("visibilitychange", onChange);
	};
}

function pageAttended(): boolean {
	return document.visibilityState === "visible" && document.hasFocus();
}

export function useNoticeExpiry(
	id: string,
	delay: number | null,
	engaged: boolean,
): void {
	const attended = useSyncExternalStore(subscribeAttention, pageAttended);
	const running = delay !== null && !engaged && attended;
	// The time still owed to the current delay. A changed delay starts over,
	// as when an Undo offer is withdrawn and a plain confirmation remains.
	const budget = useRef<{ delay: number; left: number } | null>(null);

	useEffect(() => {
		if (delay === null) {
			budget.current = null;
			return;
		}
		if (budget.current?.delay !== delay) {
			budget.current = { delay, left: delay };
		}
		if (!running) return;
		const owed = budget.current;
		const started = performance.now();
		const timer = setTimeout(
			() => useTabeloStore.getState().dismissNotice(id),
			owed.left,
		);
		return () => {
			clearTimeout(timer);
			owed.left = Math.max(0, owed.left - (performance.now() - started));
		};
	}, [id, delay, running]);
}
