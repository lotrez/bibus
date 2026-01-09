import * as fs from "node:fs";
import * as path from "node:path";
import logger from "../utils/logger.ts";

/**
 * Jira configuration structure
 */
export interface JiraConfig {
	projectLinks: {
		[jiraProjectKey: string]: string; // GitLab project API URL
	};
	settings: {
		autoCreateRemoteLinks: boolean;
		allowUnlinkedProjects: boolean;
	};
}

let cachedConfig: JiraConfig | null = null;

/**
 * Load Jira configuration from config/jira.json
 * @param configPath - Path to the config file (default: config/jira.json)
 * @returns The loaded Jira configuration
 * @throws Error if the config file cannot be read or parsed
 */
export function loadJiraConfig(configPath = "config/jira.json"): JiraConfig {
	try {
		const fullPath = path.resolve(process.cwd(), configPath);

		if (!fs.existsSync(fullPath)) {
			logger.warn(
				{ configPath: fullPath },
				"Jira config file not found, using defaults",
			);
			return getDefaultConfig();
		}

		const fileContent = fs.readFileSync(fullPath, "utf-8");
		const config = JSON.parse(fileContent) as JiraConfig;

		logger.debug(
			{
				configPath: fullPath,
				projectCount: Object.keys(config.projectLinks).length,
			},
			"Jira config loaded",
		);

		cachedConfig = config;
		return config;
	} catch (error) {
		logger.error(
			{ error, configPath },
			"Failed to load Jira config, using defaults",
		);
		return getDefaultConfig();
	}
}

/**
 * Get the cached Jira config or load it if not cached
 * @returns The Jira configuration
 */
export function getJiraConfig(): JiraConfig {
	if (!cachedConfig) {
		cachedConfig = loadJiraConfig();
	}
	return cachedConfig;
}

/**
 * Get default Jira configuration
 * @returns Default configuration
 */
function getDefaultConfig(): JiraConfig {
	return {
		projectLinks: {},
		settings: {
			autoCreateRemoteLinks: true,
			allowUnlinkedProjects: true,
		},
	};
}

/**
 * Get GitLab project URL for a Jira project key
 * @param jiraProjectKey - The Jira project key (e.g., "PROJ")
 * @returns The GitLab project API URL, or null if not found
 */
export function getGitLabProjectUrl(jiraProjectKey: string): string | null {
	const config = getJiraConfig();
	return config.projectLinks[jiraProjectKey] || null;
}

/**
 * Extract Jira project key from issue key
 * @param issueKey - The full issue key (e.g., "PROJ-123")
 * @returns The project key (e.g., "PROJ")
 */
export function extractProjectKey(issueKey: string): string {
	return issueKey.split("-")[0] ?? issueKey;
}

/**
 * Check if a Jira project is configured
 * @param jiraProjectKey - The Jira project key
 * @returns True if the project has a GitLab link configured
 */
export function isProjectConfigured(jiraProjectKey: string): boolean {
	const config = getJiraConfig();
	return jiraProjectKey in config.projectLinks;
}

/**
 * Reload the Jira configuration from disk
 * Useful for hot-reloading config without restarting the bot
 */
export function reloadJiraConfig(): JiraConfig {
	cachedConfig = null;
	return loadJiraConfig();
}
