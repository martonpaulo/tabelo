import {
	defineConfig,
	minimal2023Preset,
} from "@vite-pwa/assets-generator/config";

const preset = {
	...minimal2023Preset,
	maskable: {
		...minimal2023Preset.maskable,
		resizeOptions: { background: "#0f6cbd" },
	},
	apple: {
		...minimal2023Preset.apple,
		resizeOptions: { background: "#0f6cbd" },
	},
};

export default defineConfig({
	headLinkOptions: {
		preset: "2023",
	},
	preset,
	images: ["public/logo-maskable.svg"],
});
