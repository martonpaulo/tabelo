import { expect, type Locator, type Page } from "@playwright/test";
import { copy } from "@/copy/copy";
import { HEADER_ROW } from "@/core/selection";
import { STORAGE_KEY } from "@/persistence/schema";
import type { NoticeSeverity } from "@/state/notice-queue";
import { getView } from "@/views/registry";
import type { ViewId } from "@/views/types";
import {
	FILL_ORDER,
	type LayoutId,
	layoutsForPaneCount,
	paneCount,
} from "@/workspace/layout";

type AppCommand = "undo" | "redo" | "newTable" | "downloadTable";
type PaneCommand =
	| "closeView"
	| "zoomOut"
	| "resetZoom"
	| "zoomIn"
	| "copySource"
	| "copyFormattedTable";

const appCommandLabels: Record<AppCommand, string> = {
	undo: copy.actions.undo,
	redo: copy.actions.redo,
	newTable: copy.actions.newTable,
	downloadTable: copy.actions.downloadTable,
};

const paneCommandLabels: Record<PaneCommand, string> = {
	closeView: copy.workspace.closeView,
	zoomOut: copy.workspace.zoomOut,
	resetZoom: copy.workspace.resetZoom,
	zoomIn: copy.workspace.zoomIn,
	copySource: copy.actions.copySource,
	copyFormattedTable: copy.actions.copyFormattedTable,
};

function requirePositiveIndex(value: number, name: string): void {
	if (!Number.isInteger(value) || value < 1) {
		throw new Error(`${name} must be a positive integer.`);
	}
}

// Playwright cannot deny the clipboard permission, so the browser boundary
// itself is replaced. This is what the page sees when the user declines, when
// the context is restricted, or when the half of the API being called is
// absent. Serialized into the page, so it closes over nothing.
export type ClipboardFault = "blocked" | "absent" | "empty";

function installClipboard(mode: ClipboardFault | "granted"): void {
	const refuse = () => {
		const error = new Error("denied");
		error.name = "NotAllowedError";
		return Promise.reject(error);
	};
	const silent = {
		read: () => Promise.resolve([]),
		readText: () => Promise.resolve(""),
		write: () => Promise.resolve(),
		writeText: () => Promise.resolve(),
	};
	const value =
		mode === "absent"
			? undefined
			: mode === "blocked"
				? {
						read: refuse,
						readText: refuse,
						write: refuse,
						writeText: refuse,
					}
				: silent;
	Object.defineProperty(navigator, "clipboard", { value, configurable: true });
}

// Installed before the next navigation. The app reads navigator.clipboard at
// call time, so the live variant below can also change the answer mid-test.
export async function faultyClipboard(
	page: Page,
	fault: ClipboardFault,
): Promise<void> {
	await page.addInitScript(installClipboard, fault);
}

export async function setClipboard(
	page: Page,
	mode: ClipboardFault | "granted",
): Promise<void> {
	await page.evaluate(installClipboard, mode);
}

export interface CopiedFlavours {
	readonly text: string;
	readonly html?: string;
}

// A clipboard that accepts everything and remembers it, so the copied bytes can
// be asserted without the permission plumbing Playwright cannot grant in every
// browser. Serialized into the page, so it closes over nothing.
export async function recordingClipboard(page: Page): Promise<void> {
	await page.addInitScript(() => {
		Object.defineProperty(window, "__copied", {
			value: [] as { text: string; html?: string }[],
			configurable: true,
			writable: true,
		});

		Object.defineProperty(window, "ClipboardItem", {
			value: class {
				types: string[];
				data: Record<string, Blob>;
				constructor(data: Record<string, Blob>) {
					this.data = data;
					this.types = Object.keys(data);
				}
				async getType(type: string) {
					return this.data[type];
				}
			},
			configurable: true,
		});

		Object.defineProperty(navigator, "clipboard", {
			value: {
				writeText: async (text: string) => {
					(
						window as unknown as { __copied: { text: string; html?: string }[] }
					).__copied.push({ text });
				},
				write: async (
					items: Array<{
						types: string[];
						getType: (type: string) => Promise<{ text: () => Promise<string> }>;
					}>,
				) => {
					const item = items[0];
					if (!item) throw new Error("Clipboard write requires an item.");
					let text = "";
					let html: string | undefined;
					if (item.types.includes("text/plain")) {
						text = await (await item.getType("text/plain")).text();
					}
					if (item.types.includes("text/html")) {
						html = await (await item.getType("text/html")).text();
					}
					(
						window as unknown as { __copied: { text: string; html?: string }[] }
					).__copied.push({ text, html });
				},
			},
			configurable: true,
		});
	});
}

export function lastCopied(page: Page): Promise<CopiedFlavours | undefined> {
	return page.evaluate(() =>
		(
			window as unknown as { __copied: { text: string; html?: string }[] }
		).__copied.at(-1),
	);
}

// The rendered text of a source pane, decorations excluded. Every marker a
// source view draws is generated content or a widget rather than a text node,
// so what the DOM reports here is the source and nothing else.
export function renderedSource(pane: Locator): Promise<string> {
	return pane.evaluate((element) =>
		Array.from(
			element.querySelectorAll(".cm-line"),
			(line) => line.textContent ?? "",
		).join("\n"),
	);
}

// The document as it is actually stored, which is the only text that settles
// whether a decoration reached it.
export function storedDocument(page: Page): Promise<string> {
	return page.evaluate((key) => {
		const saved = JSON.parse(localStorage.getItem(key) ?? "null");
		return JSON.stringify(saved?.document ?? null);
	}, STORAGE_KEY);
}

export class TabeloPage {
	readonly workspace: Locator;
	readonly notices: Locator;
	// The two permanent announcement regions. They exist whether or not there
	// is anything to say, which is the contract they are here to prove.
	readonly announcements: Locator;
	readonly alerts: Locator;

	constructor(readonly page: Page) {
		this.workspace = page.getByRole("main", { name: copy.a11y.workspace });
		this.notices = page.getByRole("region", { name: copy.a11y.notices });
		this.announcements = page.locator("#global-announcements");
		this.alerts = page.locator("#global-alerts");
	}

	// One notice bar, addressed by what its message means rather than by the
	// colour that meaning is drawn in.
	notice(severity?: NoticeSeverity): Locator {
		return this.notices.locator(
			severity ? `[data-severity="${severity}"]` : "[data-severity]",
		);
	}

	async open(): Promise<void> {
		// Playwright gives every test a fresh BrowserContext, so storage is already
		// isolated. A clear-and-reload cycle duplicated that guarantee and risked
		// aborting the second navigation while the PWA finished registering.
		await this.page.goto("/");
		await this.dismissWelcome();
		await this.workspace.waitFor({ state: "visible" });
	}

	async dismissWelcome(): Promise<void> {
		// Every test enters through here, so a slow mount is charged to all of them
		// at once. The welcome surface appears only after the route chunk arrives
		// and hydration confirms the document is blank; waiting for the surface
		// itself keeps that latency out of the click's own retry budget, and turns
		// a stalled first paint into "the welcome surface never appeared" instead
		// of a click that spends the full timeout on a subtree React is still
		// replacing.
		const welcome = this.page.getByRole("region", { name: copy.empty.title });
		await welcome.waitFor({ state: "visible" });
		await welcome.getByRole("button", { name: copy.empty.emptyAction }).click();
	}

	pane(view: ViewId): Locator {
		return this.page.getByRole("region", {
			name: copy.a11y.pane(getView(view).label),
		});
	}

	paneAt(view: ViewId, index: number): Locator {
		return this.pane(view).nth(index);
	}

	grid(): Locator {
		return this.pane("grid").getByRole("grid", {
			name: copy.a11y.grid,
		});
	}

	// Cells and headers are addressed by position rather than by accessible
	// name: their names are now their contents, which is the point: a cell is
	// named after its value, not after its coordinates.
	//
	// The header cell holds editable text only. It is addressed as a cell,
	// because for selection purposes it is one: its row is the header sentinel.
	header(column: number): Locator {
		requirePositiveIndex(column, "column");
		return this.grid().locator(`[data-cell="${HEADER_ROW}:${column - 1}"]`);
	}

	// One cell of the column index strip, which owns the column's letter, its
	// select handle, and its menu.
	columnIndex(column: number): Locator {
		requirePositiveIndex(column, "column");
		return this.grid().locator(`[data-column-header="${column - 1}"]`);
	}

	// The row's own gutter cell, which owns the row number, its select handle,
	// and its menu. Numbered as the gutter itself shows it: row 1 is the header
	// row, row 2 is the first data row.
	rowIndex(row: number): Locator {
		requirePositiveIndex(row, "row");
		const dataRowHeader = row === 1 ? HEADER_ROW : row - 2;
		return this.grid().locator(`[data-row-header="${dataRowHeader}"]`);
	}

	cell(row: number, column: number): Locator {
		requirePositiveIndex(row, "row");
		requirePositiveIndex(column, "column");
		return this.grid().locator(`[data-cell="${row - 1}:${column - 1}"]`);
	}

	source(view: ViewId): Locator {
		const label = getView(view).label;
		return this.pane(view).getByRole("textbox", {
			name: copy.a11y.sourceEditor(label),
		});
	}

	sourceAt(view: ViewId, index: number): Locator {
		return this.paneAt(view, index).getByRole("textbox");
	}

	// Every pane currently on screen, in reading order.
	panes(): Locator {
		return this.workspace.getByRole("region");
	}

	// Reaching a preset the way a user reaches it. Layout only rearranges the
	// panes that are open, so the pane count is reached first through Add view
	// and Close view, and the dialog then picks the arrangement, only where the
	// count offers more than one. Shrinking assumes no pane owns unsaved text,
	// which is true of the setup this runs in.
	async goToPaneCount(count: number): Promise<void> {
		while ((await this.panes().count()) < count) {
			// The global command, which splits the first pane that can be split in
			// workspace reading order. The pane-edge control says which edge it
			// means, which a helper reaching a pane count has no opinion about.
			const menu = await this.openAppMenu();
			await menu
				.getByRole("menuitem", { name: copy.workspace.addView })
				.click();
			await menu.waitFor({ state: "hidden" });
			const dialog = this.page.getByRole("dialog", {
				name: copy.addView.title,
			});
			await dialog.waitFor({ state: "visible" });
			for (const view of FILL_ORDER) {
				const option = dialog.getByRole("radio", {
					name: getView(view).label,
				});
				if (!(await option.isEnabled())) continue;
				await option.click();
				break;
			}
			await dialog
				.getByRole("button", { name: copy.addView.confirm, exact: true })
				.click();
			await dialog.waitFor({ state: "hidden" });
		}
		while ((await this.panes().count()) > count) {
			const panes = this.panes();
			await panes
				.nth((await panes.count()) - 1)
				.getByRole("button", {
					name: new RegExp(`^${copy.workspace.paneActions}: `),
				})
				.click();
			await this.page
				.getByRole("menuitem", { name: copy.workspace.closeView, exact: true })
				.click();
		}
	}

	// Layout presets, pane views, and column alignments are radio items: they
	// are current states rather than one-off actions.
	async chooseLayout(id: LayoutId): Promise<void> {
		await this.goToPaneCount(paneCount(id));
		// One pane and four panes tile the grid one way each, so the command is
		// disabled there and the pane count alone settles the layout.
		if (layoutsForPaneCount(paneCount(id)).length < 2) return;

		const dialog = await this.openLayoutDialog();
		await dialog.getByRole("radio", { name: copy.layouts[id].label }).click();
		const apply = dialog.getByRole("button", {
			name: copy.workspace.applyLayout,
		});
		if (await apply.isEnabled()) await apply.click();
		else
			await dialog.getByRole("button", { name: copy.actions.cancel }).click();
		await dialog.waitFor({ state: "hidden" });
	}

	async openAppMenu(): Promise<Locator> {
		const menu = this.page.getByRole("menu", {
			name: copy.actions.openAppMenu,
		});
		await menu.waitFor({ state: "hidden" });
		await this.page
			.getByRole("button", { name: copy.actions.openAppMenu })
			.click();
		await menu.waitFor({ state: "visible" });
		return menu;
	}

	// The submenu is its own menu once open, so it is addressed by its own
	// accessible name rather than through the parent it hangs off.
	async openCopyAsSubmenu(): Promise<Locator> {
		const parent = await this.openAppMenu();
		const submenu = this.page.getByRole("menu", {
			name: copy.actions.copyAs,
		});
		await parent
			.getByRole("menuitem", { name: copy.actions.copyAs })
			.first()
			.click();
		await submenu.waitFor({ state: "visible" });
		return submenu;
	}

	async copyAs(view: ViewId): Promise<void> {
		const submenu = await this.openCopyAsSubmenu();
		await submenu
			.getByRole("menuitem", { name: getView(view).label, exact: true })
			.click();
	}

	async openLayoutDialog(): Promise<Locator> {
		const menu = await this.openAppMenu();
		await this.page
			.getByRole("menuitem", { name: copy.workspace.layout })
			.click();
		await menu.waitFor({ state: "hidden" });
		const dialog = this.page.getByRole("dialog", {
			name: copy.workspace.layout,
		});
		await dialog.waitFor({ state: "visible" });
		return dialog;
	}

	async runAppCommand(command: AppCommand): Promise<void> {
		const menu = await this.openAppMenu();
		await menu
			.getByRole("menuitem", { name: appCommandLabels[command] })
			.click();
	}

	// Every split control currently on screen. The count is the contract at the
	// ends of the range: one pane offers two, since it can be cut either way,
	// and four panes offer none.
	addControls(): Locator {
		return this.workspace.locator("[data-split-control]");
	}

	// Where a pane sits in the 2x2 slot grid, read as grid line numbers rather
	// than pixels: the arrangement is the assertion, not the geometry.
	async paneArea(view: ViewId): Promise<{
		rowStart: number;
		rowEnd: number;
		columnStart: number;
		columnEnd: number;
	}> {
		const area = await this.pane(view).evaluate(
			(node) => window.getComputedStyle(node).gridArea,
		);
		const [rowStart, columnStart, rowEnd, columnEnd] = area
			.split("/")
			.map((part) => Number(part.trim()));
		if (
			rowStart === undefined ||
			rowEnd === undefined ||
			columnStart === undefined ||
			columnEnd === undefined
		) {
			throw new Error("Pane grid area must contain four line numbers.");
		}
		return { rowStart, rowEnd, columnStart, columnEnd };
	}

	// The control on a pane's splittable edge. Named after the pane and the
	// direction, because that pair is the whole content of the choice.
	splitControl(view: ViewId, edge: "bottom" | "right", index = 0): Locator {
		return this.paneAt(view, index).getByRole("button", {
			name: copy.a11y.addViewAt(edge, copy.a11y.pane(getView(view).label)),
		});
	}

	// Split a pane and choose what the new one shows, which is one flow: the
	// view is picked before anything moves.
	async addViewBySplit(
		view: ViewId,
		edge: "bottom" | "right",
		nextView: ViewId,
	): Promise<void> {
		await this.splitControl(view, edge).click();
		const dialog = this.page.getByRole("dialog");
		await dialog.getByRole("radio", { name: getView(nextView).label }).click();
		await dialog
			.getByRole("button", { name: copy.addView.confirm, exact: true })
			.click();
		await dialog.waitFor({ state: "hidden" });
	}

	async choosePaneView(
		currentView: ViewId,
		nextView: ViewId,
		index = 0,
	): Promise<void> {
		const dialog = await this.openChangeViewDialog(currentView, index);
		await dialog.getByRole("radio", { name: getView(nextView).label }).click();
		await dialog
			.getByRole("button", { name: copy.workspace.changeView })
			.click();
		await dialog.waitFor({ state: "hidden" });
	}

	paneMenuTrigger(view: ViewId, index = 0): Locator {
		const label = getView(view).label;
		return this.paneAt(view, index).getByRole("button", {
			name: `${copy.workspace.paneActions}: ${label}`,
		});
	}

	async openChangeViewDialog(view: ViewId, index = 0): Promise<Locator> {
		const menu = await this.openPaneMenu(view, index);
		await menu
			.getByRole("menuitem", { name: copy.workspace.changeView })
			.click();
		await menu.waitFor({ state: "hidden" });
		const dialog = this.page.getByRole("dialog", {
			name: copy.workspace.changeView,
		});
		await dialog.waitFor({ state: "visible" });
		return dialog;
	}

	async openMovePaneDialog(view: ViewId, index = 0): Promise<Locator> {
		const menu = await this.openPaneMenu(view, index);
		await menu.getByRole("menuitem", { name: copy.workspace.movePane }).click();
		await menu.waitFor({ state: "hidden" });
		const dialog = this.page.getByRole("dialog", {
			name: copy.workspace.movePane,
		});
		await dialog.waitFor({ state: "visible" });
		return dialog;
	}

	// Notices float over the top trailing corner, so they cover the pane header
	// they land on. A test that is not about notices clears them first, the
	// same way a user would, rather than reaching around them.
	async dismissNotices(): Promise<void> {
		const notices = this.page.getByRole("region", { name: copy.a11y.notices });
		const dismiss = notices.getByRole("button", {
			name: copy.actions.dismiss,
		});
		for (let count = await dismiss.count(); count > 0; count -= 1) {
			await dismiss.first().click();
		}
		await expect(notices).toHaveCount(0);
	}

	// Same contract as openAppMenu: the menu is open when this resolves,
	// whichever state the caller left it in.
	//
	// Zoom and wrap are closeOnClick={false}, so runPaneCommand can return with
	// the menu still open on purpose. Clicking the trigger again would toggle it
	// shut, and the caller would then assert against a menu that is not there.
	// When it is genuinely closed, the click still must not land inside the
	// previous menu's exit transition, where it toggles nothing.
	//
	// aria-expanded is the trigger's own state and flips before that transition
	// finishes, so it distinguishes the two cases; waitFor hidden is satisfied by
	// an absent element, so a cold page passes straight through.
	async openPaneMenu(view: ViewId, index = 0): Promise<Locator> {
		const trigger = this.paneMenuTrigger(view, index);
		const menu = this.page.getByRole("menu", {
			name: `${copy.workspace.paneActions}: ${getView(view).label}`,
		});
		if ((await trigger.getAttribute("aria-expanded")) !== "true") {
			await menu.waitFor({ state: "hidden" });
			await trigger.click();
		}
		await menu.waitFor({ state: "visible" });
		return menu;
	}

	// Close view, zoom, and copy are immediate items in the pane's own menu, so
	// one helper covers every direct command. Change view and Move pane instead
	// have dedicated helpers for the dialogs they open.
	async runPaneCommand(
		view: ViewId,
		command: PaneCommand,
		index = 0,
	): Promise<void> {
		const menu = await this.openPaneMenu(view, index);
		await menu
			.getByRole("menuitem", { name: paneCommandLabels[command], exact: true })
			.click();
	}

	async editCell(row: number, column: number, value: string): Promise<void> {
		const cell = this.cell(row, column);
		await cell.dblclick();
		const editor = this.grid().getByRole("textbox", {
			name: copy.a11y.cellEditor(row - 1, column - 1),
		});
		await editor.fill(value);
		await editor.press("Enter");
		await cell.filter({ hasText: value }).waitFor();
	}

	// The header cell edits exactly like a data cell: double click, type, Enter.
	// The editor is named after the header it is renaming, so renaming an
	// already-named column has to say what it is called now.
	async editHeader(column: number, value: string, current = ""): Promise<void> {
		const header = this.header(column);
		await header.dblclick();
		const editor = this.grid().getByRole("textbox", {
			name: copy.a11y.headerEditor(current, column - 1),
		});
		await editor.fill(value);
		await editor.press("Enter");
		await header.filter({ hasText: value }).waitFor();
	}

	async paste(
		text: string,
		html?: string,
		headerRow: boolean | null = true,
	): Promise<void> {
		await this.grid().evaluate(
			(grid, payload) => {
				const data = new DataTransfer();
				data.setData("text/plain", payload.text);
				if (payload.html) data.setData("text/html", payload.html);
				const event = new Event("paste", {
					bubbles: true,
					cancelable: true,
				});
				Object.defineProperty(event, "clipboardData", { value: data });
				grid.dispatchEvent(event);
			},
			{ text, html },
		);

		// Most tests paste only to establish a fixture and should state the header
		// decision that the product no longer guesses. The header-import contract
		// passes null so it can inspect the unanswered dialog itself.
		if (headerRow === null) return;
		const dialog = this.page.getByRole("dialog", {
			name: copy.headerImport.title,
		});
		if ((await dialog.count()) === 0) return;
		await dialog
			.getByRole("button", {
				name: headerRow
					? copy.headerImport.asHeaders
					: copy.headerImport.asData,
			})
			.click();
	}

	// The grid implements no Mod+C or Mod+X of its own: those are the browser's
	// own key bindings, and what Tabelo owns is the clipboard event they raise.
	// That event is what these dispatch, so the test exercises the contract the
	// product owns rather than the key binding the browser owns.
	async copy(): Promise<void> {
		await this.clipboardEvent("copy");
	}

	async cut(): Promise<void> {
		await this.clipboardEvent("cut");
	}

	// What the copy actually wrote, read back out of the same DataTransfer the
	// browser hands the event. Feeding the result to `paste` is a real Tabelo to
	// Tabelo round trip through both the writer and the reader, on whichever
	// engine is running. That the system clipboard carries these flavours
	// between two tabs is the browser's contract, not the product's.
	async copyFlavours(): Promise<Required<CopiedFlavours>> {
		return this.clipboardEvent("copy");
	}

	private async clipboardEvent(
		type: "copy" | "cut",
	): Promise<Required<CopiedFlavours>> {
		return this.grid().evaluate((grid, name) => {
			const data = new DataTransfer();
			const event = new Event(name, { bubbles: true, cancelable: true });
			Object.defineProperty(event, "clipboardData", { value: data });
			grid.dispatchEvent(event);
			return {
				text: data.getData("text/plain"),
				html: data.getData("text/html"),
			};
		}, type);
	}

	async importFile(
		name: string,
		text: string,
		mimeType = "text/plain",
	): Promise<void> {
		const chooserPromise = this.page.waitForEvent("filechooser");
		await this.openAppMenu();
		await this.page
			.getByRole("menuitem", { name: copy.actions.importFile })
			.click();
		const chooser = await chooserPromise;
		await chooser.setFiles({
			name,
			mimeType,
			buffer: Buffer.from(text),
		});
	}

	async cancelFileImport(): Promise<void> {
		const chooserPromise = this.page.waitForEvent("filechooser");
		await this.openAppMenu();
		await this.page
			.getByRole("menuitem", { name: copy.actions.importFile })
			.click();
		const chooser = await chooserPromise;
		await chooser.setFiles([]);
	}
}
