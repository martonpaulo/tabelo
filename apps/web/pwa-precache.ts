// Workbox's default set plus what the application shell renders on every
// start: the Latin Figtree face, so the installed app keeps its type offline,
// and the mark, which the welcome state and the app-menu trigger draw. Other
// scripts fall back to the platform face, which the font stack already names.
// The manifest icons stay out: the shell never renders them.
export const precacheGlobPatterns = [
	"**/*.{js,wasm,css,html}",
	"**/figtree-latin-wght-*.woff2",
	"logo.svg",
];

// The not-found copy of the shell is what Pages answers a deep link with; the
// installed app always starts from index.html, so caching it would only double
// the shell's bytes.
export const precacheGlobIgnores = ["404.html"];
