/**
 * Test script for Jira integration
 * Tests the JiraClient methods: getCurrentUser, getMentions, getComments, addComment
 *
 * Usage:
 *   bun run scripts/test-jira.ts
 */

import { JiraClient } from "../lib/jira/jira-client.ts";
import {
	jiraApiToken,
	jiraApiUrl,
	jiraEmail,
	jiraProjectKeys,
} from "../lib/utils/env-vars.ts";
import logger from "../lib/utils/logger.ts";

async function testJiraIntegration(): Promise<void> {
	logger.info("Starting Jira integration test...");

	// Check if Jira is configured
	if (!jiraApiUrl || !jiraEmail || !jiraApiToken) {
		logger.error(
			"Jira not configured. Please set JIRA_API_URL, JIRA_EMAIL, and JIRA_API_TOKEN in .env",
		);
		process.exit(1);
	}

	const client = new JiraClient(jiraApiUrl, jiraEmail, jiraApiToken);

	try {
		// Test 1: Verify token and get current user
		logger.info("\n=== Test 1: Verify Token ===");
		const currentUser = await client.verifyToken();
		logger.info(
			{
				accountId: currentUser.accountId,
				displayName: currentUser.displayName,
				emailAddress: currentUser.emailAddress,
			},
			"Current user verified",
		);

		// Test 2: Get mentions
		logger.info("\n=== Test 2: Get Mentions ===");
		const mentions = await client.getMentions(jiraProjectKeys, "-30d");
		logger.info(
			{ count: mentions.length },
			`Found ${mentions.length} issue(s) where you were mentioned in the last 30 days`,
		);

		if (mentions.length > 0) {
			const firstMention = mentions[0];
			if (firstMention) {
				logger.info(
					{
						key: firstMention.key,
						summary: firstMention.fields.summary,
						status: firstMention.fields.status.name,
						updated: firstMention.fields.updated,
					},
					"First mention",
				);

				// Test 3: Get comments from the first mentioned issue
				logger.info(`\n=== Test 3: Get Comments from ${firstMention.key} ===`);
				const comments = await client.getComments(firstMention.key);
				logger.info({ count: comments.length }, "Comments retrieved");

				if (comments.length > 0) {
					const lastComment = comments[comments.length - 1];
					if (lastComment) {
						logger.info(
							{
								author: lastComment.author.displayName,
								created: lastComment.created,
							},
							"Last comment",
						);
					}
				}

				// Test 4: Add a test comment (optional - uncomment to test)
				// logger.info("\n=== Test 4: Add Comment ===");
				// const newComment = await client.addComment(firstMention.key, {
				// 	body: {
				// 		version: 1,
				// 		type: "doc",
				// 		content: [
				// 			{
				// 				type: "paragraph",
				// 				content: [
				// 					{
				// 						type: "text",
				// 						text: "🤖 Test comment from Bibus Jira integration",
				// 					},
				// 				],
				// 			},
				// 		],
				// 	},
				// });
				// logger.info({ commentId: newComment.id }, "Test comment added");
			}
		} else {
			logger.info(
				"No mentions found. Try mentioning yourself in a Jira comment or description!",
			);
		}

		logger.info("\n✅ All tests completed successfully!");
	} catch (error) {
		logger.error({ error }, "Test failed");
		process.exit(1);
	}
}

// Run the test
testJiraIntegration();
