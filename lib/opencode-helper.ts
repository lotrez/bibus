import {
	createOpencodeClient,
	createOpencodeServer,
	type OpencodeClient,
} from "@opencode-ai/sdk/v2";
import * as path from "node:path";
import { opencodeModel, opencodeProvider } from "./env-vars.ts";
import logger from "./logger.ts";
import type { ReviewCommentParams } from "./mcp.model.ts";

// Get the path to the MCP server script
const mcpServerPath = path.join(import.meta.dirname, "mcp-review-server.ts");
// Create server with MCP config
const server = await createOpencodeServer({
	port: Math.floor(10000 + Math.random() * 50000),
	config: {
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

export { createClient, createReviewSession, promptAndWaitForResponse, server };
