import logger from "../utils/logger";
import type { ADF, JiraComment } from "./jira-models";

/**
 * Find the comment that mentions the bot
 * @param comments - Array of comments for an issue
 * @param currentUserId - The bot's Jira account ID
 * @param processedComments - Set of comment IDs already processed
 * @returns The comment that mentions the bot, or null if not found
 */
export function findMentionComment(
	comments: JiraComment[],
	currentUserId: string,
	processedComments: Set<string>,
): JiraComment | null {
	logger.trace(
		{
			totalComments: comments.length,
			currentUserId,
		},
		"Starting findMentionComment search",
	);

	// Sort comments by created date (newest first)
	const sortedComments = [...comments].sort(
		(a, b) => new Date(b.created).getTime() - new Date(a.created).getTime(),
	);

	logger.trace(
		{
			sortedCount: sortedComments.length,
			newestDate: sortedComments[0]?.created,
			oldestDate: sortedComments[sortedComments.length - 1]?.created,
		},
		"Comments sorted by date",
	);

	// Find the first comment that mentions the current user and isn't processed
	for (const comment of sortedComments) {
		logger.trace(
			{
				commentId: comment.id,
				authorId: comment.author.accountId,
				authorName: comment.author.displayName,
				created: comment.created,
			},
			"Checking comment",
		);

		// Skip comments from the bot itself
		if (
			comment.author.accountId === currentUserId &&
			Bun.env.NODE_ENV === "production"
		) {
			logger.trace(
				{ commentId: comment.id },
				"Skipping comment from bot itself",
			);
			continue;
		}

		// Skip already processed comments
		if (processedComments.has(comment.id)) {
			logger.trace(
				{ commentId: comment.id },
				"Skipping already processed comment",
			);
			continue;
		}

		// Extract plain text from ADF (Atlassian Document Format)
		const plainText = extractPlainTextFromADF(comment.body);
		logger.trace(
			{
				commentId: comment.id,
				plainText: plainText.substring(0, 100),
				bodyType: typeof comment.body,
			},
			"Extracted plain text from comment",
		);

		// Check if the comment mentions the current user
		// Jira uses [~accountId] format for mentions in ADF
		const commentBody = comment.body;
		if (typeof commentBody !== "string" && commentBody.content) {
			const bodyJson = JSON.stringify(commentBody.content);
			logger.trace(
				{
					commentId: comment.id,
					hasContent: !!commentBody.content,
					contentLength: bodyJson.length,
					includesUserId: bodyJson.includes(currentUserId),
				},
				"Checking ADF content for mention",
			);

			if (bodyJson.includes(currentUserId)) {
				logger.debug(
					{
						commentId: comment.id,
						authorName: comment.author.displayName,
						plainText,
					},
					"Found mention in ADF content",
				);
				return comment;
			}
		}

		// Also check plain text for account ID mentions
		logger.trace(
			{
				commentId: comment.id,
				plainTextIncludesUserId: plainText.includes(currentUserId),
			},
			"Checking plain text for mention",
		);

		if (plainText.includes(currentUserId)) {
			logger.debug(
				{
					commentId: comment.id,
					authorName: comment.author.displayName,
					plainText,
				},
				"Found mention in plain text",
			);
			return comment;
		}

		logger.trace({ commentId: comment.id }, "No mention found in comment");
	}

	logger.trace("No mention comment found");
	return null;
}

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
	const urlRegex = /https?:\/\/[^\s]+/g;
	const parts: Array<{
		type: string;
		text?: string;
		marks?: Array<{ type: string; attrs?: { href: string } }>;
	}> = [];
	let lastIndex = 0;
	let match: RegExpExecArray | null = urlRegex.exec(text);

	while (match !== null) {
		// Add text before the URL
		if (match.index > lastIndex) {
			parts.push({
				type: "text",
				text: text.slice(lastIndex, match.index),
			});
		}

		// Add the URL as a link
		parts.push({
			type: "text",
			text: match[0],
			marks: [
				{
					type: "link",
					attrs: { href: match[0] },
				},
			],
		});

		lastIndex = urlRegex.lastIndex;
		match = urlRegex.exec(text);
	}

	// Add remaining text
	if (lastIndex < text.length) {
		parts.push({
			type: "text",
			text: text.slice(lastIndex),
		});
	}

	return {
		type: "doc",
		version: 1,
		content: [
			{
				type: "paragraph",
				content: parts.length > 0 ? parts : undefined,
			},
		],
	};
}
