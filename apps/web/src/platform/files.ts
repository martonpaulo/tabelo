// Browser side effects kept behind one boundary so components stay declarative
// and the rest of the app never touches the DOM directly. The clipboard is the
// one effect the user can refuse, so it has its own boundary in ./clipboard.

export function downloadText(
	filename: string,
	mimeType: string,
	contents: string,
): void {
	const blob = new Blob([contents], { type: `${mimeType};charset=utf-8` });
	const url = URL.createObjectURL(blob);
	const anchor = window.document.createElement("a");
	anchor.href = url;
	anchor.download = filename;
	anchor.click();
	// Revoking immediately can cancel the download in some browsers; one frame
	// is enough for the click to have been handled.
	requestAnimationFrame(() => URL.revokeObjectURL(url));
}

const MAX_FILENAME_STEM_LENGTH = 120;

export function tableFilenameStem(tableName: string): string {
	const ascii = [...tableName.normalize("NFKD").replace(/\p{M}+/gu, "")]
		.filter((character) => character.charCodeAt(0) <= 0x7f)
		.join("");
	const stem = ascii
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, MAX_FILENAME_STEM_LENGTH)
		.replace(/-+$/g, "");
	return stem || "untitled-table";
}

export function tableDownloadFilename(
	tableName: string,
	extension: string,
): string {
	return `${tableFilenameStem(tableName)}.${extension}`;
}

export type PickTextFileResult =
	| {
			readonly status: "selected";
			readonly name: string;
			readonly text: string;
	  }
	| {
			readonly status: "too-large";
			readonly name: string;
			readonly size: number;
	  }
	| {
			readonly status: "not-utf8";
			readonly name: string;
	  };

// Tabelo reads text files as UTF-8 only. `Blob.text()` decodes with
// replacement, so a file in a legacy code page would import with U+FFFD where
// its accented letters were, and an export would write the loss out (#547).
// A fatal decoder refuses those bytes instead. Like `Blob.text()`, it drops a
// leading byte order mark.
function decodeUtf8(bytes: ArrayBuffer): string | null {
	try {
		return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
	} catch (error) {
		if (error instanceof TypeError) return null;
		throw error;
	}
}

export function pickTextFile(
	accept: string,
	maximumBytes: number,
): Promise<PickTextFileResult | null> {
	return new Promise((resolve) => {
		const input = window.document.createElement("input");
		input.type = "file";
		input.accept = accept;
		input.addEventListener("change", async () => {
			const file = input.files?.[0];
			if (!file) {
				resolve(null);
				return;
			}
			if (file.size > maximumBytes) {
				resolve({ status: "too-large", name: file.name, size: file.size });
				return;
			}
			const text = decodeUtf8(await file.arrayBuffer());
			resolve(
				text === null
					? { status: "not-utf8", name: file.name }
					: { status: "selected", name: file.name, text },
			);
		});
		// A cancelled picker fires no change event in most browsers, so the
		// promise simply never resolves: harmless, and the caller does nothing.
		input.click();
	});
}
