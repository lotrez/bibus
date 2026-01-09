import { GitLabClient } from "./gitlab/gitlab-client.ts";
import { updateProfile } from "./gitlab/profile.ts";
import { JiraClient } from "./jira/jira-client.ts";
import { startJiraWatching } from "./jira/jira-watcher.ts";
import { initializeGlobals } from "./shared.ts";
import { config } from "./utils/config.ts";
import {
	jiraApiToken,
	jiraApiUrl,
	jiraEmail,
	jiraProjectKeys,
} from "./utils/env-vars.ts";
import logger from "./utils/logger.ts";
import { gracefulShutdown } from "./utils/shutdown.ts";
import { startWatching } from "./watch.ts";

/**
 * Start the Bibus bot
 * Verifies GitLab token, updates profile, and starts watching for mentions
 */
export async function startBot(): Promise<void> {
	// Register signal handlers for graceful shutdown
	process.on("SIGINT", () => gracefulShutdown("SIGINT"));
	process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

	logger.info("Starting bibus bot...");

	// Initialize GitLab client and verify token
	const gitlabClient = new GitLabClient();

	await gitlabClient.verifyToken();
	const user = await gitlabClient.getCurrentUser();

	// Initialize Jira client if enabled
	let jiraClient: JiraClient | undefined;
	if (config.enableJira && jiraApiUrl && jiraEmail && jiraApiToken) {
		logger.info("Jira integration enabled, initializing...");
		jiraClient = new JiraClient(jiraApiUrl, jiraEmail, jiraApiToken);
		await jiraClient.verifyToken();
		const jiraUser = await jiraClient.getCurrentUser();
		logger.info(
			{
				accountId: jiraUser.accountId,
				displayName: jiraUser.displayName,
			},
			"Connected to Jira as user",
		);
	} else {
		logger.info("Jira integration disabled");
	}

	// Initialize global instances
	initializeGlobals(gitlabClient, jiraClient);

	await updateProfile();
	logger.info(
		{ userId: user.id, username: user.username },
		"Connected to GitLab as user",
	);

	// Start watchers
	await startWatching();

	if (jiraClient) {
		await startJiraWatching(jiraClient, jiraProjectKeys);
	}
}
