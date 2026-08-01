import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@tabelo/ui/components/dialog";
import { useEffect, useId, useState } from "react";
import { copy } from "@/copy/copy";
import { useTabeloStore } from "@/state/store";
import {
	DialogActions,
	DialogCancel,
	DialogConfirm,
} from "@/ui/primitives/dialog-buttons";
import {
	SingleSelectionList,
	SingleSelectionOption,
	singleSelectionDialogContentStyles,
} from "@/ui/primitives/single-selection-list";
import { type LayoutId, layoutPresets } from "@/workspace/layout";
import { LayoutGlyph } from "./layout-glyph";

export function LayoutDialog({
	open,
	onOpenChange,
}: {
	readonly open: boolean;
	readonly onOpenChange: (open: boolean) => void;
}) {
	const layout = useTabeloStore((state) => state.workspace.layout);
	const [selected, setSelected] = useState<LayoutId>(layout);
	const titleId = useId();
	const hintId = useId();

	useEffect(() => {
		if (open) setSelected(layout);
	}, [layout, open]);

	const apply = () => {
		if (selected === layout) return;
		useTabeloStore.getState().setLayout(selected);
		onOpenChange(false);
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				showCloseButton={false}
				aria-labelledby={titleId}
				aria-describedby={hintId}
				className={singleSelectionDialogContentStyles}
			>
				<DialogHeader>
					<DialogTitle id={titleId}>{copy.workspace.layout}</DialogTitle>
					<DialogDescription id={hintId} className="text-sm">
						{copy.workspace.layoutHint}
					</DialogDescription>
				</DialogHeader>

				<SingleSelectionList
					aria-label={copy.workspace.layout}
					value={selected}
					onValueChange={(value) => setSelected(value as LayoutId)}
				>
					{layoutPresets.map((preset) => (
						<SingleSelectionOption
							key={preset.id}
							value={preset.id}
							selected={selected === preset.id}
							icon={<LayoutGlyph preset={preset} />}
							{...copy.layouts[preset.id]}
						/>
					))}
				</SingleSelectionList>

				<DialogActions>
					<DialogCancel>{copy.actions.cancel}</DialogCancel>
					<DialogConfirm
						disabledReason={
							selected === layout
								? copy.disabled.layoutAlreadyApplied
								: undefined
						}
						onClick={apply}
					>
						{copy.workspace.applyLayout}
					</DialogConfirm>
				</DialogActions>
			</DialogContent>
		</Dialog>
	);
}
