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
