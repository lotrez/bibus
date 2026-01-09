import type { JiraClient } from "../jira/jira-client.ts";
import type { JiraIssue } from "../jira/jira-models.ts";
import logger from "../utils/logger.ts";
import { createClient, promptAndWaitForResponse } from "./opencode-helper.ts";

/**
 * Analyze a bug from a Jira issue using AI
 * @param jiraClient - The Jira API client
 * @param jiraIssue - The Jira issue containing the bug to analyze
 * @param clonePath - Path to the cloned repository
 * @param projectId - GitLab project ID
 * @param projectPath - GitLab project path (e.g., "namespace/project")
 * @returns Analysis summary from the AI
 */
export async function analyzeBug(
	_jiraClient: JiraClient,
	jiraIssue: JiraIssue,
	clonePath: string,
	projectId: string | number,
	projectPath: string,
): Promise<string> {
	logger.info(
		{
			issueKey: jiraIssue.key,
			projectId,
			clonePath,
		},
		"Analyzing bug from Jira issue",
	);

	// Create OpenCode client for AI assistance
	const { client: opencodeClient } = await createClient(clonePath);

	try {
		// Extract bug information from Jira issue
		const bugDescription = `
Issue: ${jiraIssue.fields.summary}
Description: ${jiraIssue.fields.description || "No description provided"}
Status: ${jiraIssue.fields.status.name}
Priority: ${jiraIssue.fields.priority?.name || "Not set"}
Reporter: ${jiraIssue.fields.reporter?.displayName || "Unknown"}
`;

		// Build the analysis prompt
		const analysisPrompt = `You are analyzing a bug reported in Jira issue ${jiraIssue.key}.

${bugDescription}

Please analyze this bug by:
1. Understanding what the bug is about
2. Searching through the codebase to find relevant files
3. Identifying potential root causes
4. Explaining what might be causing the issue
5. Suggesting areas to investigate further

Provide a detailed analysis that helps understand the bug better.

Work in the current directory: ${clonePath}
Project: ${projectPath}`;

		logger.info({ issueKey: jiraIssue.key }, "Requesting AI bug analysis");

		const analysis = await promptAndWaitForResponse(
			opencodeClient,
			analysisPrompt,
		);

		logger.info(
			{ issueKey: jiraIssue.key },
			"Bug analysis completed successfully",
		);

		// Format the response
		const formattedAnalysis = `# Bug Analysis for ${jiraIssue.key}

## Issue Summary
${jiraIssue.fields.summary}

## Analysis
${analysis}

---
*Analysis provided by Bibus bot*`;

		return formattedAnalysis;
	} catch (error) {
		logger.error({ error, issueKey: jiraIssue.key }, "Failed to analyze bug");
		throw error;
	}
}
