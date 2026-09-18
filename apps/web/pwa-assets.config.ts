import {
	defineConfig,
	minimal2023Preset,
} from "@vite-pwa/assets-generator/config";

// One source for every derivative: the mark the floating trigger shows. Ordinary
// icons keep its transparent exterior; the maskable and Apple outputs, whose
// platforms composite transparency onto a colour of their own choosing, sit on
// the product's own dark surface instead.
const preset = {
	...minimal2023Preset,
	maskable: {
		...minimal2023Preset.maskable,
		resizeOptions: { background: "#1c1c1b" },
	},
	apple: {
		...minimal2023Preset.apple,
		resizeOptions: { background: "#1c1c1b" },
	},
};

export default defineConfig({
	headLinkOptions: {
		preset: "2023",
	},
	preset,
	images: ["public/logo.svg"],
});
