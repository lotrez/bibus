import {
	createOpencodeClient,
	createOpencodeServer,
	type OpencodeClient,
} from "@opencode-ai/sdk/v2";
import * as path from "node:path";
import type { Discussion } from "../gitlab/gitlab-models.ts";
import type { ReviewCommentParams } from "../gitlab/mcp.model.ts";
import {
	opencodeModel,
	opencodePort,
	opencodeProvider,
} from "../utils/env-vars.ts";
import logger from "../utils/logger.ts";

// Get the path to the MCP server script
const mcpServerPath = path.join(
	import.meta.dirname,
	"../gitlab/mcp-review-server.ts",
);
const mcpExists = await Bun.file(mcpServerPath).exists();
if (!mcpExists) {
	throw new Error(`MCP server script not found at path: ${mcpServerPath}`);
}

const agentConfigPath = path.join(
	import.meta.dirname,
	"../../config/agents.json",
);
const agentConfigExists = await Bun.file(agentConfigPath).exists();
if (!agentConfigExists) {
	throw new Error(
		`OpenCode agent config not found at path: ${agentConfigPath}`,
	);
}

// Create server with MCP config
const server = await createOpencodeServer({
	port: opencodePort,
	config: {
		agent: await Bun.file(agentConfigPath).json(),
		mcp: {
			"bibus-review": {
				type: "local",
				command: ["bun", "run", mcpServerPath],
				enabled: true,
			},
		},
	},
});

const createClient = async (
	directory: string,
	projectId?: number,
	mrIid?: number,
) => {
	logger.info(
		{ url: server.url, mcpServer: mcpServerPath, projectId, mrIid },
		"OpenCode server started with MCP review tool",
	);

	const client = createOpencodeClient({
		directory,
		baseUrl: server.url,
	});
	const events = await client.event.subscribe();
	return { client, events, server };
};

/**
 * Send a prompt to OpenCode and wait for the response text
 * @param client - The OpenCode client
 * @param prompt - The prompt text to send
 * @param model - Optional model configuration (defaults to env vars)
 * @returns The response text from the AI
 */
async function promptAndWaitForResponse(
	client: OpencodeClient,
	prompt: string,
	model?: {
		providerID: string;
		modelID: string;
	},
): Promise<string> {
	// Use provided model or fall back to environment variables
	const modelConfig = model || {
		providerID: opencodeProvider,
		modelID: opencodeModel,
	};

	logger.debug(
		{ prompt: prompt.substring(0, 100), model: modelConfig },
		"Sending prompt to OpenCode",
	);

	// Create session
	const session = await client.session.create();
	const sessionId = session.data?.id;
	if (!sessionId) {
		throw new Error("Failed to create OpenCode session");
	}

	logger.debug({ sessionId }, "OpenCode session created");

	// Subscribe to events
	const events = await client.event.subscribe();
	let responseText = "";
	let error: Error | null = null;

	// Start processing events
	const eventProcessor = (async () => {
		for await (const event of events.stream) {
			// Text from the AI
			if (event.type === "message.part.updated") {
				const part = event.properties.part;
				if (part.sessionID !== sessionId) continue;

				if (part.type === "text" && part.time?.end) {
					responseText += part.text;
					logger.debug(
						{ textLength: part.text.length, totalLength: responseText.length },
						"AI response part received",
					);
				}
				if (part.type === "tool" && part.state.status === "error") {
					logger.error(
						{
							tool: part.tool,
							error: part.state.error,
						},
						"Tool execution failed",
					);
				}
				// Tool calls - log at debug level
				if (part.type === "tool" && part.state.status === "completed") {
					logger.debug(
						{
							tool: part.tool,
							input: part.state.input,
							output:
								typeof part.state.output === "string"
									? part.state.output.substring(0, 200)
									: part.state.output,
						},
						"Tool executed",
					);
				}
			}

			// Session is done
			if (
				event.type === "session.idle" &&
				event.properties.sessionID === sessionId
			) {
				logger.debug({ sessionId }, "OpenCode session completed");
				break;
			}

			// Handle errors
			if (
				event.type === "session.error" &&
				event.properties.sessionID === sessionId
			) {
				error = new Error(
					`Session error: ${JSON.stringify(event.properties.error)}`,
				);
				logger.error(
					{ error: event.properties.error },
					"OpenCode session error",
				);
				break;
			}
		}
	})();

	// Send the prompt AFTER subscribing to events
	await client.session.prompt({
		sessionID: sessionId,
		model: modelConfig,
		parts: [
			{
				type: "text",
				text: prompt,
			},
		],
	});

	// Wait for processing to complete
	await eventProcessor;

	if (error) {
		throw error;
	}

	logger.debug(
		{ sessionId, responseLength: responseText.length },
		"Received complete response from OpenCode",
	);

	return responseText;
}

/**
 * Create a review session that posts comments via the MCP tool
 * The MCP server will post comments directly to GitLab as they are received.
 * @param client - The OpenCode client
 * @param prompt - The prompt text to send
 * @param model - Optional model configuration (defaults to env vars)
 * @returns Object containing response text and count of comments posted
 */
async function createReviewSession(
	client: OpencodeClient,
	prompt: string,
	model?: {
		providerID: string;
		modelID: string;
	},
): Promise<{ responseText: string; commentCount: number }> {
	// Use provided model or fall back to environment variables
	const modelConfig = model || {
		providerID: opencodeProvider,
		modelID: opencodeModel,
	};

	logger.debug(
		{ prompt: prompt.substring(0, 100), model: modelConfig },
		"Creating review session",
	);

	// Create session
	const session = await client.session.create();
	const sessionId = session.data?.id;
	if (!sessionId) {
		throw new Error("Failed to create OpenCode session");
	}

	logger.debug({ sessionId }, "Review session created");

	// Subscribe to events
	const events = await client.event.subscribe();
	let responseText = "";
	let commentCount = 0;
	let error: Error | null = null;

	// Track processed tool calls to avoid duplicates
	const processedToolCalls = new Set<string>();

	// Start processing events
	const eventProcessor = (async () => {
		for await (const event of events.stream) {
			// Text from the AI
			if (event.type === "message.part.updated") {
				const part = event.properties.part;
				if (part.sessionID !== sessionId) continue;

				if (part.type === "text" && part.time?.end) {
					responseText += part.text;
					logger.debug(
						{
							textLength: part.text.length,
							totalLength: responseText.length,
							part: part.text,
						},
						"AI response part received",
					);
				}

				// Handle post_review_comment tool calls - count them
				if (part.type === "tool" && part.tool === "post_review_comment") {
					if (part.state.status === "completed") {
						const params = part.state.input as unknown as ReviewCommentParams;
						const toolCallKey = `${part.callID}`;

						if (!processedToolCalls.has(toolCallKey)) {
							processedToolCalls.add(toolCallKey);

							logger.info(
								{
									file: params.file,
									line: params.line,
									severity: params.severity,
									hasSuggestion: params.suggestedCode !== null,
								},
								"Review comment tool called - MCP server will post to GitLab",
							);

							commentCount++;
						}
					}

					if (part.state.status === "error") {
						logger.error(
							{
								tool: part.tool,
								error: part.state.error,
							},
							"Tool execution failed",
						);
					}
				}

				// Log other tool calls for debugging
				if (part.type === "tool" && part.tool !== "post_review_comment") {
					if (part.state.status === "completed") {
						logger.debug(
							{
								tool: part.tool,
								output:
									typeof part.state.output === "string"
										? part.state.output.substring(0, 200)
										: part.state.output,
							},
							"Tool completed",
						);
					}
				}
			}

			// Session is done
			if (
				event.type === "session.idle" &&
				event.properties.sessionID === sessionId
			) {
				logger.debug({ sessionId }, "Review session completed");
				break;
			}

			// Handle errors
			if (
				event.type === "session.error" &&
				event.properties.sessionID === sessionId
			) {
				error = new Error(
					`Session error: ${JSON.stringify(event.properties.error)}`,
				);
				logger.error({ error: event.properties.error }, "Review session error");
				break;
			}
		}
	})();

	// Send the prompt AFTER subscribing to events
	await client.session.prompt({
		sessionID: sessionId,
		model: modelConfig,
		parts: [
			{
				type: "text",
				text: prompt,
			},
		],
	});

	// Wait for processing to complete
	await eventProcessor;

	if (error) {
		throw error;
	}

	logger.info(
		{
			sessionId,
			commentCount,
			responseLength: responseText.length,
		},
		"Review session completed",
	);

	return {
		responseText,
		commentCount,
	};
}

/**
 * Build conversation history from discussion notes
 * @param discussion - The discussion containing notes
 * @param botUsername - The username of the bot
 * @param currentMessageBody - The current message body to exclude from history (to avoid duplication)
 * @param maxMessages - Maximum number of messages to include in history (default: 10)
 * @returns Object with conversation history string and whether it exists
 */
function buildConversationHistory(
	discussion: Discussion,
	botUsername: string,
	currentMessageBody: string,
	maxMessages = 10,
): { conversationHistory: string; hasHistory: boolean } {
	// Filter out system notes and sort by creation time (chronological order)
	let nonSystemNotes = discussion.notes
		.filter((note) => !note.system)
		.sort(
			(a, b) =>
				new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
		);

	// Exclude the current message to avoid duplication
	nonSystemNotes = nonSystemNotes.filter(
		(note) => note.body.trim() !== currentMessageBody.trim(),
	);

	// Check if we have conversation history (excluding current message)
	const hasHistory = nonSystemNotes.length > 0;

	if (!hasHistory) {
		return { conversationHistory: "", hasHistory: false };
	}

	let messagesToInclude = nonSystemNotes;
	let omittedCount = 0;

	// If we have more than maxMessages, keep first message + last (maxMessages-1) messages
	if (nonSystemNotes.length > maxMessages && nonSystemNotes[0]) {
		const firstMessage = nonSystemNotes[0];
		const recentMessages = nonSystemNotes.slice(-(maxMessages - 1));
		messagesToInclude = [firstMessage, ...recentMessages];
		omittedCount = nonSystemNotes.length - maxMessages;
	}

	// Format messages with timestamps and roles
	const formattedMessages = messagesToInclude.map((note, index) => {
		const role = note.author.username === botUsername ? "Assistant" : "User";
		const timestamp = new Date(note.created_at).toLocaleString("en-US", {
			month: "short",
			day: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		});
		const author = role === "User" ? note.author.name : "Bot";

		// Add omission indicator after first message if needed
		const omissionIndicator =
			index === 0 && omittedCount > 0
				? `\n\n[... ${omittedCount} message${omittedCount > 1 ? "s" : ""} omitted ...]`
				: "";

		return `[${timestamp}] ${author}: ${note.body}${omissionIndicator}`;
	});

	const conversationHistory = formattedMessages.join("\n\n");

	return { conversationHistory, hasHistory };
}

export {
	buildConversationHistory,
	createClient,
	createReviewSession,
	promptAndWaitForResponse,
	server,
};
