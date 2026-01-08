import logger from "./logger.ts";

const GITLAB_TOKEN = process.env.GITLAB_TOKEN;
const GITLAB_API_URL =
	process.env.GITLAB_API_URL || "https://gitlab.com/api/v4";
const OPENCODE_PROVIDER = process.env.OPENCODE_PROVIDER;
const OPENCODE_MODEL = process.env.OPENCODE_MODEL;
const POLLING_INTERVAL_MS = parseInt(
	process.env.POLLING_INTERVAL_MS || "5000",
	10,
);
const OPENCODE_PORT_ENV = process.env.OPENCODE_PORT;
const OPENCODE_PORT = OPENCODE_PORT_ENV
	? parseInt(OPENCODE_PORT_ENV, 10)
	: Math.floor(10000 + Math.random() * 50000);

// Jira configuration
const JIRA_API_URL = process.env.JIRA_API_URL;
const JIRA_EMAIL = process.env.JIRA_EMAIL;
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;
const JIRA_POLLING_INTERVAL_MS = parseInt(
	process.env.JIRA_POLLING_INTERVAL_MS || "60000",
	10,
);
const JIRA_PROJECT_KEYS = process.env.JIRA_PROJECT_KEYS
	? process.env.JIRA_PROJECT_KEYS.split(",").map((key) => key.trim())
	: [];

// Validate required environment variables
const missingVars: string[] = [];

if (!GITLAB_TOKEN) {
	missingVars.push("GITLAB_TOKEN");
}
if (!OPENCODE_PROVIDER) {
	missingVars.push("OPENCODE_PROVIDER");
}
if (!OPENCODE_MODEL) {
	missingVars.push("OPENCODE_MODEL");
}

// Jira variables are optional - only validate if at least one is set
const hasAnyJiraVar = JIRA_API_URL || JIRA_EMAIL || JIRA_API_TOKEN;
if (hasAnyJiraVar) {
	if (!JIRA_API_URL) {
		missingVars.push("JIRA_API_URL");
	}
	if (!JIRA_EMAIL) {
		missingVars.push("JIRA_EMAIL");
	}
	if (!JIRA_API_TOKEN) {
		missingVars.push("JIRA_API_TOKEN");
	}
}

if (missingVars.length > 0) {
	logger.fatal({ missingVars }, "Missing required environment variables");
	process.exit(1);
}

// Create typed exports - TypeScript now knows these are not undefined
export const gitlabToken = GITLAB_TOKEN as string;
export const gitlabApiUrl = GITLAB_API_URL as string;
export const opencodeProvider = OPENCODE_PROVIDER as string;
export const opencodeModel = OPENCODE_MODEL as string;
export const pollingIntervalMs = POLLING_INTERVAL_MS;
export const opencodePort = OPENCODE_PORT;

// Jira exports (optional)
export const jiraApiUrl = JIRA_API_URL;
export const jiraEmail = JIRA_EMAIL;
export const jiraApiToken = JIRA_API_TOKEN;
export const jiraPollingIntervalMs = JIRA_POLLING_INTERVAL_MS;
export const jiraProjectKeys = JIRA_PROJECT_KEYS;
