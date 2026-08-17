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
			style={{
				top: `${geometry.top}rem`,
				left: `${geometry.left}rem`,
				width: `${geometry.width}rem`,
				height: `${geometry.height}rem`,
			}}
		/>
	);
}
