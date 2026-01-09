import logger from "../utils/logger";
import { createClient, promptAndWaitForResponse } from "./opencode-helper";

// GitLab commands - for merge request workflows
export const GITLAB_COMMANDS = ["review", "test", "general_question"] as const;

// Jira commands - for issue/bug workflows
export const JIRA_COMMANDS = [
	"analyze-bug",
	"create-mr",
	"general_question",
] as const;

export type GitLabCommand = (typeof GITLAB_COMMANDS)[number];
export type JiraCommand = (typeof JIRA_COMMANDS)[number];
export type MessageType = GitLabCommand | JiraCommand;

export type Platform = "gitlab" | "jira";

/**
 * Determines the type of message based on its content and platform.
 * @param message - The message to classify
 * @param platform - The platform (gitlab or jira) to determine available commands
 * @returns {Promise<MessageType>} The determined message type.
 */
export async function determineMessageType(
	message: string,
	platform: Platform,
): Promise<MessageType> {
	const { client: opencodeClient } = await createClient(process.cwd());
	logger.debug(
		{ message: message.substring(0, 100), platform },
		"Determining message type",
	);

	const prompt =
		platform === "gitlab"
			? `@mention-router You are an AI assistant that classifies messages into one of the following categories:

1. "review" - User wants a code review of their merge request. Keywords: review, check code, look at changes, feedback on code, code quality
   Examples: "please review this", "can you review my code?", "check this MR"

2. "test" - User wants to ADD/WRITE tests for the project. Keywords: add tests, write tests, create tests, test this, need tests, test coverage
   Examples: "add tests for this project", "write tests", "create unit tests", "test this MR", "we need test coverage"

3. "general_question" - User has a question about the code or wants to add features/documentation (NOT tests). Keywords: how, why, what, add feature, implement, explain
   Examples: "how does X work?", "add a new feature", "explain this function", "create documentation", "why is this code here?"

IMPORTANT: 
- Anything related to tests/testing = "test" category
- Code review requests = "review" category
- Questions or other work = "general_question" category

Analyze this message and respond with ONLY the category name (review, test, or general_question):

Message: "${message}"`
			: `@mention-router You are an AI assistant that classifies messages into one of the following categories:

1. "analyze-bug" - User wants analysis of a bug or issue. Keywords: analyze, investigate, look into, understand, debug, what's wrong, find the issue
   Examples: "analyze this bug", "investigate this issue", "what's causing this?", "debug this problem", "look into this"

2. "create-mr" - User wants to FIX a bug and create a merge request. Keywords: fix, solve, resolve, create MR, make changes, implement fix
   Examples: "fix this bug", "solve this issue", "create a fix", "resolve this problem", "can you fix this?"

3. "general_question" - User has a general question about the code or project. Keywords: how, why, what, explain, documentation
   Examples: "how does X work?", "why is this implemented this way?", "explain this code", "what does this do?"

IMPORTANT: 
- If user wants understanding/investigation = "analyze-bug" category
- If user wants a fix/changes = "create-mr" category
- General questions = "general_question" category

Analyze this message and respond with ONLY the category name (analyze-bug, create-mr, or general_question):

Message: "${message}"`;

	const response = await promptAndWaitForResponse(opencodeClient, prompt);
	logger.debug({ response, platform }, "Message type determination response");

	const lowerResponse = response.toLowerCase();
	const commands = platform === "gitlab" ? GITLAB_COMMANDS : JIRA_COMMANDS;

	for (const command of commands) {
		if (lowerResponse.includes(command)) {
			return command;
		}
	}

	// Default to general_question if no match found
	return "general_question";
}
