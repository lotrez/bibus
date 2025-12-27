import { gitlabClient } from "../index.ts";
import { cloneToTemp } from "./git.ts";
import type { Todo } from "./gitlab/gitlab-models.ts";
import logger from "./logger.ts";
import { createClient, createReviewSession } from "./opencode-helper.ts";

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
	await gitlabClient.createMergeRequestNote(item.project.id, item.target.iid, {
		body: "Bibus bot is reviewing this merge request...",
	});

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
		const { client: opencodeClient } = await createClient(
			cloneResult.path,
			item.project.id,
			item.target.iid,
		);

		const prompt = `You are a code reviewer. Review the merge request "${item.target.title}".

The projectId is ${item.project.id} and the merge request IID is ${item.target.iid}.

Do not tell the user what youa re doing, he does not need to know. Just focus on reviewing the code changes.

Your task:
1. Run "git diff ${item.target.target_branch}...HEAD" to see what changed
2. Read any files that need closer inspection
3. For EACH issue or suggestion you find, call the post_review_comment tool

YOU MUST USE the post_review_comment tool to submit your feedback. This tool will post comments directly to GitLab. Do not write review comments as text - they will be ignored. Only tool calls count.

Tool parameters:
- severity: "critical" (bugs/security), "warning" (should fix), "suggestion" (nice to have), "praise" (good code)
- file: the file path, or null for general comments
- line: line number in the file, or null for file-level comments  
- comment: your review comment explaining the issue
- suggestedCode: replacement code (optional), or null
- suggestionLinesAbove/Below: for multi-line replacements (optional)

Example tool call:
{
  "severity": "warning",
  "file": "src/index.ts",
  "line": 42,
  "comment": "This variable is never used",
  "suggestedCode": null,
  "suggestionLinesAbove": null,
  "suggestionLinesBelow": null,
	"projectId": "${item.project.id}",
	"mrIid": "${item.target.iid}"
}

Start now: run git diff, then post_review_comment for each finding.`;

		const { responseText, commentCount } = await createReviewSession(
			opencodeClient,
			prompt,
		);

		logger.info(
			{
				mrIid: item.target.iid,
				commentCount,
				responseLength: responseText.length,
			},
			"Review session completed",
		);

		await gitlabClient.createMergeRequestNote(
			item.project.id,
			item.target.iid,
			{
				body: `## Review Summary\n\n${responseText}`,
			},
		);
		logger.info(
			{ mrIid: item.target.iid, commentCount },
			"Posted review comments to merge request",
		);

		return { summary: responseText, commentCount };
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
