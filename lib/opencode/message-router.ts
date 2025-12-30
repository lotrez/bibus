import logger from "../utils/logger";
import { AVAILABLE_COMMANDS } from "../watch";
import { createClient, promptAndWaitForResponse } from "./opencode-helper";

export type MessageType = (typeof AVAILABLE_COMMANDS)[number];

/**
 * Determines the type of message based on its content.
 * @returns {Promise<MessageType>} The determined message type.
 */
export async function determineMessageType(
	message: string,
): Promise<MessageType> {
	const { client: opencodeClient } = await createClient(process.cwd());
	logger.debug(
		{ message: message.substring(0, 100) },
		"Determining message type",
	);
	const response = await promptAndWaitForResponse(
		opencodeClient,
		`@mention-router You are an AI assistant that classifies messages into one of the following categories:

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

Message: "${message}"`,
	);
	logger.debug({ response }, "Message type determination response");
	const lowerResponse = response.toLowerCase();
	for (const command of AVAILABLE_COMMANDS) {
		if (lowerResponse.includes(command)) {
			return command;
		}
	}
	// Default to general_question if no match found
	return "general_question";
}
