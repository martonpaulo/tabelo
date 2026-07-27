import { useRegisterSW } from "virtual:pwa-register/react";
import { useState } from "react";
import { activateUpdateAfterSave } from "@/pwa/update";
import { flushPersistence } from "@/state/store";

export interface PwaUpdate {
	readonly ready: boolean;
	readonly updating: boolean;
	readonly apply: () => void;
}

export function usePwaUpdate(): PwaUpdate {
	const {
		needRefresh: [ready],
		updateServiceWorker,
	} = useRegisterSW();
	const [updating, setUpdating] = useState(false);

	return {
		ready,
		updating,
		apply: () => {
			if (updating) return;
			setUpdating(true);
			void activateUpdateAfterSave(flushPersistence, () =>
				updateServiceWorker(true),
			)
				.then((activated) => {
					if (!activated) setUpdating(false);
				})
				.catch(() => setUpdating(false));
		},
	};
}
