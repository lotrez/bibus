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
import logger from "../utils/logger.ts";
import { GitLabClient } from "./gitlab-client.ts";
import type { DiffPosition, MergeRequestVersion } from "./gitlab-models.ts";
import type { ReviewCommentParams } from "./mcp.model.ts";

// IMPORTANT: projectId and mrIid are ALWAYS passed as tool parameters, NOT environment variables

logger.info("MCP Review Server starting...");

// Validate required environment variables
const gitlabToken = process.env.GITLAB_TOKEN;
const gitlabApiUrl = process.env.GITLAB_API_URL || "https://gitlab.com/api/v4";

if (!gitlabToken) {
	logger.error("Missing required environment variable: GITLAB_TOKEN");
	process.exit(1);
}

logger.info({ apiUrl: gitlabApiUrl }, "GitLab client initialized");

// Initialize GitLab client with validated credentials
const gitlabClient = new GitLabClient(gitlabApiUrl, gitlabToken);

// Cache for MR version info (keyed by "projectId-mrIid")
const mrVersionCache: Map<string, MergeRequestVersion> = new Map();

// Define Zod schema for tool input validation
const reviewCommentSchema = z.object({
	file: z.string().optional(),
	line: z.number().optional(),
	severity: z.enum(["critical", "warning", "suggestion", "praise"]),
	comment: z.string().min(1),
	// suggestedCode is optional BUT if you're reporting an issue, you should provide it
	// Empty string means delete, non-empty means replace
	suggestedCode: z.string().optional(),
	suggestionLinesAbove: z.number().int().min(0).max(100).optional(),
	suggestionLinesBelow: z.number().int().min(0).max(100).optional(),
	projectId: z.number().int(),
	mrIid: z.number().int(),
});

const createMergeRequestSchema = z.object({
	projectId: z.number().int(),
	sourceBranch: z.string().min(1),
	targetBranch: z.string().min(1),
	title: z.string().min(1),
	description: z.string().optional(),
	labels: z.array(z.string()).optional(),
	removeSourceBranch: z.boolean().optional(),
});

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
		logger.debug({ projectId, mrIid }, "Using cached MR version");
		return cached;
	}

	logger.debug({ projectId, mrIid }, "Fetching MR versions from GitLab");

	const versions = await gitlabClient.getMergeRequestVersions(projectId, mrIid);

	if (versions.length === 0 || !versions[0]) {
		logger.error({ projectId, mrIid }, "No MR versions found");
		throw new Error("No MR versions found");
	}

	// Latest version is first in the array
	const latestVersion = versions[0];
	mrVersionCache.set(cacheKey, latestVersion);

	logger.info(
		{
			projectId,
			mrIid,
			base: latestVersion.base_commit_sha.substring(0, 8),
			head: latestVersion.head_commit_sha.substring(0, 8),
		},
		"Cached MR version",
	);

	return latestVersion;
}

/**
 * Post a review comment directly to GitLab as a discussion
 * @param params - Review comment parameters
 * @throws {McpError} If posting comment fails
 */
async function postCommentToGitLab(params: ReviewCommentParams): Promise<void> {
	logger.info(
		{
			projectId: params.projectId,
			mrIid: params.mrIid,
			file: params.file,
			line: params.line,
			severity: params.severity,
		},
		"Posting comment to GitLab",
	);

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

	// Format GitLab suggestion if suggestedCode is provided (including empty string for deletion)
	if (params.suggestedCode !== null && params.file && params.line !== null) {
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

			logger.debug(
				{
					file: params.file,
					line: params.line,
					position,
				},
				"Creating positioned discussion",
			);

			await gitlabClient.createMergeRequestDiscussion(
				params.projectId,
				params.mrIid,
				{
					body,
					position,
				},
			);

			logger.info(
				{
					severity: params.severity,
					file: params.file,
					line: params.line,
				},
				"Posted diff comment",
			);
		} else {
			// For general or file-level comments, create a non-positioned discussion
			logger.debug(
				{
					file: params.file,
				},
				"Creating general discussion",
			);

			await gitlabClient.createMergeRequestDiscussion(
				params.projectId,
				params.mrIid,
				{
					body,
				},
			);

			logger.info(
				{
					severity: params.severity,
					file: params.file ?? "general",
				},
				"Posted general comment",
			);
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		logger.error(
			{
				error: message,
				file: params.file,
				line: params.line,
			},
			"Failed to post comment to GitLab",
		);
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
	logger.debug("Tool list requested");
	return {
		tools: [
			{
				name: "post_review_comment",
				description: `Post a review comment on the merge request with GitLab's APPLY SUGGESTION button.

⚠️ CRITICAL: For EVERY code issue (critical/warning/suggestion), you MUST provide suggestedCode! ⚠️

How to use suggestedCode (REQUIRED for all issues):
- To REPLACE code: suggestedCode: "the new corrected code"
- To DELETE code: suggestedCode: "" (empty string)
- Multi-line: Add suggestionLinesAbove/Below numbers

Examples:
1. Replace line 42: { file: "src/x.ts", line: 42, suggestedCode: "const x = 5;" }
2. DELETE line 42: { file: "src/x.ts", line: 42, suggestedCode: "" }
3. Delete lines 40-42: { file: "src/x.ts", line: 41, suggestedCode: "", suggestionLinesAbove: 1, suggestionLinesBelow: 1 }

⚠️ NEVER EVER omit suggestedCode for issues! Even deletion requires suggestedCode: "" ⚠️
Only omit suggestedCode for "praise" severity.`,
				inputSchema: {
					type: "object",
					required: ["severity", "comment", "projectId", "mrIid"],
					properties: {
						file: {
							type: "string",
							description:
								"The file path (e.g. 'src/index.ts'). Omit for general comments.",
						},
						line: {
							type: "number",
							description:
								"The line number in the NEW version of the file. Omit for file-level/general comments.",
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
							type: "string",
							description:
								'⚠️ REQUIRED for ALL issues! ⚠️ Use "" (two quotes, nothing inside) to DELETE. Use actual code to REPLACE. This parameter is MANDATORY for critical/warning/suggestion severity. Only omit for "praise".',
						},
						suggestionLinesAbove: {
							type: "number",
							description:
								"For multi-line changes: number of lines ABOVE the commented line to include (0-100). Omit for single-line changes.",
						},
						suggestionLinesBelow: {
							type: "number",
							description:
								"For multi-line changes: number of lines BELOW the commented line to include (0-100). Omit for single-line changes.",
						},
						projectId: {
							type: "number",
							description: "GitLab project ID (integer)",
						},
						mrIid: {
							type: "number",
							description: "Merge request IID (integer)",
						},
					},
				},
			},
			{
				name: "create_merge_request",
				description: `Create a merge request in GitLab.

Use this tool after you have created a branch, made commits, and pushed them to GitLab.

Example workflow:
1. Create a new branch: git checkout -b fix/issue-123
2. Make changes to files
3. Commit changes: git add . && git commit -m "Fix issue 123"
4. Push to remote: git push -u origin fix/issue-123
5. Create MR: use this tool with the branch name and project ID`,
				inputSchema: {
					type: "object",
					required: ["projectId", "sourceBranch", "targetBranch", "title"],
					properties: {
						projectId: {
							type: "number",
							description: "GitLab project ID (integer)",
						},
						sourceBranch: {
							type: "string",
							description:
								"Source branch name (the branch with your changes, e.g. 'fix/issue-123')",
						},
						targetBranch: {
							type: "string",
							description:
								"Target branch name (the branch to merge into, usually 'main' or 'master')",
						},
						title: {
							type: "string",
							description: "Title of the merge request",
						},
						description: {
							type: "string",
							description: "Description of the merge request (optional)",
						},
						labels: {
							type: "array",
							items: { type: "string" },
							description:
								"Array of label names to add to the MR (optional, e.g. ['bug', 'high-priority'])",
						},
						removeSourceBranch: {
							type: "boolean",
							description:
								"Whether to remove the source branch after merge (optional, default: false)",
						},
					},
				},
			},
		],
	};
});

// Register tool call handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
	logger.info(
		{
			name: request.params.name,
			arguments: request.params.arguments,
		},
		"Tool call received",
	);

	if (
		request.params.name !== "post_review_comment" &&
		request.params.name !== "create_merge_request"
	) {
		logger.warn({ name: request.params.name }, "Unknown tool requested");
		throw new McpError(
			ErrorCode.MethodNotFound,
			`Unknown tool: ${request.params.name}`,
		);
	}

	try {
		// Log raw arguments for debugging
		logger.debug(
			{
				rawArguments: request.params.arguments,
			},
			"Raw tool arguments received",
		);

		// Handle create_merge_request tool
		if (request.params.name === "create_merge_request") {
			const params = createMergeRequestSchema.parse(request.params.arguments);

			logger.info(
				{
					projectId: params.projectId,
					sourceBranch: params.sourceBranch,
					targetBranch: params.targetBranch,
					title: params.title,
				},
				"Creating merge request",
			);

			// Create the merge request using GitLab client
			const mr = await gitlabClient.createMergeRequest(params.projectId, {
				source_branch: params.sourceBranch,
				target_branch: params.targetBranch,
				title: params.title,
				description: params.description,
				labels: params.labels,
				remove_source_branch: params.removeSourceBranch,
			});

			logger.info(
				{
					mrIid: mr.iid,
					mrUrl: mr.web_url,
				},
				"Merge request created successfully",
			);

			const response = `✅ Merge request created successfully!

**MR !${mr.iid}**: ${mr.title}
**URL**: ${mr.web_url}
**Source**: ${params.sourceBranch} → **Target**: ${params.targetBranch}`;

			return {
				content: [
					{
						type: "text",
						text: response,
					},
				],
			};
		}

		// Handle post_review_comment tool (existing code)
		// Validate and parse tool arguments with Zod
		const params = reviewCommentSchema.parse(request.params.arguments);

		// Convert undefined to null for better handling
		const processedParams: ReviewCommentParams = {
			file: params.file ?? null,
			line: params.line ?? null,
			severity: params.severity,
			comment: params.comment,
			suggestedCode: params.suggestedCode ?? null,
			suggestionLinesAbove: params.suggestionLinesAbove ?? null,
			suggestionLinesBelow: params.suggestionLinesBelow ?? null,
			projectId: params.projectId,
			mrIid: params.mrIid,
		};

		logger.debug(
			{
				file: processedParams.file,
				line: processedParams.line,
				severity: processedParams.severity,
				hasSuggestedCode: processedParams.suggestedCode !== null,
				suggestedCodeLength: processedParams.suggestedCode?.length ?? 0,
				suggestionLinesAbove: processedParams.suggestionLinesAbove,
				suggestionLinesBelow: processedParams.suggestionLinesBelow,
				projectId: processedParams.projectId,
				mrIid: processedParams.mrIid,
			},
			"Parsed tool parameters",
		);

		// Post comment directly to GitLab
		await postCommentToGitLab(processedParams);

		// Build confirmation response for the AI
		let response = "Review comment posted to GitLab successfully!\n";
		response += `- Severity: ${processedParams.severity}\n`;
		if (processedParams.file) {
			response += `- File: ${processedParams.file}`;
			if (processedParams.line !== null) {
				response += `:${processedParams.line}`;
			}
			response += "\n";
		}
		if (processedParams.suggestedCode !== null) {
			if (processedParams.suggestedCode === "") {
				response += "- Code deletion suggestion included\n";
			} else {
				response += "- Code replacement suggestion included\n";
			}
		}

		logger.info(
			{
				file: processedParams.file,
				line: processedParams.line,
			},
			"Tool call completed successfully",
		);

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
			logger.error({ issues }, "Zod validation error");
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
		logger.error({ error: errorMessage }, "Unexpected error in tool call");
		throw new McpError(
			ErrorCode.InternalError,
			`Failed to post comment: ${errorMessage}`,
		);
	}
});

// Graceful shutdown handler
async function gracefulShutdown(signal: string) {
	logger.info(`Received ${signal}, closing MCP server...`);
	try {
		await server.close();
		logger.info("MCP server closed gracefully");
		process.exit(0);
	} catch (error) {
		logger.error(
			{
				error: error instanceof Error ? error.message : String(error),
			},
			"Error during shutdown",
		);
		process.exit(1);
	}
}

// Register signal handlers
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

// Connect with stdio transport
logger.info("Connecting MCP server with stdio transport...");
const transport = new StdioServerTransport();
await server.connect(transport);
logger.info("MCP server connected and ready");
