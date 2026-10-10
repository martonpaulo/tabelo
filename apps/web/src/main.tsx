import { ShortcutKeyLabelsProvider } from "@tabelo/ui/components/shortcut-keys";
import ReactDOM from "react-dom/client";
import "@/index.css";
import { copy } from "@/copy/copy";
import {
	prepareTabeloApp,
	RestoringWorkspace,
	TabeloApp,
} from "@/ui/tabelo-app";

// GitHub Pages has no SPA rewrite rule, so the deploy workflow serves
// index.html as 404.html. That gets a deep link here, but leaves the deep path
// in the address bar. BASE_URL is the canonical path the build was made for
// (`/` both in production at tabelo.martonpaulo.com and locally), and
// replaceState normalizes to it without leaving the deep path behind in the
// session history.
const canonicalPath = import.meta.env.BASE_URL;

if (window.location.pathname !== canonicalPath) {
	window.history.replaceState(
		null,
		"",
		`${canonicalPath}${window.location.search}${window.location.hash}`,
	);
}

const rootElement = document.getElementById("app");

if (!rootElement) {
	throw new Error("Root element not found");
}

// The shell ships a static introduction inside the root for readers without
// JavaScript (#362), so an empty root no longer means "not mounted yet". The
// marker keeps a second evaluation of this module from mounting twice; the
// first render replaces the static content.
if (rootElement.dataset.mounted !== "true") {
	rootElement.dataset.mounted = "true";
	const root = ReactDOM.createRoot(rootElement);
	const app = (
		<ShortcutKeyLabelsProvider labels={copy.keys}>
			<div className="h-full">
				<TabeloApp />
			</div>
		</ShortcutKeyLabelsProvider>
	);
	const preparing = prepareTabeloApp();
	if (preparing) {
		// A saved workspace waits for the code of its views. The page says so
		// meanwhile rather than staying blank (#420), and the app replaces the
		// status whether the code arrived or not: a view that could not load
		// shows its own failure inside its pane.
		root.render(<RestoringWorkspace />);
		void preparing.then(() => root.render(app));
	} else {
		root.render(app);
	}
}
