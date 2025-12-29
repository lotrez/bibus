import { gitlabClient } from "../../index.ts";
import type { Todo } from "../gitlab/gitlab-models.ts";
import { cloneToTemp } from "../utils/git.ts";
import logger from "../utils/logger.ts";
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
	const mrDiscussions = await gitlabClient.getMergeRequestDiscussions(
		item.project.id,
		item.target.iid,
	);
	logger.debug(
		{ discussionCount: mrDiscussions.length },
		"Fetched merge request discussions",
	);
	const initialDiscussion = await gitlabClient.findDiscussionFromTodo(
		item,
		mrDiscussions,
	);
	// reenable when finished dev, do not post yet to not disable the todo
	if (initialDiscussion)
		await gitlabClient.replyToDiscussion(
			item.project.id,
			item.target.iid,
			initialDiscussion.id,
			{
				body: "Meow 🐈, I'll start reviewing this merge request...",
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
		const { client: opencodeClient } = await createClient(
			cloneResult.path,
			item.project.id,
			item.target.iid,
		);

		const prompt = `You are a code reviewer. Review the merge request "${item.target.title}".

The projectId is ${item.project.id} and the merge request IID is ${item.target.iid}.

Do not tell the user what you are doing, he does not need to know. Just focus on reviewing the code changes.

Your task:
1. Compare diffs between the source branch and the target branch using git diff
2. Read any files that need closer inspection
3. For EACH issue or suggestion you find, call the post_review_comment tool

YOU MUST USE the post_review_comment tool to submit your feedback. This tool will post comments directly to GitLab. Do not write review comments as text - they will be ignored. Only tool calls count.

⚠️ CRITICAL RULE - ALWAYS PROVIDE suggestedCode ⚠️

For EVERY issue you find (critical, warning, suggestion), you MUST include the suggestedCode parameter! This creates GitLab's "Apply suggestion" button.

How to use suggestedCode:
1. To REPLACE a line with new code: suggestedCode: "the new code here"
2. To DELETE a line: suggestedCode: "" (empty string - two quotes with nothing inside)
3. To replace multiple lines: suggestedCode: "new code" + suggestionLinesAbove/Below numbers
4. To delete multiple lines: suggestedCode: "" + suggestionLinesAbove/Below numbers

NEVER omit suggestedCode except for "praise" comments! Even if you just want to delete - use ""!

Tool parameters:
- severity: "critical" | "warning" | "suggestion" | "praise"
- file: the file path (e.g., "src/auth.ts")
- line: line number in the NEW version of the file
- comment: your explanation
- suggestedCode: the replacement code OR "" to delete
- suggestionLinesAbove: (optional) number of lines above to include
- suggestionLinesBelow: (optional) number of lines below to include

Example 1 - Single line fix (replacing line 42):
{
  "severity": "warning",
  "file": "src/index.ts",
  "line": 42,
  "comment": "Use const instead of let for variables that are never reassigned",
  "suggestedCode": "const userId = getUserId();",
  "suggestionLinesAbove": null,
  "suggestionLinesBelow": null,
  "projectId": ${item.project.id},
  "mrIid": ${item.target.iid}
}

Example 2 - Multi-line fix (replacing lines 10-12, commenting on line 11):
{
  "severity": "critical",
  "file": "src/auth.ts",
  "line": 11,
  "comment": "Remove password from response to prevent credential exposure",
  "suggestedCode": "return {\\n  user: { id: user.id, email: user.email },\\n  token\\n};",
  "suggestionLinesAbove": 1,
  "suggestionLinesBelow": 1,
  "projectId": ${item.project.id},
  "mrIid": ${item.target.iid}
}

Example 3 - Delete a single line (line 25):
{
  "severity": "warning",
  "file": "src/utils.ts",
  "line": 25,
  "comment": "Remove this unused import",
  "suggestedCode": "",
  "projectId": ${item.project.id},
  "mrIid": ${item.target.iid}
}

Example 4 - Delete multiple lines (lines 23-27, commenting on line 25):
{
  "severity": "warning",
  "file": "src/utils.ts",
  "line": 25,
  "comment": "Remove this unused code block",
  "suggestedCode": "",
  "suggestionLinesAbove": 2,
  "suggestionLinesBelow": 2,
  "projectId": ${item.project.id},
  "mrIid": ${item.target.iid}
}

REMEMBER: To delete = use suggestedCode: "" (empty string). This is the correct way to tell GitLab to remove lines.

Start now: run git diff, analyze the changes, then post_review_comment for each finding WITH suggestedCode fixes.
Your final response must be a brief summary of the review actions you took. Do NOT include any review comments in the final response - those are already posted via the tool calls. Only summarize your actions.
`;

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
		logger.info(
			{ mrIid: item.target.iid, commentCount },
			"Posted review comments to merge request",
		);

		if (initialDiscussion)
			await gitlabClient.replyToDiscussion(
				item.project.id,
				item.target.iid,
				initialDiscussion.id,
				{
					body: `Review completed! 🐾 ${responseText}`,
				},
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
