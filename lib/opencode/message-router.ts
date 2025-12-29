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
		`@mention-router You are an AI assistant that classifies messages into one of the following categories: ${AVAILABLE_COMMANDS.join(", ")}.
Respond with only the category name.

Message: "${message}"
    `,
	);
	logger.debug(
		{ response: response.substring(0, 100) },
		"Message type determination response",
	);
	const lowerResponse = response.toLowerCase();
	for (const command of AVAILABLE_COMMANDS) {
		if (lowerResponse.includes(command)) {
			return command;
		}
	}
	// Default to general_question if no match found
	return "general_question";
}
