# Jira Integration for Bibus

This module provides Jira Cloud integration for the Bibus bot, allowing it to detect mentions and interact with Jira issues.

## Features

- ✅ **Authenticate** with Jira Cloud API using email + API token (Basic Auth)
- ✅ **Detect mentions** using JQL: `comment ~ currentUser()` (works since July 2024!)
- ✅ **Get comments** from any issue
- ✅ **Add comments** to issues (with ADF support)
- ✅ **Update issues** (add labels, modify fields)

## Configuration

### Environment Variables

Add these to your `.env` file:

```bash
# Jira Configuration (optional)
ENABLE_JIRA=true
JIRA_API_URL=https://your-domain.atlassian.net
JIRA_EMAIL=your-email@example.com
JIRA_API_TOKEN=your_jira_api_token_here
JIRA_POLLING_INTERVAL_MS=60000  # Check every 60 seconds (default)
JIRA_PROJECT_KEYS=PROJ1,PROJ2   # Comma-separated project keys to monitor
```

### Getting a Jira API Token

1. Go to https://id.atlassian.com/manage-profile/security/api-tokens
2. Click "Create API token"
3. Give it a name (e.g., "Bibus Bot")
4. Set expiration (1-365 days)
5. Copy the token and save it securely (you can't view it again!)

**Note**: API tokens now expire by default (max 1 year). Plan for token rotation.

## Usage

### Basic Example

```typescript
import { JiraClient } from "./lib/jira/jira-client.ts";

const client = new JiraClient(
	"https://your-domain.atlassian.net",
	"you@example.com",
	"your_api_token"
);

// Verify token and get current user
const user = await client.verifyToken();
console.log(`Authenticated as: ${user.displayName}`);

// Search for mentions
const mentions = await client.getMentions(["PROJ1", "PROJ2"], "-5m");
console.log(`Found ${mentions.length} mentions in last 5 minutes`);

// Get comments from an issue
const comments = await client.getComments("PROJ-123");

// Add a comment
await client.addComment("PROJ-123", {
	body: {
		version: 1,
		type: "doc",
		content: [
			{
				type: "paragraph",
				content: [
					{
						type: "text",
						text: "Hello from Bibus! 👋",
					},
				],
			},
		],
	},
});

// Add a label to track issues
await client.addLabel("PROJ-123", "bibus-contacted");
```

### Testing

Run the test script to verify your Jira configuration:

```bash
bun run scripts/test-jira.ts
```

This will:
1. Verify your API token
2. Get your current user info
3. Search for issues where you're mentioned
4. Get comments from the first mentioned issue

## JQL Mention Detection

**As of July 2024**, Jira Cloud supports searching for mentions using JQL!

### How It Works

When someone mentions you (`@username`) in Jira, the system indexes your `accountId` in text fields. The `currentUser()` function in JQL searches for your account ID.

### Supported Queries

```jql
-- Search comments for mentions
comment ~ currentUser()

-- Search descriptions for mentions
description ~ currentUser()

-- Search all text fields
comment ~ currentUser() OR description ~ currentUser() OR summary ~ currentUser()

-- Filter by project and time
project IN (PROJ1, PROJ2) 
AND comment ~ currentUser() 
AND updated >= -5m
ORDER BY updated DESC
```

### Reference

- **Atlassian Ticket**: [JRACLOUD-27594](https://jira.atlassian.com/browse/JRACLOUD-27594) (Closed - Fixed July 2024)
- **Community Post**: [How to search for your @mentions with JQL](https://community.atlassian.com/t5/Jira-articles/How-to-search-for-your-mentions-with-JQL/ba-p/2771763)

## API Models

The Jira API models are defined in `jira-models.ts`:

- `JiraUser` - User representation
- `JiraIssue` - Issue (work item) representation
- `JiraComment` - Comment representation
- `ADF` - Atlassian Document Format (rich text)
- `JiraSearchResults` - JQL search results
- `JQLSearchParams` - Parameters for JQL queries
- `AddCommentParams` - Comment creation parameters
- `UpdateIssueParams` - Issue update parameters

## Authentication

Jira Cloud uses **Basic Auth** with email + API token:

```
Authorization: Basic base64(email:api_token)
```

The `JiraClient` handles this automatically in the `getAuthHeader()` method.

## Common Patterns

### Greeting New Issues

```typescript
// Search for new Bug/Task issues
const jql = `
  project IN (PROJ1, PROJ2) 
  AND type IN (Bug, Task)
  AND created >= -5m
  AND labels NOT IN (bibus-contacted)
`;

const results = await client.searchIssues({ jql });

for (const issue of results.issues) {
	// Post greeting
	await client.addComment(issue.key, {
		body: createGreetingADF(),
	});
	
	// Mark as contacted
	await client.addLabel(issue.key, "bibus-contacted");
}
```

### Responding to Mentions

```typescript
// Get issues where bot is mentioned
const mentions = await client.getMentions(["PROJ1"], "-5m");

for (const issue of mentions) {
	// Get recent comments
	const comments = await client.getComments(issue.key);
	
	// Find unprocessed comments with bot mention
	for (const comment of comments) {
		if (containsBotMention(comment.body) && !isProcessed(comment.id)) {
			// Extract command and execute
			const command = extractCommand(comment.body);
			await handleCommand(issue, command);
			
			// Mark as processed
			markAsProcessed(comment.id);
		}
	}
}
```

## Limitations

- **No webhook support**: Polling only (Jira webhooks require public endpoint)
- **Rate limits**: Jira Cloud has rate limits, be conservative with polling intervals
- **Token expiration**: API tokens expire (max 1 year), requires manual rotation
- **Mention detection**: Only works for Jira Cloud (not Server/Data Center)
- **Comment date filtering**: Cannot filter comments by creation date in JQL (see [JRACLOUD-35765](https://jira.atlassian.com/browse/JRACLOUD-35765))

## Best Practices

1. **Use labels** to track which issues Bibus has interacted with
2. **Poll conservatively** (default 60 seconds is reasonable)
3. **Cache user info** to reduce API calls
4. **Use JQL wisely** - filter by project and time to reduce results
5. **Handle rate limits** - implement exponential backoff if needed
6. **Log API calls** for debugging and monitoring
7. **Rotate tokens** before they expire (set calendar reminders!)

## Troubleshooting

### "Invalid Jira API token: 401 Unauthorized"

- Check that `JIRA_EMAIL` matches the account that created the API token
- Verify the API token hasn't expired
- Try creating a new API token

### "No mentions found"

- Make sure you've actually been mentioned in Jira (use `@username` in a comment)
- Check that `JIRA_PROJECT_KEYS` includes the project where you were mentioned
- Try increasing the time range (e.g., `-30d` instead of `-5m`)
- If still not working, contact Jira support for reindexing

### Rate Limiting

If you hit rate limits:
- Increase `JIRA_POLLING_INTERVAL_MS`
- Reduce the number of projects in `JIRA_PROJECT_KEYS`
- Implement exponential backoff in your polling logic

## References

- [Jira Cloud REST API v3 Documentation](https://developer.atlassian.com/cloud/jira/platform/rest/v3/)
- [JQL Fields Reference](https://support.atlassian.com/jira-software-cloud/docs/jql-fields/)
- [Atlassian Document Format (ADF)](https://developer.atlassian.com/cloud/jira/platform/apis/document/structure/)
- [Basic Auth for REST APIs](https://developer.atlassian.com/cloud/jira/platform/basic-auth-for-rest-apis/)
