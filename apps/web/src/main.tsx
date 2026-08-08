import ReactDOM from "react-dom/client";
import "@/index.css";
import { startThemeRuntime } from "@/preferences/theme";
import { TabeloApp } from "@/ui/tabelo-app";

// GitHub Pages has no SPA rewrite rule, so the deploy workflow serves
// index.html as 404.html. That gets a deep link here, but leaves the deep path
// in the address bar. BASE_URL is the canonical path the build was made for,
// and replaceState normalizes to it without leaving the deep path behind in
// the session history.
const canonicalPath = import.meta.env.BASE_URL;

if (window.location.pathname !== canonicalPath) {
	window.history.replaceState(
		null,
		"",
		`${canonicalPath}${window.location.search}${window.location.hash}`,
	);
}

startThemeRuntime();

const rootElement = document.getElementById("app");

if (!rootElement) {
	throw new Error("Root element not found");
}

if (!rootElement.innerHTML) {
	const root = ReactDOM.createRoot(rootElement);
	root.render(
		<div className="h-full">
			<TabeloApp />
		</div>,
	);
}
