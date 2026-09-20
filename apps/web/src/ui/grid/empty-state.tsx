import { Button } from "@tabelo/ui/components/button";
import {
	optionBlockStateStyles,
	optionBlockStyles,
} from "@tabelo/ui/components/menu-styles";
import { controlStateTransitionStyles } from "@tabelo/ui/components/motion-styles";
import { floatingSurfaceStyles } from "@tabelo/ui/components/surface-styles";
import { modShortcut } from "@tabelo/ui/lib/platform";
import { cn } from "@tabelo/ui/lib/utils";
import {
	IconArrowLeft,
	IconClipboard,
	IconExternalLink,
	IconFileUpload,
	IconPlus,
	type TablerIcon,
} from "@tabler/icons-react";
import { useEffect, useLayoutEffect, useRef } from "react";
import { copy } from "@/copy/copy";
import { product } from "@/copy/product";
import { DEFAULT_COLUMN_COUNT } from "@/core/document";
import { listCodecs } from "@/formats";
import { pasteFromClipboard } from "@/ui/clipboard-actions";
import { importTableFile } from "@/ui/import-actions";
import { SelectionOptionContent } from "@/ui/primitives/selection-option";

// The file endings the import accepts, from the codec registry rather than a
// list written here (docs/adr/0005). `jira.txt` and `records.txt` both end in
// `.txt`, so the last segment is what a reader recognises, once.
const importExtensions = [
	...new Set(
		listCodecs().map((codec) => codec.extension.split(".").at(-1) ?? ""),
	),
];

// The first-visit choice is one product-owned surface over the normal workspace.
// The workspace remains visible enough to explain where the table will appear,
// but is inert until the user chooses how to begin. Each way in is one large
// option with a line saying what it takes, the empty table first and filled,
// because it is the one that always works.
export function EmptyState({
	suspended,
	onStartEmpty,
	onCancel,
	onStarted,
}: {
	// True while a question the surface's own import raised is open over it:
	// the card stays on screen, inert, and its shortcut waits for the answer.
	readonly suspended: boolean;
	readonly onStartEmpty: () => void;
	// Absent unless this surface was opened by creating a table, which is the
	// only case that has somewhere to go back to.
	readonly onCancel?: () => void;
	readonly onStarted: () => void;
}) {
	const sectionRef = useRef<HTMLElement>(null);

	// The surface takes focus so a screen reader starts on it and Enter starts
	// the empty table. It is a container, not a control, so it draws no focus
	// ring: the ring belongs to the options, the first of which is one Tab away.
	useLayoutEffect(() => {
		sectionRef.current?.focus();
	}, []);

	const startImport = () => {
		void importTableFile().then((started) => {
			if (started) onStarted();
		});
	};

	// Mod+O is the platform's "open a file", and on this surface opening a file
	// is one of the three ways in, so the shortcut the option shows works from
	// anywhere while the surface is up. Paste needs no handler here: the app
	// already turns a trusted paste event into an import while it is open.
	useEffect(() => {
		if (suspended) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (
				(event.metaKey || event.ctrlKey) &&
				!event.altKey &&
				!event.shiftKey &&
				event.key.toLowerCase() === "o"
			) {
				event.preventDefault();
				startImport();
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	});

	return (
		<div
			inert={suspended || undefined}
			className="absolute inset-0 z-40 flex items-center justify-center bg-surface-app/60 p-4 supports-backdrop-filter:backdrop-blur-sm"
		>
			<section
				ref={sectionRef}
				aria-labelledby="empty-state-title"
				tabIndex={-1}
				data-focus-container
				// Enter on the surface itself starts the empty table, the option the
				// surface marks as primary. Enter on a focused option is that
				// option's own activation and is left alone.
				onKeyDown={(event) => {
					if (event.key === "Enter" && event.target === event.currentTarget) {
						event.preventDefault();
						onStartEmpty();
						return;
					}
					// Escape is the way out of a surface that was opened on purpose
					// and can be left: it does what the back control does (owner,
					// 2026-09-20). With nothing to go back to there is nothing for
					// it to do, because this surface is the app's own empty state.
					if (event.key === "Escape" && onCancel) {
						event.preventDefault();
						event.stopPropagation();
						onCancel();
					}
				}}
				className={cn(
					"w-[min(26rem,calc(100vw-2rem))] rounded-surface p-6 text-popover-foreground outline-none",
					floatingSurfaceStyles,
				)}
			>
				{onCancel ? (
					// Adding a table beside the others: a step with a way back,
					// titled by what it does rather than by the product, and
					// without the introduction or the credits, which belong to the
					// first sight of Tabelo (owner, 2026-09-20).
					<div className="flex items-center gap-2">
						<Button
							variant="ghost"
							size="icon-sm"
							aria-label={copy.empty.backFromNewTable}
							onClick={onCancel}
						>
							<IconArrowLeft aria-hidden />
						</Button>
						<h2 id="empty-state-title" className="font-semibold text-lg">
							{copy.empty.newTableTitle}
						</h2>
					</div>
				) : (
					<h2
						id="empty-state-title"
						className="flex items-center gap-2 font-semibold text-xl"
					>
						{/* The product's own mark, as the app menu shows it (owner,
					    2026-09-19), rather than a generic table icon. */}
						<img
							aria-hidden
							alt=""
							src={`${import.meta.env.BASE_URL}logo.svg`}
							className="size-6"
						/>
						{copy.empty.title}
					</h2>
				)}
				{onCancel ? null : (
					<p className="mt-2 text-muted-foreground text-sm leading-relaxed">
						{copy.empty.intro}
					</p>
				)}
				<div className="mt-6 flex flex-col gap-2">
					<Option
						primary
						icon={IconPlus}
						label={copy.empty.emptyAction}
						detail={copy.empty.emptyDetail(DEFAULT_COLUMN_COUNT)}
						shortcut={{ keys: "Enter", shown: "Enter" }}
						onClick={onStartEmpty}
					/>
					<Option
						icon={IconClipboard}
						label={copy.empty.pasteAction}
						detail={copy.empty.pasteDetail}
						shortcut={{ keys: "Meta+V Control+V", shown: modShortcut("V") }}
						onClick={() => {
							void pasteFromClipboard().then((started) => {
								if (started) onStarted();
							});
						}}
					/>
					<Option
						icon={IconFileUpload}
						label={copy.actions.importFile}
						detail={copy.empty.importDetail(importExtensions)}
						shortcut={{ keys: "Meta+O Control+O", shown: modShortcut("O") }}
						onClick={startImport}
					/>
				</div>
				{/* Each link is at least 1.5rem tall, the WCAG 2.5.8 target
				    minimum, through vertical padding rather than larger text, so
				    the two lines sit flush with no gap between them (owner,
				    2026-09-19). */}
				<div
					hidden={Boolean(onCancel)}
					className="mt-6 flex flex-col items-center text-muted-foreground text-xs"
				>
					<p>
						{copy.empty.credit}{" "}
						<ExternalLinkText href={product.author.url}>
							{product.author.name}
						</ExternalLinkText>
					</p>
					<p>
						<ExternalLinkText href={product.repositoryUrl}>
							{copy.empty.source}
						</ExternalLinkText>
					</p>
				</div>
			</section>
		</div>
	);
}

// A link that leaves Tabelo says so before it is followed: the arrow is the
// visible cue, and the accessible name says it opens in a new tab.
function ExternalLinkText({
	href,
	children,
}: {
	readonly href: string;
	readonly children: string;
}) {
	return (
		<a
			href={href}
			target="_blank"
			rel="noreferrer"
			className="inline-flex items-center gap-1 py-1 underline-offset-2 transition-colors hover:text-foreground hover:underline"
		>
			{children}
			<IconExternalLink aria-hidden className="size-3" />
			<span className="sr-only">{copy.a11y.opensInNewTab}</span>
		</a>
	);
}

function Option({
	primary = false,
	icon: Icon,
	label,
	detail,
	shortcut,
	onClick,
}: {
	readonly primary?: boolean;
	readonly icon: TablerIcon;
	readonly label: string;
	readonly detail: string;
	// `keys` is the ARIA spelling for assistive technology; `shown` is the
	// platform's own spelling, drawn as the option's trailing hint.
	readonly shortcut?: { readonly keys: string; readonly shown: string };
	readonly onClick: () => void;
}) {
	return (
		<button
			type="button"
			aria-keyshortcuts={shortcut?.keys}
			data-variant={primary ? "default" : "ghost"}
			data-emphasis={primary ? "primary" : undefined}
			onClick={onClick}
			className={cn(
				optionBlockStyles,
				controlStateTransitionStyles,
				optionBlockStateStyles,
			)}
		>
			<SelectionOptionContent
				icon={<Icon />}
				label={label}
				description={detail}
				metadata={shortcut?.shown}
			/>
		</button>
	);
}
