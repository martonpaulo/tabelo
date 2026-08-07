import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { product } from "./src/copy/product";
import { createProductMetadata } from "./src/product-metadata";
import { devServerPort, previewServerPort } from "./worktree-ports";

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
						// The route-level split the router plugin used to provide went
						// with the router, leaving every eager module in one chunk.
						// React changes on its own schedule and far less often than the
						// application, so it is the boundary worth keeping by hand.
						{
							name: "react",
							test: /node_modules[\\/](?:react-dom|react|scheduler)[\\/]/,
						},
					],
				},
			},
		},
	},
	// Both ports are derived per worktree. `strictPort` matters more than the
	// numbers: without it Vite silently steps to the next free port while the
	// preview configuration still points at the original one, so an agent
	// verifies its change against another worktree's app.
	server: {
		port: devServerPort,
		strictPort: true,
	},
	preview: {
		port: previewServerPort,
		strictPort: true,
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
			// A service worker in dev makes every agent verification session fight a
			// cache and pay forced reloads. Opt in with TABELO_PWA_DEV when the
			// service worker itself is what is being worked on; the built preview
			// that the browser suite uses always carries the real one.
			devOptions: { enabled: Boolean(process.env.TABELO_PWA_DEV) },
		}),
	],
});
