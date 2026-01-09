import { GitLabClient } from "../lib/gitlab/gitlab-client.ts";
import { cloneRepoForJiraIssue } from "../lib/jira/jira-actions.ts";
import logger from "../lib/utils/logger.ts";

async function testCloneRepoForJiraIssue() {
	try {
		logger.info("Starting clone test for Jira issue");

		const gitlabClient = new GitLabClient();

		logger.info({ issueKey: "SMP-7" }, "Calling cloneRepoForJiraIssue");

		const result = await cloneRepoForJiraIssue(gitlabClient, "SMP-7");

		if (!result) {
			logger.error("cloneRepoForJiraIssue returned null");
			process.exit(1);
		}

		logger.info(
			{
				path: result.path,
				projectId: result.projectId,
				projectPath: result.projectPath,
			},
			"Clone successful",
		);

		process.exit(0);
	} catch (error) {
		logger.error(
			{
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
			},
			"Test script failed",
		);
		process.exit(1);
	}
}

testCloneRepoForJiraIssue();
