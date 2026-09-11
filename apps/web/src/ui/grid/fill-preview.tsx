import { type RefObject, useEffect, useState } from "react";

export interface FillPreviewGeometry {
	readonly top: number;
	readonly left: number;
	readonly width: number;
	readonly height: number;
	readonly target: string;
}

export type FillPreviewSetter = (geometry: FillPreviewGeometry | null) => void;

// The cells a fill would add, drawn over the positioned grid wrapper. The
// preview is static at every motion preference: grid geometry never animates,
// and reduced motion therefore changes no capability or information.
export function FillPreview({
	setterRef,
}: {
	readonly setterRef: RefObject<FillPreviewSetter | null>;
}) {
	const [geometry, setGeometry] = useState<FillPreviewGeometry | null>(null);

	useEffect(() => {
		setterRef.current = setGeometry;
		return () => {
			setterRef.current = null;
		};
	}, [setterRef]);

	if (!geometry) return null;

	return (
		<div
			aria-hidden
			data-fill-preview={geometry.target}
			className="pointer-events-none absolute z-30 border-2 border-selection-edge border-dashed bg-selection-fill/50"
			// The geometry runs from the first cell's top-left corner to the last
			// cell's bottom-right grid line. Reaching one hairline further up and
			// left puts the preview's edges on the grid lines around the cells, the
			// same rule every cell mark follows (#365).
			style={{
				top: `calc(${geometry.top}rem - var(--hairline-w))`,
				left: `calc(${geometry.left}rem - var(--hairline-w))`,
				width: `calc(${geometry.width}rem + var(--hairline-w))`,
				height: `calc(${geometry.height}rem + var(--hairline-w))`,
			}}
		/>
	);
}
