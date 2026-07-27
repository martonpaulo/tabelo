import { createRouter, RouterProvider } from "@tanstack/react-router";
import ReactDOM from "react-dom/client";
import { migrateLegacyThemePreference } from "@/theme/system-theme";

import Loader from "./components/loader";
import { routeTree } from "./routeTree.gen";

migrateLegacyThemePreference(window);

const router = createRouter({
	routeTree,
	basepath: import.meta.env.BASE_URL,
	defaultPreload: "intent",
	scrollRestoration: true,
	defaultPendingComponent: () => <Loader />,
	context: {},
});

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}

const rootElement = document.getElementById("app");

if (!rootElement) {
	throw new Error("Root element not found");
}

if (!rootElement.innerHTML) {
	const root = ReactDOM.createRoot(rootElement);
	root.render(<RouterProvider router={router} />);
}
