import type { GitLabClient } from "../gitlab/gitlab-client.ts";
import { cloneToTempShallow } from "../utils/git.ts";
import logger from "../utils/logger.ts";
import {
	extractProjectKey,
	getGitLabProjectUrl,
	getJiraConfig,
} from "./jira-config.ts";

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
 * This function uses the Jira project link configuration to find the GitLab project
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

	// Extract Jira project key from issue key (e.g., "PROJ-123" → "PROJ")
	const jiraProjectKey = extractProjectKey(issueKey);

	// Get the linked GitLab project URL from config
	const gitlabProjectUrl = getGitLabProjectUrl(jiraProjectKey);

	// Check if project is configured
	const config = getJiraConfig();
	const isConfigured = gitlabProjectUrl !== null;

	if (!isConfigured && !config.settings.allowUnlinkedProjects) {
		logger.warn(
			{ jiraProjectKey, issueKey },
			"Jira project not linked to GitLab project and allowUnlinkedProjects is false",
		);
		return null;
	}

	if (!isConfigured) {
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

		// Get project info from GitLab
		// The gitlabProjectUrl can be either a project ID or project path
		const project = await gitlabClient.getProject(gitlabProjectUrl);

		logger.debug(
			{ projectId: project.id, projectName: project.name },
			"Retrieved GitLab project info",
		);

		// Construct the clone URL
		const cloneUrl =
			project.http_url_to_repo || `${project.web_url.replace(/\/$/, "")}.git`;

		logger.info(
			{ cloneUrl, projectPath: project.path_with_namespace },
			"Cloning repository...",
		);

		// Clone the repository (shallow clone for speed)
		const cloneResult = await cloneToTempShallow(cloneUrl);

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
			{ error, issueKey, gitlabProjectUrl },
			"Failed to clone repository for Jira issue",
		);
		return null;
	}
}
