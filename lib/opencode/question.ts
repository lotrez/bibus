import { gitlabClient } from "../../index.ts";
import type { Todo } from "../gitlab/gitlab-models.ts";
import { cloneToTemp } from "../utils/git.ts";
import logger from "../utils/logger.ts";
import {
	buildConversationHistory,
	createClient,
	promptAndWaitForResponse,
} from "./opencode-helper.ts";

/**
 * Answer a general question by creating an OpenCode session
 * @param item - The todo item containing the question
 * @returns The answer text from the AI
 */
export async function answerQuestion(item: Todo): Promise<string> {
	logger.info(
		{
			projectId: item.project.id,
			mrIid: item.target.iid,
			authorUsername: item.author.username,
		},
		"Answering general question",
	);

	// Find the discussion where the user mentioned the bot
	const mrDiscussions = await gitlabClient.getMergeRequestDiscussions(
		item.project.id,
		item.target.iid,
	);
	logger.debug(
		{ discussionCount: mrDiscussions.length },
		"Fetched merge request discussions",
	);

	const initialDiscussion = await gitlabClient.findDiscussionFromTodo(
		item,
		mrDiscussions,
	);

	if (!initialDiscussion) {
		logger.warn(
			{ todoId: item.id, mrIid: item.target.iid },
			"Could not find discussion for todo item",
		);
		throw new Error("Could not find discussion to reply to");
	}

	// Reply to acknowledge we're working on it
	await gitlabClient.replyToDiscussion(
		item.project.id,
		item.target.iid,
		initialDiscussion.id,
		{
			body: "Meow 🐈, let me think about that...",
		},
	);

	// Get the project details and clone the merge request branch
	const projectDetails = await gitlabClient.getProject(item.project.id);
	logger.debug(
		{ projectId: projectDetails.id, name: projectDetails.name },
		"Retrieved project details",
	);

	// Clone the merge request branch
	const cloneResult = cloneToTemp(
		projectDetails.http_url_to_repo,
		item.target.source_branch,
	);

	try {
		// Create OpenCode client with the cloned repository
		const { client: opencodeClient } = await createClient(cloneResult.path);

		// Build conversation history from the discussion notes
		const botUsername = (await gitlabClient.getCurrentUser()).username;
		const { conversationHistory, hasHistory } = buildConversationHistory(
			initialDiscussion,
			botUsername,
			item.body, // Exclude current message to avoid duplication
		);

		// Build the prompt with the user's question and context about the MR
		let prompt = `@question-answerer

The user asked a question via this message in a GitLab merge request discussion:

"${item.body}"

Context:
- Merge request: "${item.target.title}"
- Source branch: ${item.target.source_branch}
- Target branch: ${item.target.target_branch || "unknown"}`;

		// Add conversation history if this is not the first response
		if (hasHistory) {
			prompt += `

Previous conversation in this discussion:
${conversationHistory}

`;
		}

		prompt += `

You have access to the repository code on the source branch. You can:
1. Read files to understand the code
2. Use git commands to see diffs or history
3. Search through the codebase

Please provide a clear, concise answer to their question. If the question is about code, make sure to examine the relevant files.
Your answer will be posted directly in the merge request discussion. Do not talk about what you are doing, just provide the answer.`;

		logger.debug(
			{ question: item.body.substring(0, 100) },
			"Sending question to OpenCode",
		);

		// Get the AI's response
		const answer = await promptAndWaitForResponse(opencodeClient, prompt);

		logger.info(
			{
				mrIid: item.target.iid,
				answerLength: answer.length,
			},
			"Question answered by AI",
		);

		// Reply to the discussion with the answer
		await gitlabClient.replyToDiscussion(
			item.project.id,
			item.target.iid,
			initialDiscussion.id,
			{
				body: `${answer}`,
			},
		);

		logger.info(
			{ mrIid: item.target.iid, discussionId: initialDiscussion.id },
			"Posted answer to discussion",
		);

		return answer;
	} catch (error) {
		logger.error(
			{
				error: error instanceof Error ? error.message : String(error),
				mrIid: item.target.iid,
			},
			"Failed to answer question",
		);

		// Try to post an error message to the discussion
		if (initialDiscussion) {
			await gitlabClient.replyToDiscussion(
				item.project.id,
				item.target.iid,
				initialDiscussion.id,
				{
					body: "Sorry, I encountered an error while trying to answer your question. Please try again later.",
				},
			);
		}

		throw error;
	} finally {
		// Always cleanup the temp directory
		try {
			// Small delay to ensure all file handles are released
			await new Promise((resolve) => setTimeout(resolve, 100));
			cloneResult.cleanup();
		} catch (cleanupError) {
			logger.warn(
				{
					error:
						cleanupError instanceof Error
							? cleanupError.message
							: String(cleanupError),
					path: cloneResult.path,
				},
				"Failed to cleanup temp directory",
			);
		}
	}
}
