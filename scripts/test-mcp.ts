#!/usr/bin/env bun
/**
 * Test script to verify MCP server configuration with OpenCode
 */
import {
	createOpencodeClient,
	createOpencodeServer,
} from "@opencode-ai/sdk/v2";
import { promptAndWaitForResponse } from "../lib/opencode/opencode-helper";
import logger from "../lib/utils/logger";

const isRunningWithBun = (process.argv[0] ?? "").includes("bun");
const mcpCommand: string[] = isRunningWithBun
	? [process.argv[0] as string, "run", "index.ts", "mcp"]
	: [process.argv[0] as string, "mcp"];

console.log("MCP command:", mcpCommand);

// Create server with MCP config on a random port
const server = await createOpencodeServer({
	port: 0, // Random available port
	config: {
		mcp: {
			"bibus-review": {
				type: "local",
				command: mcpCommand,
				enabled: true,
			},
		},
	},
});

console.log("Server URL:", server.url);

// Create client
const client = createOpencodeClient({
	directory: process.cwd(),
	baseUrl: server.url,
});

// Check MCP status
console.log("\n=== MCP Status ===");
const mcpStatus = await client.mcp.status();
console.log(JSON.stringify(mcpStatus.data, null, 2));

// Create a session and ask the model what tools it has
console.log("\n=== Asking model about its tools ===");

const session = await client.session.create();
const sessionId = session.data?.id;
if (!sessionId) {
	throw new Error("Failed to create session");
}
console.log("Session ID:", sessionId);

// Subscribe to events

// Send prompt asking about tools
logger.info(
	await promptAndWaitForResponse(
		client,
		"What tools do you have available to you?",
	),
);
// Process events with timeout
const responseText = "";

console.log("\n=== Model's response about tools ===");
console.log(responseText);

// Cleanup
server.close();
console.log("\nTest complete!");
