import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { product } from "./src/copy/product";
import { createProductMetadata } from "./src/product-metadata";

// GitHub Pages serves this project from a subpath. The deploy workflow sets
// BASE_PATH; local dev and preview stay at the root.
const base = process.env.BASE_PATH ?? "/";
const productMetadata = createProductMetadata({
	basePath: base,
	siteOrigin: process.env.SITE_ORIGIN,
});

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
		{
			name: "tabelo-product-copy",
			transformIndexHtml: (html) =>
				html
					.replaceAll("__TABELO_DOCUMENT_TITLE__", product.documentTitle)
					.replaceAll("__TABELO_DESCRIPTION__", product.description)
					.replace("__TABELO_PRODUCT_METADATA__", productMetadata),
		},
		tailwindcss(),
		tanstackRouter({
			target: "react",
			autoCodeSplitting: true,
		}),
		react(),
		VitePWA({
			// The React virtual module owns registration so update availability can
			// be shown in the existing FAB without a second service-worker register.
			injectRegister: "auto",
			registerType: "prompt",
			manifest: {
				name: product.name,
				short_name: product.name,
				description: product.description,
				theme_color: "#0f6cbd",
				background_color: "#f0f0f0",
				start_url: base,
				scope: base,
			},
			pwaAssets: {
				disabled: false,
				config: true,
				injectThemeColor: false,
			},
			devOptions: { enabled: true },
		}),
	],
});
