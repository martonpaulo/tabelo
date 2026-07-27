import { Toaster } from "@tabelo/ui/components/sonner";
import {
	createRootRouteWithContext,
	HeadContent,
	Outlet,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import "@/index.css";

export type RouterAppContext = Record<string, never>;

export const Route = createRootRouteWithContext<RouterAppContext>()({
	component: RootComponent,
	head: () => ({
		meta: [
			{ title: "Tabelo" },
			{
				name: "description",
				content:
					"Edit a table visually, as Markdown, or as CSV — always in sync. Runs entirely in your browser.",
			},
		],
		links: [
			{
				rel: "icon",
				// Base-relative: GitHub Pages serves this app from a subpath.
				href: `${import.meta.env.BASE_URL}favicon.ico`,
			},
		],
	}),
});

function RootComponent() {
	return (
		<>
			<HeadContent />
			<div className="h-full">
				<Outlet />
			</div>
			<Toaster richColors />
			<TanStackRouterDevtools position="bottom-left" />
		</>
	);
}
