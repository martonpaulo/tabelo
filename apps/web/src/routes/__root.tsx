import {
	createRootRouteWithContext,
	HeadContent,
	Outlet,
} from "@tanstack/react-router";
import "@/index.css";

export type RouterAppContext = Record<string, never>;

export const Route = createRootRouteWithContext<RouterAppContext>()({
	component: RootComponent,
	head: () => ({
		links: [
			{
				rel: "icon",
				type: "image/svg+xml",
				href: `${import.meta.env.BASE_URL}logo.svg`,
			},
			{
				rel: "icon",
				sizes: "any",
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
		</>
	);
}
