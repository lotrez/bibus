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
 * Write tests for a merge request by creating an OpenCode session
 * @param item - The todo item containing the test writing request
 * @returns The test writing result summary
 */
export async function testMergeRequest(item: Todo): Promise<string> {
	logger.info(
		{
			projectId: item.project.id,
			mrIid: item.target.iid,
			title: item.target.title,
			sourceBranch: item.target.source_branch,
		},
		"Writing tests for merge request",
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
			body: "Meow 🐈, I'll write tests for this project and push them...",
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

		// Extract the note ID from the target URL (format: ...#note_123)
		const noteIdMatch = item.target_url.match(/#note_(\d+)$/);
		const currentNoteId = noteIdMatch ? Number(noteIdMatch[1]) : null;

		// Build conversation history from the discussion notes
		const botUsername = (await gitlabClient.getCurrentUser()).username;
		const { conversationHistory, hasHistory } = buildConversationHistory(
			initialDiscussion,
			botUsername,
			currentNoteId, // Exclude current message to avoid duplication
		);

		// Build the prompt with the user's request and context about the MR
		let prompt = `@test-writer

The user requested tests to be written via this message in a GitLab merge request discussion:

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

You have access to the repository code on the source branch. Your task:

1. Analyze the codebase to understand the project structure, language, and existing test setup
2. Identify what needs tests (new code, untested modules, etc.)
3. Write comprehensive test files following the project's existing test patterns and conventions
4. Create appropriate test files in the correct directories
5. Run any necessary setup steps (e.g., "bun install", "npm install", "mvn clean install", "pip install -r requirements.txt", etc.)
6. Run the tests to verify they work (e.g., "bun test", "npm test", "pytest", "mvn test", "cargo test", etc.)
7. If tests fail, try to fix them and run again (max 3 attempts)
8. ONLY if all tests pass: stage changes with "git add -A", commit with "git commit -m 'Add tests for <what you tested>'", and push with "git push origin ${item.target.source_branch}"
9. If you feel that you will not be able to make the tests run or if something is missing in the environment, STOP - do NOT push anything

IMPORTANT: 
- Follow the existing test structure and naming conventions in the project
- Write meaningful, comprehensive tests that cover edge cases
- DO run the tests after writing them to ensure they work
- Try to fix test failures, but give up after 3 attempts
- ONLY push if ALL tests pass - NEVER push broken tests!
- If you cannot get tests to pass after trying, STOP and clearly state this in your response
- Do NOT tell the user what you're doing step-by-step, just provide a final summary

Your final response should be a concise summary of:
- What test files you created
- What code/functionality is now covered by tests
- Whether the tests PASSED or FAILED (be very clear)
- Whether you pushed the changes (YES if tests passed, NO if tests failed)
- If tests failed: what the errors are and what needs manual intervention
- Any notes about test coverage or areas that need manual testing

CRITICAL: If tests are still failing, your response MUST start with "⚠️ TESTS FAILED - NO CHANGES PUSHED" so the user knows immediately.`;

		logger.debug(
			{ request: item.body.substring(0, 100) },
			"Sending test writing request to OpenCode",
		);

		// Get the AI's response
		const result = await promptAndWaitForResponse(opencodeClient, prompt);

		logger.info(
			{
				mrIid: item.target.iid,
				resultLength: result.length,
			},
			"Test writing completed by AI",
		);

		// AI handles git operations conditionally based on test results
		// No need to push here - AI will push only if tests pass

		// Reply to the discussion with the result
		await gitlabClient.replyToDiscussion(
			item.project.id,
			item.target.iid,
			initialDiscussion.id,
			{
				body: `Test writing completed! 🐾\n\n${result}`,
			},
		);

		logger.info(
			{ mrIid: item.target.iid, discussionId: initialDiscussion.id },
			"Posted test writing results to discussion",
		);

		return result;
	} catch (error) {
		logger.error(
			{
				error: error instanceof Error ? error.message : String(error),
				mrIid: item.target.iid,
			},
			"Failed to write tests",
		);

		// Try to post an error message to the discussion
		if (initialDiscussion) {
			await gitlabClient.replyToDiscussion(
				item.project.id,
				item.target.iid,
				initialDiscussion.id,
				{
					body: "Sorry, I encountered an error while trying to write tests. Please check the logs or try again later.",
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
