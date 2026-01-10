/**
 * Test script for processing Jira comments
 * Fetches a real Jira issue and simulates receiving a comment with your text
 *
 * Usage:
 *   bun run scripts/test-jira-comment.ts "PROJ-123" "analyze this bug"
 *   bun run scripts/test-jira-comment.ts "PROJ-456" "create an MR to fix this"
 *
 * The script will:
 * 1. Fetch the real Jira issue
 * 2. Create a simulated comment with your text (not posted to Jira)
 * 3. Process the comment through the bot's processMention() function
 * 4. Post the bot's response to the real Jira issue
 */

import { GitLabClient } from "../lib/gitlab/gitlab-client.ts";
import { JiraClient } from "../lib/jira/jira-client.ts";
import type {
	JiraComment,
	JiraIssue,
	JiraUser,
} from "../lib/jira/jira-models.ts";
import { createADFComment } from "../lib/jira/jira-utils.ts";
import { processMention } from "../lib/jira/jira-watcher.ts";
import { initializeGlobals } from "../lib/shared.ts";
import {
	gitlabApiUrl,
	gitlabToken,
	jiraApiToken,
	jiraApiUrl,
	jiraEmail,
} from "../lib/utils/env-vars.ts";

import logger from "../lib/utils/logger.ts";

// Check environment variables
if (!jiraApiUrl || !jiraEmail || !jiraApiToken) {
	logger.error(
		"Error: Jira not configured. Please set JIRA_API_URL, JIRA_EMAIL, and JIRA_API_TOKEN in .env",
	);
	process.exit(1);
}

if (!gitlabApiUrl || !gitlabToken) {
	logger.error(
		"Error: GitLab not configured. Please set GITLAB_API_URL and GITLAB_TOKEN in .env",
	);
	process.exit(1);
}

// Get test input
const rawIssueKey = process.argv[2];
const rawCommentText = process.argv[3];

if (!rawIssueKey || !rawCommentText) {
	logger.error("Error: Please provide both issue key and comment text");
	logger.error("");
	logger.error("Usage:");
	logger.error(
		'  bun run scripts/test-jira-comment.ts "PROJ-123" "analyze this bug"',
	);
	logger.error(
		'  bun run scripts/test-jira-comment.ts "PROJ-456" "create an MR to fix"',
	);
	logger.error("");
	logger.error("Arguments:");
	logger.error(
		"  1. Issue key - Jira issue to fetch (e.g. PROJ-123) [required]",
	);
	logger.error(
		'  2. Comment text - The message to process (e.g. "analyze this bug") [required]',
	);
	logger.error("");
	logger.error("Examples:");
	logger.error(
		'  bun run scripts/test-jira-comment.ts "MYPROJ-42" "analyze this bug"',
	);
	logger.error(
		'  bun run scripts/test-jira-comment.ts "BUG-100" "create an MR to fix"',
	);
	logger.error(
		'  bun run scripts/test-jira-comment.ts "DOCS-5" "what is the auth flow?"',
	);
	process.exit(1);
}

const testIssueKey: string = rawIssueKey;
const testCommentText: string = rawCommentText;

/**
 * Create a simulated comment with the provided text
 * Uses the current user's info for the comment author
 */
function createSimulatedComment(
	text: string,
	issueKey: string,
	currentUser: JiraUser,
): JiraComment {
	return {
		id: `test-comment-${Date.now()}`,
		author: currentUser,
		body: createADFComment(text),
		created: new Date().toISOString(),
		updated: new Date().toISOString(),
		self: `${jiraApiUrl}/rest/api/3/issue/${issueKey}/comment/test-comment-${Date.now()}`,
	};
}

/**
 * Main test function
 */
async function testJiraComment(): Promise<void> {
	logger.info("🚀 Starting Jira comment test...\n");
	logger.info(`Issue Key: ${testIssueKey}`);
	logger.info(`Comment Text: "${testCommentText}"`);
	logger.info("");

	// Initialize GitLab client
	if (!gitlabApiUrl || !gitlabToken) {
		throw new Error("GitLab credentials not available");
	}
	const gitlabClient = new GitLabClient(gitlabApiUrl, gitlabToken);

	// Create Jira client
	if (!jiraApiUrl || !jiraEmail || !jiraApiToken) {
		throw new Error("Jira credentials not available");
	}
	const jiraClient = new JiraClient(jiraApiUrl, jiraEmail, jiraApiToken);

	// Initialize global clients (required by jira-actions.ts)
	initializeGlobals(gitlabClient, jiraClient);

	// Verify Jira connection and get current user
	let currentUser: JiraUser;
	try {
		logger.info("📋 Step 1: Verifying Jira connection...");
		currentUser = await jiraClient.verifyToken();
		logger.info(
			{
				displayName: currentUser.displayName,
				email: currentUser.emailAddress,
			},
			"   ✓ Connected to Jira",
		);
		logger.info("");
	} catch (error) {
		logger.error({ error }, "Failed to connect to Jira");
		process.exit(1);
	}

	// Fetch the real Jira issue
	let realIssue: JiraIssue;
	try {
		logger.info(`📥 Step 2: Fetching real Jira issue ${testIssueKey}...`);
		const searchResults = await jiraClient.searchIssues({
			jql: `key = ${testIssueKey}`,
			maxResults: 1,
		});

		if (searchResults.issues.length === 0) {
			logger.error(`   ✗ Issue ${testIssueKey} not found`);
			logger.error("");
			logger.error("Please provide a valid Jira issue key that exists");
			process.exit(1);
		}

		realIssue = searchResults.issues[0] as JiraIssue;
		logger.info(`   ✓ Issue found: ${realIssue.fields.summary}`);
		logger.info(
			`   ✓ Type: ${realIssue.fields.issuetype.name} | Status: ${realIssue.fields.status.name}`,
		);
		logger.info("");
	} catch (error) {
		logger.error({ error }, `Failed to fetch issue ${testIssueKey}`);
		process.exit(1);
	}

	// Create simulated comment
	logger.info("📝 Step 3: Creating simulated comment...");
	const simulatedComment = createSimulatedComment(
		testCommentText,
		testIssueKey,
		currentUser,
	);
	logger.info(`   ✓ Simulated comment created with text: "${testCommentText}"`);
	logger.info(`   ✓ Comment author: ${currentUser.displayName}`);
	logger.info(
		"   ✓ Note: This comment is NOT posted to Jira, only simulated\n",
	);

	// Process the comment using the actual processMention function
	logger.info("🤖 Step 4: Processing comment as bot mention...");
	logger.info(
		"   Note: Using the actual processMention() function from jira-watcher.ts",
	);
	logger.info(
		"   Note: Bot responses WILL be posted to the actual Jira issue\n",
	);

	try {
		await processMention(jiraClient, realIssue, simulatedComment);
	} catch (error) {
		logger.error({ error }, "Error during processing");
		process.exit(1);
	}

	logger.info("\n✅ Test completed successfully!\n");
	logger.info("📊 Summary:");
	logger.info(`   - Issue: ${testIssueKey} - ${realIssue.fields.summary}`);
	logger.info(`   - Simulated comment text: "${testCommentText}"`);
	logger.info(`   - Comment author: ${currentUser.displayName}`);
	logger.info(
		"   - Bot responses were posted to the Jira issue (check the issue in Jira)\n",
	);
}

// Run the test
testJiraComment();
