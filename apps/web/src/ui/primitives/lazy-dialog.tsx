import { type ComponentType, lazy, Suspense, useEffect } from "react";
import { copy } from "@/copy/copy";
import { useTabeloStore } from "@/state/store";

interface DialogProps {
	readonly open: boolean;
	readonly onOpenChange: (open: boolean) => void;
}

// A dialog the first screen never draws, kept out of the first download
// (#559): on a slow phone every eager byte delays the first text. It is
// rendered from the first frame like any other dialog, closed, so its code is
// requested as the app starts and has normally arrived long before anyone
// opens it; the offline precache holds it like every other chunk.
//
// The same shape as the lazily loaded settings preview: a chunk that never
// arrives resolves to a stand-in rather than an error, because the browser
// keeps a failed chunk request for the life of the page (#419). The stand-in
// says so when the dialog is asked for, and reports it closed, so the command
// that opened it is free again.
export function lazyDialog<Props extends DialogProps>(
	load: () => Promise<ComponentType<Props>>,
): ComponentType<Props> {
	// The stand-in reads only the two props every dialog has.
	const unavailable: ComponentType<Props> = DialogUnavailable;
	const Loaded = lazy(() =>
		load().then(
			(component) => ({ default: component }),
			() => ({ default: unavailable }),
		),
	);
	return function LazyDialog(props: Props) {
		return (
			<Suspense fallback={null}>
				<Loaded {...props} />
			</Suspense>
		);
	};
}

function DialogUnavailable({ open, onOpenChange }: DialogProps) {
	useEffect(() => {
		if (!open) return;
		useTabeloStore.getState().pushNotice({
			severity: "warning",
			message: copy.status.dialogUnavailable,
		});
		onOpenChange(false);
	}, [open, onOpenChange]);
	return null;
}
