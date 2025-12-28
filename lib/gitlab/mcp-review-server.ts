#!/usr/bin/env bun
import * as fs from "node:fs";
import * as path from "node:path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
	CallToolRequestSchema,
	ErrorCode,
	ListToolsRequestSchema,
	McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { GitLabClient } from "./gitlab/gitlab-client.ts";
import type {
	DiffPosition,
	MergeRequestVersion,
} from "./gitlab/gitlab-models.ts";
import type { ReviewCommentParams } from "./mcp.model.ts";

// File logging for MCP server debugging
// IMPORTANT: projectId and mrIid are ALWAYS passed as tool parameters, NOT environment variables
const LOG_FILE = path.join(import.meta.dirname, "..", "mcp-server.log");

function log(
	level: "INFO" | "DEBUG" | "ERROR" | "WARN",
	message: string,
	data?: Record<string, unknown>,
) {
	const timestamp = new Date().toISOString();
	const dataStr = data ? ` ${JSON.stringify(data)}` : "";
	const logLine = `[${timestamp}] [${level}] ${message}${dataStr}\n`;

	// Write to file
	fs.appendFileSync(LOG_FILE, logLine);

	// Also write to stderr for immediate visibility (stderr doesn't interfere with MCP stdio)
	process.stderr.write(logLine);
}

log("INFO", "MCP Review Server starting...");

// Validate required environment variables
const gitlabToken = process.env.GITLAB_TOKEN;
const gitlabApiUrl = process.env.GITLAB_API_URL || "https://gitlab.com/api/v4";

if (!gitlabToken) {
	log("ERROR", "Missing required environment variable: GITLAB_TOKEN");
	process.exit(1);
}

log("INFO", "GitLab client initialized", { apiUrl: gitlabApiUrl });

// Initialize GitLab client with validated credentials
const gitlabClient = new GitLabClient(gitlabApiUrl, gitlabToken);

// Cache for MR version info (keyed by "projectId-mrIid")
const mrVersionCache: Map<string, MergeRequestVersion> = new Map();

// Define Zod schema for tool input validation
const reviewCommentSchema = z
	.object({
		file: z.string().nullish(),
		line: z.number().nullish(),
		severity: z.enum(["critical", "warning", "suggestion", "praise"]),
		comment: z.string().min(1),
		suggestedCode: z.string().nullish(),
		suggestionLinesAbove: z.number().min(0).max(100).nullish(),
		suggestionLinesBelow: z.number().min(0).max(100).nullish(),
		projectId: z.number(),
		mrIid: z.number(),
	})
	.transform((data) => ({
		...data,
		// Convert undefined to null for optional fields
		file: data.file ?? null,
		line: data.line ?? null,
		suggestedCode: data.suggestedCode ?? null,
		suggestionLinesAbove: data.suggestionLinesAbove ?? null,
		suggestionLinesBelow: data.suggestionLinesBelow ?? null,
	}));

/**
 * Get the latest MR version (cached per project+MR)
 */
async function getMRVersion(
	projectId: number,
	mrIid: number,
): Promise<MergeRequestVersion> {
	const cacheKey = `${projectId}-${mrIid}`;

	const cached = mrVersionCache.get(cacheKey);
	if (cached) {
		log("DEBUG", "Using cached MR version", { projectId, mrIid });
		return cached;
	}

	log("DEBUG", "Fetching MR versions from GitLab", { projectId, mrIid });

	const versions = await gitlabClient.getMergeRequestVersions(projectId, mrIid);

	if (versions.length === 0 || !versions[0]) {
		log("ERROR", "No MR versions found", { projectId, mrIid });
		throw new Error("No MR versions found");
	}

	// Latest version is first in the array
	const latestVersion = versions[0];
	mrVersionCache.set(cacheKey, latestVersion);

	log("INFO", "Cached MR version", {
		projectId,
		mrIid,
		base: latestVersion.base_commit_sha.substring(0, 8),
		head: latestVersion.head_commit_sha.substring(0, 8),
	});

	return latestVersion;
}

/**
 * Post a review comment directly to GitLab as a discussion
 * @param params - Review comment parameters
 * @throws {McpError} If posting comment fails
 */
async function postCommentToGitLab(params: ReviewCommentParams): Promise<void> {
	log("INFO", "Posting comment to GitLab", {
		projectId: params.projectId,
		mrIid: params.mrIid,
		file: params.file,
		line: params.line,
		severity: params.severity,
	});

	const severityEmoji = {
		critical: "🔴 **CRITICAL**",
		warning: "🟡 **Warning**",
		suggestion: "💡 **Suggestion**",
		praise: "✅ **Good**",
	}[params.severity];

	let body = `${severityEmoji}`;

	if (params.file && params.line === null) {
		// File-level comment (no line number)
		body += ` in \`${params.file}\``;
	}

	body += `\n\n${params.comment}`;

	// Format GitLab suggestion if provided
	if (params.suggestedCode && params.file && params.line !== null) {
		const linesAbove = params.suggestionLinesAbove ?? 0;
		const linesBelow = params.suggestionLinesBelow ?? 0;

		// GitLab suggestion format: ```suggestion:-N+M
		const suggestionHeader = `\`\`\`suggestion:-${linesAbove}+${linesBelow}`;
		body += `\n\n${suggestionHeader}\n${params.suggestedCode}\n\`\`\``;
	}

	try {
		// For diff comments (file + line specified), create a positioned discussion
		if (params.file && params.line !== null) {
			const version = await getMRVersion(params.projectId, params.mrIid);

			// Build position for diff comment
			// GitLab API accepts new_line without line_code for positioning
			const position: DiffPosition = {
				base_sha: version.base_commit_sha,
				start_sha: version.start_commit_sha,
				head_sha: version.head_commit_sha,
				old_path: params.file,
				new_path: params.file,
				position_type: "text",
				new_line: params.line,
			};

			log("DEBUG", "Creating positioned discussion", {
				file: params.file,
				line: params.line,
				position,
			});

			await gitlabClient.createMergeRequestDiscussion(
				params.projectId,
				params.mrIid,
				{
					body,
					position,
				},
			);

			log("INFO", "Posted diff comment", {
				severity: params.severity,
				file: params.file,
				line: params.line,
			});
		} else {
			// For general or file-level comments, create a non-positioned discussion
			log("DEBUG", "Creating general discussion", {
				file: params.file,
			});

			await gitlabClient.createMergeRequestDiscussion(
				params.projectId,
				params.mrIid,
				{
					body,
				},
			);

			log("INFO", "Posted general comment", {
				severity: params.severity,
				file: params.file ?? "general",
			});
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		log("ERROR", "Failed to post comment to GitLab", {
			error: message,
			file: params.file,
			line: params.line,
		});
		throw new McpError(
			ErrorCode.InternalError,
			`Failed to post comment to GitLab: ${message}`,
		);
	}
}

// Create MCP server instance
const server = new Server(
	{
		name: "bibus-review",
		version: "1.0.0",
	},
	{
		capabilities: {
			tools: {},
		},
	},
);

// Register tool list handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
	log("DEBUG", "Tool list requested");
	return {
		tools: [
			{
				name: "post_review_comment",
				description: `Post a review comment on the merge request. YOU MUST USE THIS TOOL to submit your review feedback - this is the ONLY way to provide review comments.

Call this tool for EACH issue, suggestion, or piece of feedback you find during your review. Do not write comments in your response text - use this tool instead.

IMPORTANT: You can post comments on ANY line in the diff - just provide the file path and line number. The tool handles all the GitLab API details automatically.

For code suggestions, provide the complete replacement code in suggestedCode. This will be formatted as a GitLab suggestion that can be applied with one click.

For multi-line suggestions:
- Set suggestionLinesAbove to the number of lines ABOVE the line number to include (0-100)  
- Set suggestionLinesBelow to the number of lines BELOW the line number to include (0-100)
- The suggestedCode should contain the complete replacement for all those lines

Example: To suggest changes to lines 10-15 (6 lines total), comment on line 12 and set suggestionLinesAbove=2, suggestionLinesBelow=3.`,
				inputSchema: {
					type: "object",
					required: ["severity", "comment", "projectId", "mrIid"],
					properties: {
						file: {
							type: ["string", "null"],
							description:
								"The file path (e.g. 'src/index.ts'), or null for general comments",
						},
						line: {
							type: ["number", "null"],
							description:
								"The line number in the NEW version of the file, or null for file-level/general comments",
						},
						severity: {
							type: "string",
							enum: ["critical", "warning", "suggestion", "praise"],
							description:
								"Severity: 'critical' for bugs/security, 'warning' for issues, 'suggestion' for improvements, 'praise' for good code",
						},
						comment: {
							type: "string",
							description:
								"Your review comment text explaining the issue or suggestion",
						},
						suggestedCode: {
							type: ["string", "null"],
							description:
								"Complete suggested code replacement. Include this when you want to suggest specific code changes. Set to null if no code suggestion.",
						},
						suggestionLinesAbove: {
							type: ["number", "null"],
							description:
								"For multi-line suggestions: number of lines above the commented line to replace (0-100, null for single-line)",
						},
						suggestionLinesBelow: {
							type: ["number", "null"],
							description:
								"For multi-line suggestions: number of lines below the commented line to replace (0-100, null for single-line)",
						},
						projectId: {
							type: "number",
							description: "GitLab project ID",
						},
						mrIid: {
							type: "number",
							description: "Merge request IID",
						},
					},
				},
			},
		],
	};
});

// Register tool call handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
	log("INFO", "Tool call received", {
		name: request.params.name,
		arguments: request.params.arguments,
	});

	if (request.params.name !== "post_review_comment") {
		log("WARN", "Unknown tool requested", { name: request.params.name });
		throw new McpError(
			ErrorCode.MethodNotFound,
			`Unknown tool: ${request.params.name}`,
		);
	}

	try {
		// Validate and parse tool arguments with Zod
		const params = reviewCommentSchema.parse(request.params.arguments);

		log("DEBUG", "Parsed tool parameters", {
			file: params.file,
			line: params.line,
			severity: params.severity,
			projectId: params.projectId,
			mrIid: params.mrIid,
		});

		// Post comment directly to GitLab
		await postCommentToGitLab(params);

		// Build confirmation response for the AI
		let response = "Review comment posted to GitLab successfully!\n";
		response += `- Severity: ${params.severity}\n`;
		if (params.file) {
			response += `- File: ${params.file}`;
			if (params.line !== null) {
				response += `:${params.line}`;
			}
			response += "\n";
		}
		if (params.suggestedCode) {
			response += "- Code suggestion included\n";
		}

		log("INFO", "Tool call completed successfully", {
			file: params.file,
			line: params.line,
		});

		return {
			content: [
				{
					type: "text",
					text: response,
				},
			],
		};
	} catch (error) {
		// Handle Zod validation errors
		if (error instanceof z.ZodError) {
			const issues = error.issues
				.map((issue) => `${issue.path.join(".")}: ${issue.message}`)
				.join(", ");
			log("ERROR", "Zod validation error", { issues });
			throw new McpError(
				ErrorCode.InvalidParams,
				`Invalid tool parameters: ${issues}`,
			);
		}

		// Handle MCP errors (already formatted)
		if (error instanceof McpError) {
			throw error;
		}

		// Handle unexpected errors
		const errorMessage = error instanceof Error ? error.message : String(error);
		log("ERROR", "Unexpected error in tool call", { error: errorMessage });
		throw new McpError(
			ErrorCode.InternalError,
			`Failed to post comment: ${errorMessage}`,
		);
	}
});

// Graceful shutdown handler
async function gracefulShutdown(signal: string) {
	log("INFO", `Received ${signal}, closing MCP server...`);
	try {
		await server.close();
		log("INFO", "MCP server closed gracefully");
		process.exit(0);
	} catch (error) {
		log("ERROR", "Error during shutdown", {
			error: error instanceof Error ? error.message : String(error),
		});
		process.exit(1);
	}
}

// Register signal handlers
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

// Connect with stdio transport
log("INFO", "Connecting MCP server with stdio transport...");
const transport = new StdioServerTransport();
await server.connect(transport);
log("INFO", "MCP server connected and ready");
