import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { precacheGlobPatterns } from "./pwa-precache";
import { product } from "./src/copy/product";
import { THEME_COLOR } from "./src/preferences/contract";
import {
	createProductMetadata,
	createStaticIntro,
} from "./src/product-metadata";
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

// GitHub Pages cannot send response headers, so the policy is a meta tag
// (#570). It allows exactly what the app loads: its own scripts, styles,
// fonts, manifest and service worker; `https:` and `data:` images in cells
// (docs/adr/0011); and the loopback WebSocket of the paired local agent,
// whose port is chosen per pairing. CodeMirror and the UI primitives write
// inline styles, hence `'unsafe-inline'` for styles only. A meta policy
// cannot refuse framing, and it is added to the build alone so the dev
// server's hot-reload socket keeps working.
const CONTENT_SECURITY_POLICY = [
	"default-src 'self'",
	"img-src 'self' https: data:",
	"connect-src 'self' ws://127.0.0.1:*",
	"style-src 'self' 'unsafe-inline'",
	"object-src 'none'",
	"base-uri 'none'",
].join("; ");
const CHARSET = '<meta charset="UTF-8" />';

// The part of the module graph `getModuleInfo` describes that the grouping
// below reads.
interface ModuleGraph {
	getModuleInfo(id: string): {
		readonly isEntry: boolean;
		readonly importers: readonly string[];
		readonly dynamicImporters: readonly string[];
		readonly importedIds: readonly string[];
	} | null;
}

// Every application module the first screen loads statically, in one chunk
// (#559). Left to itself the bundler gives each set of chunks that share a
// module a chunk of its own, so every lazily loaded dialog that reuses a piece
// of the first screen split that piece out into another small eager file: more
// requests on a slow connection and a worse compression ratio for the same
// bytes. Read from the graph rather than listed, so a module that only a lazy
// chunk reaches stays lazy.
function eagerApplicationChunk() {
	let eager: ReadonlySet<string> | null = null;
	const entryOf = (start: string, graph: ModuleGraph): string | null => {
		const seen = new Set([start]);
		const queue = [start];
		for (const id of queue) {
			const info = graph.getModuleInfo(id);
			if (!info) continue;
			if (info.isEntry) return id;
			for (const next of [...info.importers, ...info.dynamicImporters]) {
				if (seen.has(next)) continue;
				seen.add(next);
				queue.push(next);
			}
		}
		return null;
	};
	const staticallyReached = (entry: string, graph: ModuleGraph) => {
		const reached = new Set([entry]);
		const queue = [entry];
		for (const id of queue) {
			for (const next of graph.getModuleInfo(id)?.importedIds ?? []) {
				if (reached.has(next)) continue;
				reached.add(next);
				queue.push(next);
			}
		}
		return reached;
	};
	return (id: string, graph: ModuleGraph): string | null => {
		if (/[\\/]node_modules[\\/]/.test(id)) return null;
		if (!eager) {
			const entry = entryOf(id, graph);
			if (!entry) return null;
			eager = staticallyReached(entry, graph);
		}
		return eager.has(id) ? "app" : null;
	};
}

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
							test: /node_modules[\\/](?:zod|tailwind-merge|papaparse|@tabler[\\/]icons-react)[\\/]/,
						},
						{ name: eagerApplicationChunk() },
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
					.replace("__TABELO_STATIC_INTRO__", createStaticIntro())
					.replace("__TABELO_THEME_COLOR__", THEME_COLOR),
		},
		{
			name: "tabelo-content-security-policy",
			apply: "build",
			// The policy governs only what follows it, so it goes straight after
			// the charset, ahead of every script and stylesheet.
			transformIndexHtml: (html) => {
				if (!html.includes(CHARSET))
					throw new Error("index.html lost the charset the CSP follows");
				return html.replace(
					CHARSET,
					`${CHARSET}\n    <meta http-equiv="Content-Security-Policy" content="${CONTENT_SECURITY_POLICY}" />`,
				);
			},
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
			workbox: {
				globPatterns: precacheGlobPatterns,
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
