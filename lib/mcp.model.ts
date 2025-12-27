export interface ReviewCommentParams {
	file: string | null;
	line: number | null;
	severity: "critical" | "warning" | "suggestion" | "praise";
	comment: string;
	suggestedCode: string | null;
	suggestionLinesAbove: number | null;
	suggestionLinesBelow: number | null;
	projectId: number;
	mrIid: number;
}
