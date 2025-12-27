import { gitlabClient } from "..";
import { cloneToTemp } from "./git";
import type { Todo } from "./gitlab/gitlab-models";
import logger from "./logger";
import { createClient, promptAndWaitForResponse } from "./opencode-helper";

/**
 * Represents a single review comment from the AI
 */
interface ReviewComment {
	/** The file path the comment relates to, or null for general comments */
	file: string | null;
	/** The line number the comment relates to, or null for file-level/general comments */
	line: number | null;
	/** The severity of the issue: "critical", "warning", "suggestion", or "praise" */
	severity: "critical" | "warning" | "suggestion" | "praise";
	/** The review comment text */
	comment: string;
	/** Optional suggested code fix in markdown format */
	suggestion: string | null;
}

/**
 * The expected JSON response structure from the AI reviewer
 */
interface ReviewResponse {
	/** Overall summary of the merge request review */
	summary: string;
	/** List of individual review comments */
	comments: ReviewComment[];
}

export async function reviewMergeRequest(item: Todo) {
	logger.info(
		{
			projectId: item.project.id,
			mrIid: item.target.iid,
			title: item.target.title,
			sourceBranch: item.target.source_branch,
		},
		"Reviewing merge request",
	);

	// comment on the merge request
	const _firstNote = await gitlabClient.createMergeRequestNote(
		item.project.id,
		item.target.iid,
		{
			body: "🤖 Bibus bot is reviewing this merge request...",
		},
	);

	// get the project, use the url to clone it
	const projectDetails = await gitlabClient.getProject(item.project.id);
	logger.debug(
		{ projectId: projectDetails.id, name: projectDetails.name },
		"Retrieved project details",
	);

	// clone the merge request
	const cloneResult = cloneToTemp(
		projectDetails.http_url_to_repo,
		item.target.source_branch,
	);

	try {
		// perform the review
		const { client: opencodeClient } = await createClient(cloneResult.path);

		const prompt = `You are an expert code reviewer currently reviewing a merge request on GitLab.
Please review the merge request titled: "${item.target.title}".
You are on the source branch. Compare it to the target branch "${item.target.target_branch}" for context.

Analyze the code changes for:
- Bugs and potential issues
- Code quality and best practices
- Performance concerns
- Security vulnerabilities
- Suggestions for improvement

Code suggestions should be formatted in markdown to use the quick suggestions feature from gitlab:

\`\`\`suggestion:-0+0
The content of the line you selected is shown here.
\`\`\`

CRITICAL: Your response must be ONLY raw JSON. Do NOT wrap it in markdown code blocks. Do NOT include \`\`\`json or \`\`\`. Do NOT include any text before or after the JSON.

Your entire response must be parseable by JSON.parse(). Start your response with { and end with }.

Use this exact format:
{
  "summary": "Brief overall assessment of the merge request",
  "comments": [
    {
      "file": "path/to/file.ts or null for general comments",
      "line": 42,
      "severity": "critical | warning | suggestion | praise",
      "comment": "Description of the issue or feedback",
      "suggestion": "Optional code suggestion in markdown, or null"
    }
  ]
}

Severity levels:
- "critical": Bugs, security issues, or breaking changes that must be fixed
- "warning": Issues that should be addressed but aren't blocking
- "suggestion": Improvements or best practices to consider
- "praise": Positive feedback for good code patterns

Remember: Output ONLY the raw JSON object, nothing else.`;

		const responseText = await promptAndWaitForResponse(opencodeClient, prompt);

		logger.debug(
			{
				mrIid: item.target.iid,
				responseLength: responseText.length,
				responseText,
			},
			"Raw AI response received",
		);

		// Extract JSON from response (handles markdown code blocks)
		let jsonText = responseText.trim();

		// Remove markdown code blocks if present
		const codeBlockMatch = jsonText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
		if (codeBlockMatch?.[1]) {
			jsonText = codeBlockMatch[1].trim();
			logger.debug("Extracted JSON from markdown code block");
		}

		// Parse the JSON response
		let review: ReviewResponse;
		try {
			review = JSON.parse(jsonText) as ReviewResponse;
		} catch (parseError) {
			logger.error(
				{
					error:
						parseError instanceof Error
							? parseError.message
							: String(parseError),
					responseText,
				},
				"Failed to parse AI response as JSON",
			);
			// Post the raw response as a fallback
			await gitlabClient.createMergeRequestNote(
				item.project.id,
				item.target.iid,
				{
					body: `## Review\n\n${responseText}`,
				},
			);
			return responseText;
		}

		logger.info(
			{
				mrIid: item.target.iid,
				commentCount: review.comments.length,
			},
			"Merge request review completed",
		);

		// Post the summary first
		await gitlabClient.createMergeRequestNote(
			item.project.id,
			item.target.iid,
			{
				body: `## Review Summary\n\n${review.summary}`,
			},
		);

		// Post each comment as a separate note
		for (const comment of review.comments) {
			const severityEmoji = {
				critical: "🚨",
				warning: "⚠️",
				suggestion: "💡",
				praise: "✨",
			}[comment.severity];

			let body = `${severityEmoji} **${comment.severity.toUpperCase()}**`;

			if (comment.file) {
				body += ` in \`${comment.file}\``;
				if (comment.line) {
					body += `:${comment.line}`;
				}
			}

			body += `\n\n${comment.comment}`;

			if (comment.suggestion) {
				body += `\n\n**Suggested change:**\n${comment.suggestion}`;
			}

			await gitlabClient.createMergeRequestNote(
				item.project.id,
				item.target.iid,
				{ body },
			);
		}

		logger.info(
			{ mrIid: item.target.iid, commentCount: review.comments.length },
			"Posted review comments to merge request",
		);
		return review;
	} finally {
		// Always cleanup the temp directory
		try {
			// Small delay to ensure all file handles are released
			await new Promise((resolve) => setTimeout(resolve, 100));
			cloneResult.cleanup();
		} catch (cleanupError) {
			logger.warn(
				{
					error:
						cleanupError instanceof Error
							? cleanupError.message
							: String(cleanupError),
					path: cloneResult.path,
				},
				"Failed to cleanup temp directory",
			);
		}
	}
}
