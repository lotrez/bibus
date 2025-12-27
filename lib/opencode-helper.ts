import {
	createOpencodeClient,
	createOpencodeServer,
	type OpencodeClient,
} from "@opencode-ai/sdk/v2";
import { opencodeModel, opencodeProvider } from "./env-vars";
import logger from "./logger";

const server = await createOpencodeServer({
	port: Math.floor(10000 + Math.random() * 50000),
	config: {},
});

const createClient = async (directory: string) => {
	const client = createOpencodeClient({
		directory,
		baseUrl: server.url,
	});
	const events = await client.event.subscribe();
	return { client, events };
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

export { createClient, promptAndWaitForResponse, server };
