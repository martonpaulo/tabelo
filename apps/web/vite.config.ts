import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { product } from "./src/copy/product";
import { THEME_COLOR } from "./src/preferences/contract";
import { createProductMetadata } from "./src/product-metadata";
import { devServerPort, previewServerPort } from "./worktree-ports";

// GitHub Pages serves this project from the root of tabelo.martonpaulo.com.
// The deploy workflow still sets BASE_PATH (and SITE_ORIGIN) explicitly so a
// build for another location stays a one-variable change; local dev and
// preview stay at the root.
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
						// The same reasoning for the rest of what first paint loads from
						// node_modules. Without these two groups every deploy invalidated
						// one 544 kB chunk holding both the application and about 300 kB
						// of vendor code that changes far less often. Named explicitly
						// rather than matched as all of node_modules, because a catch-all
						// would pull the lazily loaded source-view dependencies into the
						// eager graph.
						{
							name: "base-ui",
							test: /node_modules[\\/](?:@base-ui|@floating-ui)[\\/]/,
						},
						{
							name: "vendor",
							test: /node_modules[\\/](?:zod|tailwind-merge|papaparse|lucide-react)[\\/]/,
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
					.replace("__TABELO_PRODUCT_METADATA__", productMetadata)
					.replace("__TABELO_THEME_COLOR__", THEME_COLOR),
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
				// The installed application and its splash wear the only palette
				// the product has. Both of these previously carried light values.
				theme_color: THEME_COLOR,
				background_color: THEME_COLOR,
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
