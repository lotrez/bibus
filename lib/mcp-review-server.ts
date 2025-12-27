#!/usr/bin/env bun
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
	MergeRequestDiff,
	MergeRequestVersion,
} from "./gitlab/gitlab-models.ts";
import type { ReviewCommentParams } from "./mcp.model.ts";

// Validate required environment variables
const gitlabToken = process.env.GITLAB_TOKEN;
const gitlabApiUrl = process.env.GITLAB_API_URL || "https://gitlab.com/api/v4";

if (!gitlabToken) {
	console.error("Error: Missing required environment variable: GITLAB_TOKEN");
	process.exit(1);
}

// Initialize GitLab client with validated credentials
const gitlabClient = new GitLabClient(gitlabApiUrl, gitlabToken);

// Cache for MR version and diff info
let mrVersionCache: MergeRequestVersion | null = null;
let mrDiffCache: MergeRequestDiff | null = null;

// Define Zod schema for tool input validation
const reviewCommentSchema = z
	.object({
		file: z.string().optional(),
		line: z.number().optional(),
		severity: z.enum(["critical", "warning", "suggestion", "praise"]),
		comment: z.string().min(1),
		suggestedCode: z.string().optional(),
		suggestionLinesAbove: z.number().min(0).max(100).optional(),
		suggestionLinesBelow: z.number().min(0).max(100).optional(),
		projectId: z.number(),
		mrIid: z.number(),
	})
	.transform((data) => ({
		...data,
		// Convert undefined to null for optional fields
		suggestedCode: data.suggestedCode ?? null,
		suggestionLinesAbove: data.suggestionLinesAbove ?? null,
		suggestionLinesBelow: data.suggestionLinesBelow ?? null,
	}));

/**
 * Get the latest MR version (cached)
 */
async function getMRVersion(
	projectId: string,
	mrIid: string,
): Promise<MergeRequestVersion> {
	if (mrVersionCache) {
		return mrVersionCache;
	}

	const versions = await gitlabClient.getMergeRequestVersions(
		Number.parseInt(projectId, 10),
		Number.parseInt(mrIid, 10),
	);

	if (versions.length === 0 || !versions[0]) {
		throw new Error("No MR versions found");
	}

	// Latest version is first in the array
	const latestVersion = versions[0];
	mrVersionCache = latestVersion;
	console.error(
		`[MCP] Cached MR version: base=${latestVersion.base_commit_sha.substring(0, 8)}, head=${latestVersion.head_commit_sha.substring(0, 8)}`,
	);

	return latestVersion;
}

/**
 * Get the latest MR diff with line codes (cached)
 */
async function getMRDiff(
	projectId: string,
	mrIid: string,
): Promise<MergeRequestDiff> {
	if (mrDiffCache) {
		return mrDiffCache;
	}

	const diff = await gitlabClient.getMergeRequestDiff(
		Number.parseInt(projectId, 10),
		Number.parseInt(mrIid, 10),
	);

	mrDiffCache = diff;
	console.error(
		`[MCP] Cached MR diff: ${diff.diffs?.length || 0} files changed`,
	);

	return diff;
}

/**
 * Find the line_code for a specific file and line number
 */
function findLineCode(
	diff: MergeRequestDiff,
	filePath: string,
	lineNumber: number,
): string | null {
	// Find the file in the diff
	const file = diff.diffs?.find(
		(f) => f.new_path === filePath || f.old_path === filePath,
	);

	if (!file || !file.lines) {
		console.error(`[MCP] File not found in diff: ${filePath}`);
		return null;
	}

	// Find the line with the matching new_line number
	const line = file.lines.find((l) => l.new_line === lineNumber);

	if (!line) {
		console.error(
			`[MCP] Line ${lineNumber} not found in file ${filePath}. Available lines: ${file.lines
				.map((l) => l.new_line)
				.filter(Boolean)
				.join(", ")}`,
		);
		return null;
	}

	return line.line_code;
}

/**
 * Post a review comment directly to GitLab as a discussion
 * @param params - Review comment parameters
 * @throws {McpError} If posting comment fails
 */
async function postCommentToGitLab(params: ReviewCommentParams): Promise<void> {
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
			const version = await getMRVersion(
				params.projectId.toString(),
				params.mrIid.toString(),
			);

			// Fetch the diff to get line codes
			const diff = await getMRDiff(
				params.projectId.toString(),
				params.mrIid.toString(),
			);

			// Find the line_code for this file and line number
			const lineCode = findLineCode(diff, params.file, params.line);

			if (!lineCode) {
				throw new Error(
					`Could not find line_code for ${params.file}:${params.line}. The line may not exist in the diff. Make sure you're commenting on lines that were added or modified in this MR.`,
				);
			}

			// Build position for diff comment
			const position: DiffPosition = {
				base_sha: version.base_commit_sha,
				start_sha: version.start_commit_sha,
				head_sha: version.head_commit_sha,
				old_path: params.file,
				new_path: params.file,
				position_type: "text",
				line_code: lineCode,
				new_line: params.line, // Comment on the new version of the file
			};

			await gitlabClient.createMergeRequestDiscussion(
				params.projectId,
				params.mrIid,
				{
					body,
					position,
				},
			);

			console.error(
				`[MCP] Posted diff comment: ${params.severity} ${params.file}:${params.line} (line_code: ${lineCode})`,
			);
		} else {
			// For general or file-level comments, create a non-positioned discussion
			await gitlabClient.createMergeRequestDiscussion(
				params.projectId,
				params.mrIid,
				{
					body,
				},
			);

			console.error(
				`[MCP] Posted general comment: ${params.severity} ${params.file ?? "general"}`,
			);
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(`[MCP] Failed to post comment to GitLab: ${message}`);
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
	return {
		tools: [
			{
				name: "post_review_comment",
				description: `Post a review comment on the merge request. YOU MUST USE THIS TOOL to submit your review feedback - this is the ONLY way to provide review comments.

Call this tool for EACH issue, suggestion, or piece of feedback you find during your review. Do not write comments in your response text - use this tool instead.

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
	if (request.params.name !== "post_review_comment") {
		throw new McpError(
			ErrorCode.MethodNotFound,
			`Unknown tool: ${request.params.name}`,
		);
	}

	try {
		// Validate and parse tool arguments with Zod
		const params = reviewCommentSchema.parse(request.params.arguments);

		// Post comment directly to GitLab
		await postCommentToGitLab(params);

		// Build confirmation response for the AI
		let response = "✓ Review comment posted to GitLab\n";
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
			const issues = error.issues.map((issue) => issue.message).join(", ");
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
		console.error(`[MCP] Unexpected error: ${errorMessage}`);
		throw new McpError(
			ErrorCode.InternalError,
			`Failed to post comment: ${errorMessage}`,
		);
	}
});

// Graceful shutdown handler
async function gracefulShutdown(signal: string) {
	console.error(`Received ${signal}, closing MCP server...`);
	try {
		await server.close();
		process.exit(0);
	} catch (error) {
		console.error(
			"Error during shutdown:",
			error instanceof Error ? error.message : String(error),
		);
		process.exit(1);
	}
}

// Register signal handlers
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

// Connect with stdio transport
const transport = new StdioServerTransport();
await server.connect(transport);
