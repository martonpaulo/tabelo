export interface SourceFeedbackIds {
	readonly description: string;
}

// Pane ids are stable document-owned identifiers, so deriving DOM ids from
// them keeps the editor/feedback relationship stable across every draft update.
export function sourceFeedbackIds(paneId: string): SourceFeedbackIds {
	return {
		description: `source-feedback-${paneId}`,
	};
}
