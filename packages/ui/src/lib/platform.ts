// Which keyboard legend the user's platform uses. Apple platforms name the
// modifiers with glyphs; everywhere else they are words, so a Windows or Linux
// user never sees ⌃ standing in for a Ctrl key they have never seen drawn that
// way.
//
// `navigator.platform` is deprecated but remains the only synchronous signal
// present in every browser this product runs in: `userAgentData` is
// Chromium-only, and the alternative is a user-agent string that lies more
// often than this does.
// https://developer.mozilla.org/en-US/docs/Web/API/Navigator/platform
export function isApplePlatform(): boolean {
	if (typeof navigator === "undefined") return false;
	return /(Mac|iPhone|iPad|iPod)/.test(navigator.platform);
}

// The primary shortcut modifier, written the way the platform writes it. Apple
// keyboards join it to the key with nothing between them, "⌘C"; the others use
// a plus, "Ctrl+C".
export function modShortcut(key: string): string {
	return isApplePlatform() ? `⌘${key}` : `Ctrl+${key}`;
}
