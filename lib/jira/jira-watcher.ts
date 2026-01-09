import { analyzeBug } from "../opencode/analyze-bug.ts";
import { createMRForBugFix } from "../opencode/create-mr.ts";
import { determineMessageType } from "../opencode/message-router.ts";
import { gitlabClient } from "../shared.ts";
import { pollingIntervalMs } from "../utils/env-vars.ts";
import logger from "../utils/logger.ts";
import { cloneRepoForJiraIssue } from "./jira-actions.ts";
import type { JiraClient } from "./jira-client.ts";
import type { JiraComment, JiraIssue } from "./jira-models.ts";
import { createADFComment, extractPlainTextFromADF } from "./jira-utils.ts";

// Keep track of comments already processed to avoid duplicate work
const PROCESSED_COMMENTS = new Set<string>();

/**
 * Find the comment that mentions the bot
 * @param comments - Array of comments for an issue
 * @param currentUserId - The bot's Jira account ID
 * @returns The comment that mentions the bot, or null if not found
 */
function findMentionComment(
	comments: JiraComment[],
	currentUserId: string,
): JiraComment | null {
	logger.debug(
		{
			totalComments: comments.length,
			currentUserId,
			processedCommentsCount: PROCESSED_COMMENTS.size,
		},
		"Starting findMentionComment search",
	);

	// Sort comments by created date (newest first)
	const sortedComments = [...comments].sort(
		(a, b) => new Date(b.created).getTime() - new Date(a.created).getTime(),
	);

	logger.debug(
		{
			sortedCount: sortedComments.length,
			newestDate: sortedComments[0]?.created,
			oldestDate: sortedComments[sortedComments.length - 1]?.created,
		},
		"Comments sorted by date",
	);

	// Find the first comment that mentions the current user
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

		// Check if comment has already been processed
		if (PROCESSED_COMMENTS.has(comment.id)) {
			logger.trace(
				{ commentId: comment.id },
				"Skipping already processed comment",
			);
			continue;
		}

		// Mark comment as processed immediately to avoid duplicates
		PROCESSED_COMMENTS.add(comment.id);

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

	logger.debug("No mention comment found");
	return null;
}

/**
 * Process a Jira issue mention
 * @param jiraClient - The Jira API client
 * @param issue - The Jira issue where the bot was mentioned
 * @param comment - The comment that mentioned the bot
 */
async function processMention(
	jiraClient: JiraClient,
	issue: JiraIssue,
	comment: JiraComment,
): Promise<void> {
	const plainText = extractPlainTextFromADF(comment.body);

	logger.info(
		{
			issueKey: issue.key,
			commentId: comment.id,
			author: comment.author.displayName,
		},
		"Processing Jira mention",
	);

	// Determine the message type for Jira platform (analyze-bug, create-mr, general_question)
	const messageType = await determineMessageType(plainText, "jira");

	logger.debug({ issueKey: issue.key, messageType }, "Determined message type");

	try {
		switch (messageType) {
			case "analyze-bug": {
				// Analyze the bug/issue
				logger.info({ issueKey: issue.key }, "Starting bug analysis workflow");

				// Clone the linked GitLab repository
				const cloneResult = await cloneRepoForJiraIssue(
					gitlabClient,
					issue.key,
				);

				if (!cloneResult) {
					await jiraClient.addComment(issue.key, {
						body: createADFComment(
							"❌ Failed to clone repository. Make sure this Jira project is linked to a GitLab project in config/jira.json",
						),
					});
					return;
				}

				logger.info(
					{ issueKey: issue.key, clonePath: cloneResult.path },
					"Repository cloned successfully for bug analysis",
				);

				try {
					// Analyze the bug using AI
					const analysis = await analyzeBug(
						jiraClient,
						issue,
						cloneResult.path,
						cloneResult.projectId,
						cloneResult.projectPath,
					);

					// Post analysis as a comment
					await jiraClient.addComment(issue.key, {
						body: createADFComment(analysis),
					});
				} finally {
					// Always cleanup
					await cloneResult.cleanup();
					logger.debug(
						{ issueKey: issue.key },
						"Cleaned up bug analysis clone directory",
					);
				}

				break;
			}

			case "create-mr": {
				// Fix the bug and create an MR
				logger.info({ issueKey: issue.key }, "Starting bug fix workflow");

				// Clone the linked GitLab repository
				const cloneResult = await cloneRepoForJiraIssue(
					gitlabClient,
					issue.key,
				);

				if (!cloneResult) {
					await jiraClient.addComment(issue.key, {
						body: createADFComment(
							"❌ Failed to clone repository. Make sure this Jira project is linked to a GitLab project in config/jira.json",
						),
					});
					return;
				}

				logger.info(
					{ issueKey: issue.key, clonePath: cloneResult.path },
					"Repository cloned successfully for bug fix",
				);

				try {
					// Create the MR with bug fix
					const mrSummary = await createMRForBugFix(
						jiraClient,
						issue,
						cloneResult.path,
						cloneResult.projectId,
						cloneResult.projectPath,
					);

					// Post MR details as a comment
					await jiraClient.addComment(issue.key, {
						body: createADFComment(mrSummary),
					});
				} finally {
					// Always cleanup
					await cloneResult.cleanup();
					logger.debug(
						{ issueKey: issue.key },
						"Cleaned up bug fix clone directory",
					);
				}

				break;
			}

			case "general_question": {
				// Answer questions about the codebase or technical issues
				logger.info(
					{ issueKey: issue.key },
					"Starting question answering workflow",
				);

				// Clone the linked GitLab repository for context
				const cloneResult = await cloneRepoForJiraIssue(
					gitlabClient,
					issue.key,
				);

				if (!cloneResult) {
					// For questions, we might still answer without code context
					logger.info(
						{ issueKey: issue.key },
						"No linked project found, answering without code context",
					);

					await jiraClient.addComment(issue.key, {
						body: createADFComment(
							"ℹ️ To answer questions with code context, please link this Jira project to a GitLab project in config/jira.json",
						),
					});
					return;
				}

				logger.info(
					{ issueKey: issue.key, clonePath: cloneResult.path },
					"Repository cloned successfully for question answering",
				);

				try {
					// Answer the question using AI with repo context
					const questionText = plainText;

					// Use OpenCode to answer the question
					const { createClient, promptAndWaitForResponse } = await import(
						"../opencode/opencode-helper.ts"
					);
					const { client: opencodeClient } = await createClient(
						cloneResult.path,
					);

					const questionPrompt = `You are answering a question from Jira issue ${issue.key}.

Question: ${questionText}

Project: ${cloneResult.projectPath}
Working directory: ${cloneResult.path}

Please provide a helpful answer based on the codebase.`;

					const answer = await promptAndWaitForResponse(
						opencodeClient,
						questionPrompt,
					);

					// Post answer as a comment
					await jiraClient.addComment(issue.key, {
						body: createADFComment(
							`# Answer\n\n${answer}\n\n---\n*Answer provided by Bibus bot*`,
						),
					});
				} finally {
					await cloneResult.cleanup();
					logger.debug(
						{ issueKey: issue.key },
						"Cleaned up question clone directory",
					);
				}

				break;
			}

			default:
				logger.warn(
					{ messageType, issueKey: issue.key },
					"Unknown message type detected",
				);
		}
	} catch (error) {
		logger.error(
			{ error, issueKey: issue.key, commentId: comment.id },
			"Error processing Jira mention",
		);

		// Post error message to Jira
		try {
			await jiraClient.addComment(issue.key, {
				body: createADFComment(
					`❌ Error processing your request: ${error instanceof Error ? error.message : String(error)}`,
				),
			});
		} catch (commentError) {
			logger.error(
				{ error: commentError, issueKey: issue.key },
				"Failed to post error comment to Jira",
			);
		}
	}
}

/**
 * Check for new mentions in Jira
 */
async function detectMentions(
	jiraClient: JiraClient,
	projectKeys?: string[],
): Promise<void> {
	try {
		const currentUser = await jiraClient.getCurrentUser();
		logger.trace("Fetching Jira mentions...");

		// Get mentions from the last polling interval (with some buffer)
		const timeWindowMinutes = Math.ceil(pollingIntervalMs / 60000) + 3;
		const mentions = await jiraClient.getMentions(
			projectKeys,
			`-${timeWindowMinutes}m`,
		);

		if (mentions.length > 0) {
			logger.debug(
				{ count: mentions.length, user: currentUser.displayName },
				"Jira mentions found",
			);
		}

		// Process each mention
		await Promise.allSettled(
			mentions.map(async (issue) => {
				// Get comments for the issue
				logger.trace(
					{ issueKey: issue.key },
					"Fetching comments for mentioned issue",
				);
				const comments = await jiraClient.getComments(issue.key);

				logger.trace(
					{ issueKey: issue.key, commentCount: comments.length },
					"Comments fetched for issue",
				);
				// Find the comment that mentions the bot
				const mentionComment = findMentionComment(
					comments,
					currentUser.accountId,
				);

				if (!mentionComment) {
					logger.trace(
						{ issueKey: issue.key },
						"No unprocessed mention comment found",
					);
					return;
				}

				// Process the mention
				logger.debug(
					{
						issueKey: issue.key,
						commentId: mentionComment.id,
					},
					"Mention comment found, processing",
				);
				await processMention(jiraClient, issue, mentionComment);
			}),
		);
	} catch (error) {
		logger.error({ error }, "Error detecting Jira mentions");
	}
}

/**
 * Start watching for Jira mentions
 * @param jiraClient - The Jira API client
 * @param projectKeys - Optional array of project keys to filter by
 * @returns The interval handle for stopping the watcher
 */
export async function startJiraWatching(
	jiraClient: JiraClient,
	projectKeys?: string[],
): Promise<NodeJS.Timeout> {
	logger.info(
		{
			pollingIntervalMs,
			projectKeys: projectKeys || "all",
		},
		"Starting Jira watcher",
	);

	const interval = setInterval(async () => {
		await detectMentions(jiraClient, projectKeys);
	}, pollingIntervalMs);

	// Initial immediate check
	await detectMentions(jiraClient, projectKeys);

	return interval;
}
