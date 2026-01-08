import type { GitLabClient } from "./gitlab/gitlab-client.ts";

export let gitlabClient: GitLabClient = null as unknown as GitLabClient;

export function initializeGlobals(client: GitLabClient): void {
	gitlabClient = client;
}
