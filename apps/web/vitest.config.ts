import { defineConfig } from "vitest/config";

const propertyTestFiles = ["src/**/*.property.test.ts"];

// The suite covers the pure layers: document, operations, parsers,
// serializers, which need no DOM. Browser-level behaviour is verified by
// driving the real app, not by simulating one here.
export default defineConfig({
	resolve: {
		tsconfigPaths: true,
	},
	test: {
		environment: "node",
		// Node 25 turned its own Web Storage global on by default. Without a
		// storage file it leaves `localStorage` undefined, and that global
		// shadows happy-dom's, so every storage test fails with "Cannot read
		// properties of undefined" (#528). The flag is accepted from Node 22.4
		// on, so it is safe on the pinned version too.
		// https://nodejs.org/api/cli.html#--no-experimental-webstorage
		execArgv: ["--no-experimental-webstorage"],
		projects: [
			{
				extends: true,
				test: {
					name: "unit",
					// The root pattern covers the tooling modules beside this file,
					// which configure the dev server and browser suite rather than
					// ship in the bundle.
					include: ["src/**/*.test.ts", "*.test.ts"],
					exclude: propertyTestFiles,
				},
			},
			{
				extends: true,
				test: {
					name: "property",
					include: propertyTestFiles,
					// One hundred generated cases protect data-preservation contracts.
					// Loaded development machines have taken up to 7.747 seconds for
					// one property, so keep a finite budget without cutting coverage.
					testTimeout: 15_000,
				},
			},
		],
	},
});
