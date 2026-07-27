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

export function pickTextFile(
	accept: string,
): Promise<{ name: string; text: string } | null> {
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
			resolve({ name: file.name, text: await file.text() });
		});
		// A cancelled picker fires no change event in most browsers, so the
		// promise simply never resolves — harmless, and the caller does nothing.
		input.click();
	});
}
