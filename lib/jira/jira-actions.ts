import type { GitLabClient } from "../gitlab/gitlab-client.ts";
import { cloneToTempShallow } from "../utils/git.ts";
import logger from "../utils/logger.ts";
import { extractProjectKey, getGitLabProjectUrl } from "./jira-config.ts";

/**
 * Parsed GitLab MR URL information
 */
export interface ParsedGitLabMR {
	fullUrl: string;
	baseUrl: string; // e.g., "https://gitlab.com"
	projectPath: string; // e.g., "namespace/project"
	projectId: string | number;
	mrIid: number;
}

/**
 * Parse a GitLab merge request URL
 * @param url - GitLab MR URL (e.g., "https://gitlab.com/namespace/project/-/merge_requests/123")
 * @returns Parsed MR information, or null if URL is invalid
 */
export function parseGitLabMRUrl(url: string): ParsedGitLabMR | null {
	try {
		// Match pattern: https://gitlab.com/namespace/project/-/merge_requests/123
		const pattern = /^(https?:\/\/[^/]+)\/(.+?)\/-\/merge_requests\/(\d+)/;
		const match = url.match(pattern);

		if (!match) {
			logger.warn({ url }, "Failed to parse GitLab MR URL");
			return null;
		}

		const [, baseUrl, projectPath, mrIidStr] = match;

		if (!baseUrl || !projectPath || !mrIidStr) {
			logger.warn({ url }, "Incomplete GitLab MR URL parse");
			return null;
		}

		const mrIid = Number.parseInt(mrIidStr, 10);

		return {
			fullUrl: url,
			baseUrl,
			projectPath,
			projectId: encodeURIComponent(projectPath), // Use encoded path as ID
			mrIid,
		};
	} catch (error) {
		logger.error({ error, url }, "Error parsing GitLab MR URL");
		return null;
	}
}

/**
 * Clone a GitLab repository for a Jira issue mention
 * This function uses Jira project link configuration to find GitLab project
 *
 * @param gitlabClient - GitLab API client
 * @param issueKey - Jira issue key (e.g., "PROJ-123")
 * @returns Object with cloned repo path, project info, and cleanup function, or null if failed
 */
export async function cloneRepoForJiraIssue(
	gitlabClient: GitLabClient,
	issueKey: string,
): Promise<{
	path: string;
	projectId: string | number;
	projectPath: string;
	cleanup: () => Promise<void>;
} | null> {
	logger.info({ issueKey }, "Starting clone workflow for Jira issue");

	logger.trace({ issueKey }, "Extracting Jira project key from issue key");

	// Extract Jira project key from issue key (e.g., "PROJ-123" → "PROJ")
	const jiraProjectKey = extractProjectKey(issueKey);

	logger.trace({ jiraProjectKey, issueKey }, "Retrieved Jira project key");

	logger.trace(
		{ jiraProjectKey, issueKey },
		"Getting GitLab project URL from config",
	);

	// Get linked GitLab project URL from config
	const gitlabProjectUrl = getGitLabProjectUrl(jiraProjectKey);

	logger.info(
		{ issueKey, jiraProjectKey, gitlabProjectUrl },
		"Retrieved GitLab project URL for Jira project",
	);

	if (gitlabProjectUrl === null) {
		logger.warn(
			{ jiraProjectKey, issueKey },
			"Jira project not linked to GitLab project",
		);
		return null;
	}

	try {
		logger.debug(
			{ gitlabProjectUrl, jiraProjectKey },
			"Fetching GitLab project info",
		);

		logger.trace(
			{
				gitlabProjectUrl,
				jiraProjectKey,
				clientName: gitlabClient.constructor.name,
			},
			"About to call gitlabClient.getProject()",
		);

		logger.trace({ gitlabProjectUrl }, "Extracting project path from URL");

		const projectPath = gitlabClient.extractProjectPath(gitlabProjectUrl);

		logger.trace({ projectPath, gitlabProjectUrl }, "Project path extracted");

		// Get project info from GitLab
		const project = await gitlabClient.getProject(projectPath);

		logger.trace(
			{
				projectId: project.id,
				projectName: project.name,
				projectPath: project.path_with_namespace,
			},
			"Successfully fetched project from GitLab",
		);

		logger.debug(
			{ projectId: project.id, projectName: project.name },
			"Retrieved GitLab project info",
		);

		logger.trace(
			{
				httpUrl: project.http_url_to_repo,
				webUrl: project.web_url,
			},
			"Project URLs fetched",
		);

		// Construct clone URL
		const cloneUrl =
			project.http_url_to_repo || `${project.web_url.replace(/\/$/, "")}.git`;

		logger.trace(
			{ cloneUrl, webUrl: project.web_url, httpUrl: project.http_url_to_repo },
			"Constructed clone URL",
		);

		logger.info(
			{ cloneUrl, projectPath: project.path_with_namespace },
			"Cloning repository...",
		);

		logger.trace({ cloneUrl }, "About to call cloneToTempShallow()");

		// Clone repository (shallow clone for speed)
		const cloneResult = await cloneToTempShallow(cloneUrl);

		logger.trace(
			{ clonePath: cloneResult.path, hasCleanup: typeof cloneResult.cleanup },
			"Successfully cloned repository",
		);

		logger.info(
			{
				issueKey,
				clonePath: cloneResult.path,
				projectPath: project.path_with_namespace,
			},
			"Repository cloned successfully for Jira issue",
		);

		return {
			path: cloneResult.path,
			projectId: project.id,
			projectPath: project.path_with_namespace,
			cleanup: cloneResult.cleanup,
		};
	} catch (error) {
		logger.error(
			{
				error: error instanceof Error ? error.message : String(error),
				errorStack: error instanceof Error ? error.stack : undefined,
				errorName: error instanceof Error ? error.name : undefined,
				issueKey,
				gitlabProjectUrl,
				jiraProjectKey,
				errorType: typeof error,
			},
			"Clone workflow caught error",
		);

		logger.error(
			{ error, issueKey, gitlabProjectUrl },
			"Failed to clone repository for Jira issue",
		);
		return null;
	}
}
