import { listCodecs } from "@/formats";
import { pickTextFile } from "@/platform/files";
import { useTabeloStore } from "@/state/store";

// File import lives here rather than in a component so the header and the
// empty state can both offer it without one passing a callback to the other.
// The accepted extensions come from the codec registry, so a newly registered
// format is importable with no edit here.

const ACCEPT = [
	...listCodecs().map((codec) => `.${codec.extension}`),
	".txt",
	"text/plain",
].join(",");

export async function importTableFile(): Promise<void> {
	const file = await pickTextFile(ACCEPT);
	if (!file) return;

	// The extension picks the codec; anything unrecognised falls through to
	// sniffing inside importText.
	const match = listCodecs().find((codec) =>
		file.name.toLowerCase().endsWith(`.${codec.extension}`),
	);
	useTabeloStore.getState().importText(file.text, match?.id);
}
