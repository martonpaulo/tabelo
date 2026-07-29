import type { FlushOutcome } from "@/state/store";

export async function activateUpdateAfterSave(
	save: () => FlushOutcome,
	activate: () => Promise<void>,
): Promise<boolean> {
	if (save().status !== "saved") return false;
	await activate();
	return true;
}
