/**
 * TypeScript interfaces for Jira Cloud REST API v3 responses
 * Based on: https://developer.atlassian.com/cloud/jira/platform/rest/v3/
 */

/**
 * Jira User representation
 */
export interface JiraUser {
	accountId: string;
	accountType: "atlassian" | "app" | "customer";
	active: boolean;
	avatarUrls: {
		"16x16": string;
		"24x24": string;
		"32x32": string;
		"48x48": string;
	};
	displayName: string;
	emailAddress?: string;
	self: string;
	timeZone?: string;
}

/**
 * Jira Issue (Work Item) representation
 */
export interface JiraIssue {
	id: string;
	key: string;
	self: string;
	fields: {
		summary: string;
		description?: ADF | string;
		issuetype: {
			id: string;
			name: string;
			description: string;
			iconUrl: string;
		};
		project: {
			id: string;
			key: string;
			name: string;
			self: string;
		};
		status: {
			id: string;
			name: string;
			description: string;
		};
		priority?: {
			id: string;
			name: string;
		};
		assignee?: JiraUser | null;
		reporter?: JiraUser;
		creator?: JiraUser;
		created: string;
		updated: string;
		comment?: {
			comments: JiraComment[];
			maxResults: number;
			total: number;
			startAt: number;
		};
		labels?: string[];
		[key: string]: unknown; // Allow for custom fields
	};
}

/**
 * Jira Comment representation
 */
export interface JiraComment {
	id: string;
	self: string;
	author: JiraUser;
	body: ADF | string;
	updateAuthor?: JiraUser;
	created: string;
	updated: string;
	visibility?: {
		type: "role" | "group";
		value: string;
	};
}

/**
 * Atlassian Document Format (ADF) - used for rich text in comments, descriptions, etc.
 * https://developer.atlassian.com/cloud/jira/platform/apis/document/structure/
 */
export interface ADF {
	version: 1;
	type: "doc";
	content: ADFNode[];
}

export interface ADFNode {
	type: string;
	content?: ADFNode[];
	attrs?: Record<string, unknown>;
	marks?: ADFMark[];
	text?: string;
}

export interface ADFMark {
	type: string;
	attrs?: Record<string, unknown>;
}

/**
 * Jira Search Results (from JQL queries)
 */
export interface JiraSearchResults {
	expand: string;
	startAt: number;
	maxResults: number;
	total: number;
	issues: JiraIssue[];
}

/**
 * Parameters for JQL search
 */
export interface JQLSearchParams {
	jql: string;
	startAt?: number;
	maxResults?: number;
	fields?: string[];
	expand?: string[];
	validateQuery?: "strict" | "warn" | "none";
}

/**
 * Parameters for adding a comment to an issue
 */
export interface AddCommentParams {
	body: ADF | string;
	visibility?: {
		type: "role" | "group";
		value: string;
	};
}

/**
 * Parameters for updating an issue
 */
export interface UpdateIssueParams {
	fields?: {
		labels?: string[];
		[key: string]: unknown;
	};
	update?: {
		labels?: Array<{ add?: string; remove?: string }>;
		[key: string]: unknown;
	};
}

/**
 * Parameters for creating a remote link on an issue
 */
export interface CreateRemoteLinkParams {
	url: string;
	title: string;
	summary?: string;
	icon?: {
		url16x16?: string;
		title?: string;
	};
	relationship?: string;
}

/**
 * Remote link representation
 */
export interface RemoteLink {
	id: number;
	self: string;
	globalId?: string;
	application?: {
		type: string;
		name: string;
	};
	object: {
		url: string;
		title: string;
		summary?: string;
		icon?: {
			url16x16?: string;
			title?: string;
		};
	};
}
