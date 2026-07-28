import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// GitHub Pages serves this project from a subpath. The deploy workflow sets
// BASE_PATH; local dev and preview stay at the root.
const base = process.env.BASE_PATH ?? "/";

export default defineConfig({
	base,
	build: {
		rolldownOptions: {
			output: {
				codeSplitting: {
					groups: [
						{
							name: "codemirror-core",
							test: /node_modules[\\/]@codemirror[\\/](?:commands|language|state|view)[\\/]/,
						},
					],
				},
			},
		},
	},
	server: {
		port: 3001,
	},
	resolve: {
		tsconfigPaths: true,
	},
	plugins: [
		tailwindcss(),
		tanstackRouter({
			target: "react",
			autoCodeSplitting: true,
		}),
		react(),
		VitePWA({
			registerType: "prompt",
			manifest: {
				name: "Tabelo",
				short_name: "Tabelo",
				description:
					"Edit one table visually or as Markdown, CSV, TSV, HTML, and Jira — always in sync, entirely in your browser.",
				theme_color: "#0c0c0c",
				background_color: "#0c0c0c",
				start_url: base,
				scope: base,
			},
			pwaAssets: { disabled: false, config: true },
			devOptions: { enabled: true },
		}),
	],
});
