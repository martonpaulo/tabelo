export interface SourceFeedbackIds {
	readonly description: string;
	readonly announcement: string;
	readonly list: string;
}

// Pane ids are stable document-owned identifiers, so deriving DOM ids from
// them keeps the editor/feedback relationship stable across every draft update.
export function sourceFeedbackIds(paneId: string): SourceFeedbackIds {
	return {
		description: `source-feedback-${paneId}`,
		announcement: `source-feedback-announcement-${paneId}`,
		list: `source-feedback-list-${paneId}`,
	};
}
