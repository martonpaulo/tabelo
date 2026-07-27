// Browser side effects kept behind one boundary so components stay declarative
// and the rest of the app never touches the DOM or the clipboard directly.

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

export async function writeClipboardText(text: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		return false;
	}
}

export async function writeClipboardTable(
	text: string,
	html: string,
): Promise<boolean> {
	// The rich flavour is what lets a paste into a spreadsheet keep its cells.
	try {
		await navigator.clipboard.write([
			new ClipboardItem({
				"text/plain": new Blob([text], { type: "text/plain" }),
				"text/html": new Blob([html], { type: "text/html" }),
			}),
		]);
		return true;
	} catch {
		return writeClipboardText(text);
	}
}

export async function readClipboardTable(): Promise<{
	text: string;
	html?: string;
} | null> {
	// Reading needs a permission the user may decline, and Firefox does not
	// implement read() at all. Either way the keyboard paste path still works,
	// because that one arrives as a trusted paste event instead.
	try {
		const items = await navigator.clipboard.read();
		let text = "";
		let html: string | undefined;
		for (const item of items) {
			if (item.types.includes("text/html")) {
				html = await (await item.getType("text/html")).text();
			}
			if (item.types.includes("text/plain")) {
				text = await (await item.getType("text/plain")).text();
			}
		}
		return { text, html };
	} catch {
		try {
			return { text: await navigator.clipboard.readText() };
		} catch {
			return null;
		}
	}
}
