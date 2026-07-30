import { useRegisterSW } from "virtual:pwa-register/react";
import { useState } from "react";
import { activateUpdateAfterSave } from "@/pwa/update";
import { flushPersistence, useTabeloStore } from "@/state/store";
import { copy } from "@/ui/copy";

export interface PwaUpdate {
	readonly ready: boolean;
	readonly updating: boolean;
	readonly apply: () => void;
}

function reportRegistrationFailure(): void {
	useTabeloStore.getState().pushNotice({
		severity: "error",
		message: copy.notices.updateCheckFailed,
	});
}

export function usePwaUpdate(): PwaUpdate {
	const {
		needRefresh: [ready],
		updateServiceWorker,
	} = useRegisterSW({ onRegisterError: reportRegistrationFailure });
	const [updating, setUpdating] = useState(false);

	return {
		ready,
		updating,
		apply: () => {
			if (updating) return;
			setUpdating(true);
			void activateUpdateAfterSave(flushPersistence, updateServiceWorker)
				.then((activated) => {
					if (!activated) setUpdating(false);
				})
				.catch(() => {
					setUpdating(false);
					useTabeloStore.getState().pushNotice({
						severity: "error",
						message: copy.notices.updateFailed,
					});
				});
		},
	};
}
