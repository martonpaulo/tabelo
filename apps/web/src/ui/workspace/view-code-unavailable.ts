// A lazy view whose code never arrived, told apart from a view that broke
// while it ran (#419). The difference decides the pane's recovery: a view that
// broke can be mounted again, while code that failed to load can only be
// requested again by loading the page again, since the browser keeps a failed
// module fetch for the life of the page.
export class ViewCodeUnavailable extends Error {
	constructor(cause: unknown) {
		super("The code of this view could not be loaded.", { cause });
		this.name = "ViewCodeUnavailable";
	}
}
