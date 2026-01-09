import logger from "../utils/logger.ts";
import type {
	AddCommentParams,
	CreateRemoteLinkParams,
	JiraComment,
	JiraIssue,
	JiraSearchResults,
	JiraUser,
	JQLSearchParams,
	RemoteLink,
	UpdateIssueParams,
} from "./jira-models.ts";

export class JiraClient {
	private email: string;
	private apiToken: string;
	private apiUrl: string;
	private currentUserCache: JiraUser | null = null;

	constructor(apiUrl: string, email: string, apiToken: string) {
		this.apiUrl = apiUrl;
		this.email = email;
		this.apiToken = apiToken;
	}

	/**
	 * Get authorization header for Jira API requests
	 * Jira uses Basic Auth with email:apiToken encoded in base64
	 * @returns Authorization header value
	 */
	private getAuthHeader(): string {
		const credentials = `${this.email}:${this.apiToken}`;
		const encoded = Buffer.from(credentials).toString("base64");
		return `Basic ${encoded}`;
	}

	/**
	 * Verify the API token by fetching current user information
	 * @returns The current user's information
	 * @throws Error if the token is invalid or the request fails
	 */
	async verifyToken(): Promise<JiraUser> {
		logger.debug("Verifying Jira API token...");

		const response = await fetch(`${this.apiUrl}/rest/api/3/myself`, {
			method: "GET",
			headers: {
				Authorization: this.getAuthHeader(),
				Accept: "application/json",
			},
		});

		if (!response.ok) {
			if (response.status === 401) {
				logger.error("Invalid Jira API token: 401 Unauthorized");
				throw new Error("Invalid Jira API token: 401 Unauthorized");
			}
			const errorText = await response.text();
			logger.error(
				{
					status: response.status,
					statusText: response.statusText,
					error: errorText,
				},
				"Failed to verify Jira token",
			);
			throw new Error(
				`Failed to verify Jira token: ${response.status} ${response.statusText}`,
			);
		}

		const data = (await response.json()) as JiraUser;
		logger.debug(
			{
				accountId: data.accountId,
				displayName: data.displayName,
				emailAddress: data.emailAddress,
			},
			"Jira API token is valid",
		);

		return data;
	}

	/**
	 * Get the current user information (cached after first call)
	 * @param forceRefresh - If true, bypass cache and fetch fresh data
	 * @returns The current user's information
	 * @throws Error if the request fails
	 */
	async getCurrentUser(forceRefresh = false): Promise<JiraUser> {
		// Return cached data if available and not forcing refresh
		if (this.currentUserCache && !forceRefresh) {
			logger.trace({ cached: true }, "Returning cached Jira user info");
			return this.currentUserCache;
		}

		logger.debug("Fetching current Jira user info...");

		const response = await fetch(`${this.apiUrl}/rest/api/3/myself`, {
			method: "GET",
			headers: {
				Authorization: this.getAuthHeader(),
				Accept: "application/json",
			},
		});

		if (!response.ok) {
			const errorText = await response.text();
			logger.error(
				{ status: response.status, error: errorText },
				"Failed to get current Jira user",
			);
			throw new Error(
				`Failed to get current user: ${response.status} ${response.statusText}`,
			);
		}

		const data = (await response.json()) as JiraUser;

		// Cache the user data
		this.currentUserCache = data;

		logger.debug(
			{
				accountId: data.accountId,
				displayName: data.displayName,
			},
			"Current Jira user retrieved",
		);

		return data;
	}

	/**
	 * Search for issues using JQL (Jira Query Language)
	 * @param params - JQL search parameters
	 * @returns Search results with issues
	 * @throws Error if the request fails
	 */
	async searchIssues(params: JQLSearchParams): Promise<JiraSearchResults> {
		const {
			jql,
			startAt = 0,
			maxResults = 50,
			fields = ["*all"],
			expand = [],
			validateQuery = "warn",
		} = params;

		logger.trace(
			{ jql, startAt, maxResults },
			"Searching Jira issues with JQL",
		);

		const queryParams = new URLSearchParams({
			jql,
			startAt: startAt.toString(),
			maxResults: maxResults.toString(),
			validateQuery,
		});

		if (fields.length > 0) {
			queryParams.append("fields", fields.join(","));
		}

		if (expand.length > 0) {
			queryParams.append("expand", expand.join(","));
		}

		const response = await fetch(
			`${this.apiUrl}/rest/api/3/search/jql?${queryParams}`,
			{
				method: "GET",
				headers: {
					Authorization: this.getAuthHeader(),
					Accept: "application/json",
				},
			},
		);

		if (!response.ok) {
			const errorText = await response.text();
			logger.error(
				{ status: response.status, error: errorText, jql },
				"Failed to search Jira issues",
			);
			throw new Error(
				`Failed to search issues: ${response.status} ${response.statusText}`,
			);
		}

		const data = (await response.json()) as JiraSearchResults;

		logger.trace(
			{
				total: data.total,
				returned: data.issues.length,
				startAt: data.startAt,
			},
			"Jira search completed",
		);

		return data;
	}

	/**
	 * Search for issues where the current user is mentioned
	 * Uses JQL: comment ~ currentUser() OR description ~ currentUser() OR summary ~ currentUser()
	 * @param projectKeys - Optional array of project keys to filter by
	 * @param updatedSince - Optional date string to filter by updated time (e.g., "-5m" for last 5 minutes)
	 * @returns Issues where the current user is mentioned
	 */
	async getMentions(
		projectKeys?: string[],
		updatedSince?: string,
	): Promise<JiraIssue[]> {
		let jql =
			"comment ~ currentUser() OR description ~ currentUser() OR summary ~ currentUser()";

		if (projectKeys && projectKeys.length > 0) {
			jql = `project IN (${projectKeys.join(",")}) AND (${jql})`;
		}

		if (updatedSince) {
			jql = `${jql} AND updated >= ${updatedSince}`;
		}

		jql += " ORDER BY updated DESC";

		logger.trace({ jql }, "Searching for mentions");

		const results = await this.searchIssues({
			jql,
			maxResults: 50,
			expand: ["renderedFields"],
		});

		return results.issues;
	}

	/**
	 * Get comments for an issue
	 * @param issueKey - The issue key (e.g., "PROJ-123")
	 * @returns Array of comments
	 * @throws Error if the request fails
	 */
	async getComments(issueKey: string): Promise<JiraComment[]> {
		logger.trace({ issueKey }, "Fetching comments for issue");

		const response = await fetch(
			`${this.apiUrl}/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment`,
			{
				method: "GET",
				headers: {
					Authorization: this.getAuthHeader(),
					Accept: "application/json",
				},
			},
		);

		if (!response.ok) {
			const errorText = await response.text();
			logger.error(
				{ status: response.status, error: errorText, issueKey },
				"Failed to get comments",
			);
			throw new Error(
				`Failed to get comments: ${response.status} ${response.statusText}`,
			);
		}

		const data = (await response.json()) as {
			comments: JiraComment[];
			maxResults: number;
			total: number;
			startAt: number;
		};

		logger.trace(
			{ issueKey, commentCount: data.comments.length },
			"Comments retrieved",
		);

		return data.comments;
	}

	/**
	 * Add a comment to an issue
	 * @param issueKey - The issue key (e.g., "PROJ-123")
	 * @param params - Comment parameters (body and optional visibility)
	 * @returns The created comment
	 * @throws Error if the request fails
	 */
	async addComment(
		issueKey: string,
		params: AddCommentParams,
	): Promise<JiraComment> {
		logger.debug({ issueKey }, "Adding comment to issue");

		const response = await fetch(
			`${this.apiUrl}/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment`,
			{
				method: "POST",
				headers: {
					Authorization: this.getAuthHeader(),
					Accept: "application/json",
					"Content-Type": "application/json",
				},
				body: JSON.stringify(params),
			},
		);

		if (!response.ok) {
			const errorText = await response.text();
			logger.error(
				{ status: response.status, error: errorText, issueKey },
				"Failed to add comment",
			);
			throw new Error(
				`Failed to add comment: ${response.status} ${response.statusText}`,
			);
		}

		const data = (await response.json()) as JiraComment;

		logger.info({ issueKey, commentId: data.id }, "Comment added successfully");

		return data;
	}

	/**
	 * Update an issue (e.g., add labels)
	 * @param issueKey - The issue key (e.g., "PROJ-123")
	 * @param params - Update parameters
	 * @throws Error if the request fails
	 */
	async updateIssue(
		issueKey: string,
		params: UpdateIssueParams,
	): Promise<void> {
		logger.debug({ issueKey, params }, "Updating issue");

		const response = await fetch(
			`${this.apiUrl}/rest/api/3/issue/${encodeURIComponent(issueKey)}`,
			{
				method: "PUT",
				headers: {
					Authorization: this.getAuthHeader(),
					Accept: "application/json",
					"Content-Type": "application/json",
				},
				body: JSON.stringify(params),
			},
		);

		if (!response.ok) {
			const errorText = await response.text();
			logger.error(
				{ status: response.status, error: errorText, issueKey },
				"Failed to update issue",
			);
			throw new Error(
				`Failed to update issue: ${response.status} ${response.statusText}`,
			);
		}

		logger.info({ issueKey }, "Issue updated successfully");
	}

	/**
	 * Add a label to an issue
	 * @param issueKey - The issue key (e.g., "PROJ-123")
	 * @param label - The label to add
	 */
	async addLabel(issueKey: string, label: string): Promise<void> {
		logger.debug({ issueKey, label }, "Adding label to issue");

		await this.updateIssue(issueKey, {
			update: {
				labels: [{ add: label }],
			},
		});

		logger.info({ issueKey, label }, "Label added successfully");
	}

	/**
	 * Create a remote link on an issue (e.g., link to GitLab MR)
	 * @param issueKey - The issue key (e.g., "PROJ-123")
	 * @param params - Remote link parameters
	 * @returns The created remote link
	 * @throws Error if the request fails
	 */
	async createRemoteLink(
		issueKey: string,
		params: CreateRemoteLinkParams,
	): Promise<RemoteLink> {
		logger.debug({ issueKey, url: params.url }, "Creating remote link");

		const requestBody = {
			object: {
				url: params.url,
				title: params.title,
				summary: params.summary,
				icon: params.icon,
			},
			relationship: params.relationship || "relates to",
		};

		const response = await fetch(
			`${this.apiUrl}/rest/api/3/issue/${encodeURIComponent(issueKey)}/remotelink`,
			{
				method: "POST",
				headers: {
					Authorization: this.getAuthHeader(),
					Accept: "application/json",
					"Content-Type": "application/json",
				},
				body: JSON.stringify(requestBody),
			},
		);

		if (!response.ok) {
			const errorText = await response.text();
			logger.error(
				{ status: response.status, error: errorText, issueKey },
				"Failed to create remote link",
			);
			throw new Error(
				`Failed to create remote link: ${response.status} ${response.statusText}`,
			);
		}

		const data = (await response.json()) as RemoteLink;

		logger.info(
			{ issueKey, linkId: data.id, url: params.url },
			"Remote link created successfully",
		);

		return data;
	}
}
