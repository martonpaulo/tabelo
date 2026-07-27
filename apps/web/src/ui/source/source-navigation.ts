type SourceNavigator = (line: number) => void;

const navigators = new Map<string, SourceNavigator>();

export function registerSourceNavigator(
	paneId: string,
	navigator: SourceNavigator,
): () => void {
	navigators.set(paneId, navigator);
	return () => {
		if (navigators.get(paneId) === navigator) navigators.delete(paneId);
	};
}

export function navigateToSourceLine(paneId: string, line: number): void {
	navigators.get(paneId)?.(line);
}
