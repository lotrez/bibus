import type { GitLabClient } from "./gitlab/gitlab-client.ts";
import type { JiraClient } from "./jira/jira-client.ts";

export let gitlabClient: GitLabClient = null as unknown as GitLabClient;
export let jiraClient: JiraClient | null = null;

export function initializeGlobals(
	gitlab: GitLabClient,
	jira?: JiraClient,
): void {
	gitlabClient = gitlab;
	if (jira) {
		jiraClient = jira;
	}
}
