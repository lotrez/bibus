import type { ADF } from "./jira-models";

/**
 * Extract plain text from Atlassian Document Format (ADF) or string
 */
export function extractPlainTextFromADF(body: string | ADF): string {
	if (typeof body === "string") {
		return body;
	}

	if (!body.content) return "";

	let text = "";
	for (const node of body.content) {
		if (node.type === "paragraph" && node.content) {
			for (const child of node.content) {
				if (child.type === "text" && child.text) {
					text += `${child.text} `;
				}
			}
		}
	}
	return text.trim();
}

/**
 * Create an ADF comment body for posting to Jira
 */
export function createADFComment(text: string): ADF {
	return {
		type: "doc",
		version: 1,
		content: [
			{
				type: "paragraph",
				content: [
					{
						type: "text",
						text,
					},
				],
			},
		],
	};
}
