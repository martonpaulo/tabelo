import type { Extension } from "@codemirror/state";
import { EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";

// Chrome drawn outside a source editor's scroller that has to move sideways
// with its text: the column markers (#368) and the pinned header's copy
// (#252). Scrolling runs on the compositor, so anything a scroll listener
// repositions lands a frame after the text has moved, and both trailed the
// text on every step of a horizontal scroll. Each is instead translated by a
// scroll-driven animation over the editor's own scroller: the browser moves it
// by exactly the scroll offset, in the same frame, with no script.
//
// The editor names its scroller's inline-axis timeline and scopes the name to
// itself, so elements outside the scroller can follow it. Only its own
// scroller declares it: the pinned header's copy is an editor nested inside
// this one, and a second scroller with the name would make the timeline
// ambiguous, which leaves it inactive.
// https://developer.mozilla.org/docs/Web/CSS/timeline-scope
//
// A timeline reports progress, not distance, so the scroll range is measured
// and written to `--tabelo-scroll-range-x`, where the `tabelo-follow-scroll-x`
// keyframes read it. The range changes only with the geometry, never while
// scrolling.
const timelineTheme = EditorView.theme({
	"&": { timelineScope: "--tabelo-source-x" },
	"& > .cm-scroller": { scrollTimeline: "--tabelo-source-x x" },
});

// The declarations an element needs to follow the editor's horizontal scroll.
export const followScrollXStyle = {
	animation: "tabelo-follow-scroll-x linear both",
	animationTimeline: "--tabelo-source-x",
} as const;

const scrollRange = ViewPlugin.fromClass(
	class {
		constructor(private readonly view: EditorView) {
			this.schedule();
		}

		update(update: ViewUpdate) {
			if (update.geometryChanged || update.docChanged) this.schedule();
		}

		private schedule() {
			this.view.requestMeasure({
				key: this,
				read: (view) => view.scrollDOM.scrollWidth - view.scrollDOM.clientWidth,
				// A pixel value straight from the editor's measurement, applied and
				// never stored as presentation state.
				write: (range, view) => {
					view.dom.style.setProperty("--tabelo-scroll-range-x", `${range}px`);
				},
			});
		}
	},
);

// Installed once per source editor, never in the pinned header's copy.
export const followScrollX: Extension = [timelineTheme, scrollRange];
