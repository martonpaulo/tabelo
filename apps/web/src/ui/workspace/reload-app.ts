import { copy } from "@/copy/copy";
import { flushPersistence, useTabeloStore } from "@/state/store";

// Loads the page again, the one way to fetch a view's code again once the
// browser has kept its failed request (#419). The session is written first,
// table and unfinished edits alike, and a write that does not succeed stops the
// reload: the page is the only copy left, and the user hears why it stayed.
// The same rule guards the update reload (`pwa/update.ts`).
export function reloadAppAfterSave(): void {
	if (flushPersistence().status !== "saved") {
		useTabeloStore.getState().pushNotice({
			severity: "error",
			message: copy.notices.reloadBlocked,
		});
		return;
	}
	window.location.reload();
}
