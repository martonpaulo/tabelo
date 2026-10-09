import { listCodecs } from "@/formats";
import { IMPORT_LIMITS } from "@/import/prepare";
import { pickTextFile } from "@/platform/files";
import { useTabeloStore } from "@/state/store";
import {
	captureCommandTarget,
	commandDocumentUnchanged,
} from "@/ui/command-target";

// File import lives here rather than in a component so the header and the
// empty state can both offer it without one passing a callback to the other.
// The accepted extensions come from the codec registry, so a newly registered
// format is importable with no edit here.

const ACCEPT = [
	...listCodecs().map((codec) => `.${codec.extension}`),
	".txt",
	"text/plain",
].join(",");

// The import replaces the table that was open when the user chose to import.
// Picking and reading the file are asynchronous, so a table opened or edited
// in the meantime is never the one replaced (#409); the selection does not
// matter, because an import replaces the whole document.
export async function importTableFile(): Promise<boolean> {
	const target = captureCommandTarget();
	const file = await pickTextFile(ACCEPT, IMPORT_LIMITS.payloadBytes);
	if (!file || !commandDocumentUnchanged(target)) return false;
	if (file.status === "too-large") {
		useTabeloStore.getState().reportInputError({
			code: "payload-too-large",
			actual: file.size,
			limit: IMPORT_LIMITS.payloadBytes,
		});
		return false;
	}

	// The extension picks the codec; anything unrecognised falls through to
	// sniffing inside importText.
	const match = listCodecs().find((codec) =>
		file.name.toLowerCase().endsWith(`.${codec.extension}`),
	);
	const before = useTabeloStore.getState().document;
	useTabeloStore.getState().importText(file.text, match?.id);
	return useTabeloStore.getState().document !== before;
}
