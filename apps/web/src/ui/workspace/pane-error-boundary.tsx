import { Button } from "@tabelo/ui/components/button";
import { IconRefresh, IconReplace } from "@tabler/icons-react";
import {
	Component,
	createContext,
	type ErrorInfo,
	type ReactNode,
	useContext,
	useEffect,
	useRef,
} from "react";
import { copy } from "@/copy/copy";
import { AvailabilityStatus } from "@/ui/primitives/selection-option";
import { usePaneEntered } from "./use-pane-entry";

// One view failing must never take the app down with it. React unmounts the
// whole root on an error no boundary catches, which turned a single view's
// exception into a blank page. Each pane catches its own: the pane shows why
// it stopped and how to recover, while the other panes, the document, the
// pending draft, and autosave keep working, because none of them lives in the
// view that failed.
//
// React only sees what throws while it renders or commits. A view that runs
// work of its own outside React, as CodeMirror does in its plugins, listeners,
// and idle parsing, reports the failure through `usePaneFailure` instead, and
// the pane shows the same state.

type ReportFailure = (error: unknown) => void;

// Outside a pane there is nothing to replace, so the failure is left for the
// console rather than swallowed.
const PaneFailureContext = createContext<ReportFailure>((error) => {
	console.error(error);
});

export function usePaneFailure(): ReportFailure {
	return useContext(PaneFailureContext);
}

interface PaneErrorBoundaryProps {
	// The view the pane shows. A different view is a fresh start, so changing
	// it clears the failure.
	readonly viewId: string;
	readonly onChangeView: (opener: HTMLButtonElement | null) => void;
	readonly children: ReactNode;
}

interface PaneErrorBoundaryState {
	readonly failed: boolean;
	// Bumped by Reload view, so the view mounts again from nothing rather than
	// resuming whatever state it failed in.
	readonly generation: number;
}

export class PaneErrorBoundary extends Component<
	PaneErrorBoundaryProps,
	PaneErrorBoundaryState
> {
	override state: PaneErrorBoundaryState = { failed: false, generation: 0 };

	static getDerivedStateFromError(): Partial<PaneErrorBoundaryState> {
		return { failed: true };
	}

	override componentDidCatch(error: unknown, info: ErrorInfo) {
		console.error(error, info.componentStack);
	}

	override componentDidUpdate(previous: PaneErrorBoundaryProps) {
		if (previous.viewId !== this.props.viewId && this.state.failed) {
			this.setState(({ generation }) => ({
				failed: false,
				generation: generation + 1,
			}));
		}
	}

	// Stable for the boundary's lifetime, so a view can hold it in a ref.
	private readonly report: ReportFailure = (error) => {
		console.error(error);
		if (!this.state.failed) this.setState({ failed: true });
	};

	private readonly reload = () => {
		this.setState(({ generation }) => ({
			failed: false,
			generation: generation + 1,
		}));
	};

	override render() {
		if (this.state.failed) {
			return (
				<PaneFailure
					onReload={this.reload}
					onChangeView={this.props.onChangeView}
				/>
			);
		}
		return (
			<PaneFailureContext.Provider value={this.report}>
				<ViewGeneration key={this.state.generation}>
					{this.props.children}
				</ViewGeneration>
			</PaneFailureContext.Provider>
		);
	}
}

function ViewGeneration({ children }: { readonly children: ReactNode }) {
	return children;
}

// The blocked pane's anatomy (docs/design-system/4-interaction-states.md): the
// alert and Unavailable status, the reason, and the commands that recover.
function PaneFailure({
	onReload,
	onChangeView,
}: {
	readonly onReload: () => void;
	readonly onChangeView: (opener: HTMLButtonElement | null) => void;
}) {
	const reload = useRef<HTMLButtonElement>(null);
	// A failure inside a view the user was working in removes the element that
	// had focus, and the browser drops it to the page. The keyboard user lands
	// on the first recovery command instead of nowhere. Entry is still the
	// value from before the failure here, because the pane derives it a frame
	// late; a view that failed while nobody was in it takes nothing.
	const entered = usePaneEntered();
	const wasEntered = useRef(entered);
	useEffect(() => {
		const active = document.activeElement;
		if (wasEntered.current && (!active || active === document.body)) {
			reload.current?.focus();
		}
	}, []);
	return (
		<div
			role="status"
			aria-label={copy.a11y.failedView}
			data-pane-failure=""
			className="flex h-full min-h-0 flex-1 flex-col items-center justify-center gap-3 overflow-y-auto p-4 text-center text-sm"
		>
			<AvailabilityStatus kind="unavailable" />
			<p className="max-w-md select-text text-pretty text-muted-foreground">
				{copy.workspace.viewFailed}
			</p>
			<div className="flex flex-wrap items-center justify-center gap-2">
				<Button
					ref={reload}
					variant="secondary"
					size="xs"
					className="bg-accent"
					data-pane-entry=""
					onClick={onReload}
				>
					<IconRefresh aria-hidden />
					{copy.workspace.reloadView}
				</Button>
				<Button
					variant="secondary"
					size="xs"
					className="bg-accent"
					onClick={(event) => onChangeView(event.currentTarget)}
				>
					<IconReplace aria-hidden />
					{copy.workspace.changeView}
				</Button>
			</div>
		</div>
	);
}
