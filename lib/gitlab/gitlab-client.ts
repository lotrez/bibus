import { gitlabApiUrl, gitlabToken } from "../utils/env-vars";
import logger from "../utils/logger";
import type {
	AddDiscussionNoteParams,
	CreateMergeRequestDiscussionParams,
	CreateMergeRequestNoteParams,
	CurrentUser,
	Discussion,
	DiscussionNote,
	GetTodosParams,
	MergeRequestDiff,
	MergeRequestNote,
	MergeRequestVersion,
	ModifyUserParams,
	PersonalAccessToken,
	Project,
	Todo,
	UpdateMergeRequestNoteParams,
} from "./gitlab-models";

export class GitLabClient {
	private token: string;
	private apiUrl: string;
	private currentUserCache: CurrentUser | null = null;

	constructor(apiUrl?: string, token?: string) {
		this.token = token ?? gitlabToken;
		this.apiUrl = apiUrl ?? gitlabApiUrl;
	}

	/**
	 * Verify the personal access token by fetching its details
	 * @returns The personal access token information
	 * @throws Error if the token is invalid or the request fails
	 */
	async verifyToken(): Promise<PersonalAccessToken> {
		logger.debug("Verifying GitLab token...");

		const response = await fetch(`${this.apiUrl}/personal_access_tokens/self`, {
			method: "GET",
			headers: {
				"PRIVATE-TOKEN": this.token,
			},
		});

		if (!response.ok) {
			if (response.status === 401) {
				logger.error("Invalid GitLab token: 401 Unauthorized");
				throw new Error("Invalid GitLab token: 401 Unauthorized");
			}
			logger.error(
				{ status: response.status, statusText: response.statusText },
				"Failed to verify token",
			);
			throw new Error(
				`Failed to verify token: ${response.status} ${response.statusText}`,
			);
		}

		const data = (await response.json()) as PersonalAccessToken;
		logger.debug(
			{
				tokenId: data.id,
				name: data.name,
				scopes: data.scopes,
				active: data.active,
			},
			"GitLab token is valid",
		);

		return data;
	}

	/**
	 * Get the current user information (cached after first call)
	 * @param forceRefresh - If true, bypass cache and fetch fresh data
	 * @returns The current user's information
	 * @throws Error if the request fails
	 */
	async getCurrentUser(forceRefresh = false): Promise<CurrentUser> {
		// Return cached data if available and not forcing refresh
		if (this.currentUserCache && !forceRefresh) {
			logger.trace({ cached: true }, "Returning cached user info");
			return this.currentUserCache;
		}

		logger.debug("Fetching current user info...");

		const response = await fetch(`${this.apiUrl}/user`, {
			method: "GET",
			headers: {
				"PRIVATE-TOKEN": this.token,
			},
		});

		if (!response.ok) {
			if (response.status === 401) {
				logger.error("Invalid GitLab token: 401 Unauthorized");
				throw new Error("Invalid GitLab token: 401 Unauthorized");
			}
			logger.error(
				{ status: response.status, statusText: response.statusText },
				"Failed to fetch current user",
			);
			throw new Error(
				`Failed to fetch current user: ${response.status} ${response.statusText}`,
			);
		}

		const data = (await response.json()) as CurrentUser;
		this.currentUserCache = data;

		logger.debug(
			{ userId: data.id, username: data.username, bot: data.bot },
			"Current user info retrieved",
		);

		return this.currentUserCache;
	}

	/**
	 * Get a list of to-do items
	 * @param params - Optional parameters to filter the to-do items
	 * @returns Array of to-do items
	 * @throws Error if the request fails
	 */
	async getTodos(params?: GetTodosParams): Promise<Todo[]> {
		const queryParams = new URLSearchParams();

		if (params) {
			if (params.action) queryParams.append("action", params.action);
			if (params.author_id)
				queryParams.append("author_id", params.author_id.toString());
			if (params.project_id)
				queryParams.append("project_id", params.project_id.toString());
			if (params.group_id)
				queryParams.append("group_id", params.group_id.toString());
			if (params.state) queryParams.append("state", params.state);
			if (params.type) queryParams.append("type", params.type);
		}

		const url = `${this.apiUrl}/todos${queryParams.toString() ? `?${queryParams.toString()}` : ""}`;

		const response = await fetch(url, {
			method: "GET",
			headers: {
				"PRIVATE-TOKEN": this.token,
			},
		});

		if (!response.ok) {
			if (response.status === 401) {
				throw new Error("Invalid GitLab token: 401 Unauthorized");
			}
			throw new Error(
				`Failed to fetch todos: ${response.status} ${response.statusText}`,
			);
		}

		const data = await response.json();
		return data as Todo[];
	}

	/**
	 * Get to-do items where you were directly addressed
	 * @returns Array of to-do items where action is "directly_addressed"
	 * @throws Error if the request fails
	 */
	async getDirectlyAddressedTodos(): Promise<Todo[]> {
		return this.getTodos({ action: "directly_addressed" });
	}

	/**
	 * Get a project by ID or path
	 * @param projectId - The project ID or URL-encoded path (e.g., "namespace/project")
	 * @returns The project information
	 * @throws Error if the request fails
	 */
	async getProject(projectId: string | number): Promise<Project> {
		const encodedId = encodeURIComponent(projectId);
		const response = await fetch(`${this.apiUrl}/projects/${encodedId}`, {
			method: "GET",
			headers: {
				"PRIVATE-TOKEN": this.token,
			},
		});

		if (!response.ok) {
			if (response.status === 401) {
				throw new Error("Invalid GitLab token: 401 Unauthorized");
			}
			if (response.status === 404) {
				throw new Error(`Project not found: ${projectId}`);
			}
			throw new Error(
				`Failed to fetch project: ${response.status} ${response.statusText}`,
			);
		}

		const data = await response.json();
		return data as Project;
	}

	/**
	 * Create a note (comment) on a merge request
	 * @param projectId - The project ID or URL-encoded path
	 * @param mergeRequestIid - The IID of the merge request
	 * @param params - The note parameters
	 * @returns The created note
	 * @throws Error if the request fails
	 */
	async createMergeRequestNote(
		projectId: string | number,
		mergeRequestIid: number,
		params: CreateMergeRequestNoteParams,
	): Promise<MergeRequestNote> {
		const encodedId = encodeURIComponent(projectId);

		logger.debug(
			{ projectId, mergeRequestIid, bodyLength: params.body.length },
			"Creating merge request note",
		);

		const response = await fetch(
			`${this.apiUrl}/projects/${encodedId}/merge_requests/${mergeRequestIid}/notes`,
			{
				method: "POST",
				headers: {
					"PRIVATE-TOKEN": this.token,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(params),
			},
		);

		if (!response.ok) {
			if (response.status === 401) {
				logger.error("Invalid GitLab token: 401 Unauthorized");
				throw new Error("Invalid GitLab token: 401 Unauthorized");
			}
			if (response.status === 404) {
				logger.error({ projectId, mergeRequestIid }, "Project or MR not found");
				throw new Error(
					`Project or merge request not found: ${projectId}/!${mergeRequestIid}`,
				);
			}
			const errorText = await response.text();
			logger.error(
				{ status: response.status, error: errorText },
				"Failed to create merge request note",
			);
			throw new Error(
				`Failed to create merge request note: ${response.status} ${response.statusText}\n${errorText}`,
			);
		}

		const data = (await response.json()) as MergeRequestNote;
		logger.info(
			{ projectId, mergeRequestIid, noteId: data.id },
			"Merge request note created",
		);

		return data;
	}

	/**
	 * Update an existing note (comment) on a merge request
	 * @param projectId - The project ID or URL-encoded path
	 * @param mergeRequestIid - The IID of the merge request
	 * @param noteId - The ID of the note to update
	 * @param params - The updated note parameters
	 * @returns The updated note
	 * @throws Error if the request fails
	 */
	async updateMergeRequestNote(
		projectId: string | number,
		mergeRequestIid: number,
		noteId: number,
		params: UpdateMergeRequestNoteParams,
	): Promise<MergeRequestNote> {
		const encodedId = encodeURIComponent(projectId);

		logger.debug(
			{ projectId, mergeRequestIid, noteId, bodyLength: params.body.length },
			"Updating merge request note",
		);

		const response = await fetch(
			`${this.apiUrl}/projects/${encodedId}/merge_requests/${mergeRequestIid}/notes/${noteId}`,
			{
				method: "PUT",
				headers: {
					"PRIVATE-TOKEN": this.token,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(params),
			},
		);

		if (!response.ok) {
			if (response.status === 401) {
				logger.error("Invalid GitLab token: 401 Unauthorized");
				throw new Error("Invalid GitLab token: 401 Unauthorized");
			}
			if (response.status === 404) {
				logger.error(
					{ projectId, mergeRequestIid, noteId },
					"Project, MR, or note not found",
				);
				throw new Error(
					`Project, merge request, or note not found: ${projectId}/!${mergeRequestIid}/notes/${noteId}`,
				);
			}
			const errorText = await response.text();
			logger.error(
				{ status: response.status, error: errorText },
				"Failed to update merge request note",
			);
			throw new Error(
				`Failed to update merge request note: ${response.status} ${response.statusText}\n${errorText}`,
			);
		}

		const data = (await response.json()) as MergeRequestNote;
		logger.info(
			{ projectId, mergeRequestIid, noteId },
			"Merge request note updated",
		);

		return data;
	}

	/**
	 * Modify the current user's profile
	 * @param params - The user parameters to update
	 * @returns The updated user information
	 * @throws Error if the request fails
	 */
	async modifyCurrentUser(params: ModifyUserParams): Promise<CurrentUser> {
		const currentUser = await this.getCurrentUser();

		logger.debug(
			{ userId: currentUser.id, paramKeys: Object.keys(params) },
			"Modifying current user profile",
		);

		const response = await fetch(`${this.apiUrl}/users/${currentUser.id}`, {
			method: "PUT",
			headers: {
				"PRIVATE-TOKEN": this.token,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(params),
		});

		if (!response.ok) {
			if (response.status === 401) {
				logger.error("Invalid GitLab token: 401 Unauthorized");
				throw new Error("Invalid GitLab token: 401 Unauthorized");
			}
			if (response.status === 404) {
				logger.error({ userId: currentUser.id }, "User not found");
				throw new Error(`User not found: ${currentUser.id}`);
			}
			const errorText = await response.text();
			logger.error(
				{ status: response.status, error: errorText },
				"Failed to modify user profile",
			);
			throw new Error(
				`Failed to modify user profile: ${response.status} ${response.statusText}\n${errorText}`,
			);
		}

		const data = (await response.json()) as CurrentUser;
		// Clear the cache so next call to getCurrentUser() fetches fresh data
		this.currentUserCache = data;

		logger.info({ userId: data.id }, "User profile updated");

		return data;
	}

	/**
	 * Upload an avatar for the current user
	 * @param avatarPath - The file path to the avatar image (must be ≤200 KB, one of: .bmp, .gif, .ico, .jpeg, .png, .tiff)
	 * @returns Object containing the new avatar URL
	 * @throws Error if the request fails or file is too large/wrong format
	 */
	async uploadCurrentUserAvatar(
		avatarPath: string,
	): Promise<{ avatar_url: string }> {
		logger.debug({ avatarPath }, "Uploading avatar for current user");

		// Create FormData to upload file
		const formData = new FormData();
		const file = Bun.file(avatarPath);

		// Check if file exists
		if (!(await file.exists())) {
			logger.error({ avatarPath }, "Avatar file not found");
			throw new Error(`Avatar file not found: ${avatarPath}`);
		}

		formData.append("avatar", file);

		const response = await fetch(`${this.apiUrl}/user/avatar`, {
			method: "PUT",
			headers: {
				"PRIVATE-TOKEN": this.token,
			},
			body: formData,
		});

		if (!response.ok) {
			if (response.status === 401) {
				logger.error("Invalid GitLab token: 401 Unauthorized");
				throw new Error("Invalid GitLab token: 401 Unauthorized");
			}
			if (response.status === 400) {
				const errorText = await response.text();
				logger.error(
					{ error: errorText },
					"Bad request - check file size/format",
				);
				throw new Error(
					`Bad request - file must be ≤200 KB and one of: .bmp, .gif, .ico, .jpeg, .png, .tiff\n${errorText}`,
				);
			}
			const errorText = await response.text();
			logger.error(
				{ status: response.status, error: errorText },
				"Failed to upload avatar",
			);
			throw new Error(
				`Failed to upload avatar: ${response.status} ${response.statusText}\n${errorText}`,
			);
		}

		const data = (await response.json()) as { avatar_url: string };
		logger.info({ avatarUrl: data.avatar_url }, "Avatar uploaded successfully");

		return data;
	}

	/**
	 * Get merge request diff versions
	 * @param projectId - The project ID or URL-encoded path
	 * @param mergeRequestIid - The IID of the merge request
	 * @returns Array of merge request versions
	 * @throws Error if the request fails
	 */
	async getMergeRequestVersions(
		projectId: string | number,
		mergeRequestIid: number,
	): Promise<MergeRequestVersion[]> {
		const encodedId = encodeURIComponent(projectId);

		logger.debug(
			{ projectId, mergeRequestIid },
			"Fetching merge request versions",
		);

		const response = await fetch(
			`${this.apiUrl}/projects/${encodedId}/merge_requests/${mergeRequestIid}/versions`,
			{
				method: "GET",
				headers: {
					"PRIVATE-TOKEN": this.token,
				},
			},
		);

		if (!response.ok) {
			if (response.status === 401) {
				logger.error("Invalid GitLab token: 401 Unauthorized");
				throw new Error("Invalid GitLab token: 401 Unauthorized");
			}
			if (response.status === 404) {
				logger.error({ projectId, mergeRequestIid }, "Project or MR not found");
				throw new Error(
					`Project or merge request not found: ${projectId}/!${mergeRequestIid}`,
				);
			}
			const errorText = await response.text();
			logger.error(
				{ status: response.status, error: errorText },
				"Failed to fetch merge request versions",
			);
			throw new Error(
				`Failed to fetch merge request versions: ${response.status} ${response.statusText}\n${errorText}`,
			);
		}

		const data = (await response.json()) as MergeRequestVersion[];
		logger.debug(
			{ projectId, mergeRequestIid, versionCount: data.length },
			"Merge request versions retrieved",
		);

		return data;
	}

	/**
	 * Get merge request diff with line codes
	 * @param projectId - The project ID or URL-encoded path
	 * @param mergeRequestIid - The IID of the merge request
	 * @param versionId - Optional version ID (defaults to latest)
	 * @returns The merge request diff with line codes
	 * @throws Error if the request fails
	 */
	async getMergeRequestDiff(
		projectId: string | number,
		mergeRequestIid: number,
		versionId?: number,
	): Promise<MergeRequestDiff> {
		const encodedId = encodeURIComponent(projectId);

		let url = `${this.apiUrl}/projects/${encodedId}/merge_requests/${mergeRequestIid}/versions`;

		// If specific version requested, use it; otherwise get the latest (first in array)
		if (versionId) {
			url += `/${versionId}`;
		}

		logger.debug(
			{ projectId, mergeRequestIid, versionId },
			"Fetching merge request diff",
		);

		const response = await fetch(url, {
			method: "GET",
			headers: {
				"PRIVATE-TOKEN": this.token,
			},
		});

		if (!response.ok) {
			if (response.status === 401) {
				logger.error("Invalid GitLab token: 401 Unauthorized");
				throw new Error("Invalid GitLab token: 401 Unauthorized");
			}
			if (response.status === 404) {
				logger.error({ projectId, mergeRequestIid }, "Project or MR not found");
				throw new Error(
					`Project or merge request not found: ${projectId}/!${mergeRequestIid}`,
				);
			}
			const errorText = await response.text();
			logger.error(
				{ status: response.status, error: errorText },
				"Failed to fetch merge request diff",
			);
			throw new Error(
				`Failed to fetch merge request diff: ${response.status} ${response.statusText}\n${errorText}`,
			);
		}

		// If we didn't specify versionId, we get an array, take the first one
		const data = (await response.json()) as
			| MergeRequestDiff
			| MergeRequestDiff[];
		const diff = versionId
			? (data as MergeRequestDiff)
			: (data as MergeRequestDiff[])[0];

		if (!diff) {
			throw new Error("No diff versions found");
		}

		logger.debug(
			{
				projectId,
				mergeRequestIid,
				diffId: diff.id,
				fileCount: diff.diffs?.length || 0,
			},
			"Merge request diff retrieved",
		);

		return diff;
	}

	/**
	 * Create a discussion (thread) on a merge request
	 * @param projectId - The project ID or URL-encoded path
	 * @param mergeRequestIid - The IID of the merge request
	 * @param params - The discussion parameters
	 * @returns The created discussion
	 * @throws Error if the request fails
	 */
	async createMergeRequestDiscussion(
		projectId: string | number,
		mergeRequestIid: number,
		params: CreateMergeRequestDiscussionParams,
	): Promise<Discussion> {
		const encodedId = encodeURIComponent(projectId);

		logger.debug(
			{ projectId, mergeRequestIid, bodyLength: params.body.length },
			"Creating merge request discussion",
		);

		const response = await fetch(
			`${this.apiUrl}/projects/${encodedId}/merge_requests/${mergeRequestIid}/discussions`,
			{
				method: "POST",
				headers: {
					"PRIVATE-TOKEN": this.token,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(params),
			},
		);

		if (!response.ok) {
			if (response.status === 401) {
				logger.error("Invalid GitLab token: 401 Unauthorized");
				throw new Error("Invalid GitLab token: 401 Unauthorized");
			}
			if (response.status === 404) {
				logger.error({ projectId, mergeRequestIid }, "Project or MR not found");
				throw new Error(
					`Project or merge request not found: ${projectId}/!${mergeRequestIid}`,
				);
			}
			const errorText = await response.text();
			logger.error(
				{ status: response.status, error: errorText },
				"Failed to create merge request discussion",
			);
			throw new Error(
				`Failed to create merge request discussion: ${response.status} ${response.statusText}\n${errorText}`,
			);
		}

		const data = (await response.json()) as Discussion;
		logger.info(
			{ projectId, mergeRequestIid, discussionId: data.id },
			"Merge request discussion created",
		);

		return data;
	}

	/**
	 * Get all discussions for a merge request (handles pagination automatically)
	 * @param projectId - The project ID or URL-encoded path
	 * @param mergeRequestIid - The IID of the merge request
	 * @returns Array of all discussions (fetches all pages)
	 * @throws Error if the request fails
	 */
	async getMergeRequestDiscussions(
		projectId: string | number,
		mergeRequestIid: number,
	): Promise<Discussion[]> {
		const encodedId = encodeURIComponent(projectId);

		logger.debug(
			{ projectId, mergeRequestIid },
			"Fetching merge request discussions",
		);

		const allDiscussions: Discussion[] = [];
		let page = 1;
		let hasMorePages = true;

		while (hasMorePages) {
			const url = `${this.apiUrl}/projects/${encodedId}/merge_requests/${mergeRequestIid}/discussions?page=${page}&per_page=20`;

			logger.debug(
				{ projectId, mergeRequestIid, page },
				"Fetching discussions page",
			);

			const response = await fetch(url, {
				method: "GET",
				headers: {
					"PRIVATE-TOKEN": this.token,
				},
			});

			if (!response.ok) {
				if (response.status === 401) {
					logger.error("Invalid GitLab token: 401 Unauthorized");
					throw new Error("Invalid GitLab token: 401 Unauthorized");
				}
				if (response.status === 404) {
					logger.error(
						{ projectId, mergeRequestIid },
						"Project or MR not found",
					);
					throw new Error(
						`Project or merge request not found: ${projectId}/!${mergeRequestIid}`,
					);
				}
				const errorText = await response.text();
				logger.error(
					{ status: response.status, error: errorText },
					"Failed to fetch merge request discussions",
				);
				throw new Error(
					`Failed to fetch merge request discussions: ${response.status} ${response.statusText}\n${errorText}`,
				);
			}

			const data = (await response.json()) as Discussion[];
			allDiscussions.push(...data);

			logger.debug(
				{
					projectId,
					mergeRequestIid,
					page,
					pageCount: data.length,
					totalCount: allDiscussions.length,
				},
				"Discussions page retrieved",
			);

			// If we got less than 20 results, we've reached the last page
			if (data.length < 20) {
				hasMorePages = false;
			} else {
				page++;
			}
		}

		logger.debug(
			{ projectId, mergeRequestIid, discussionCount: allDiscussions.length },
			"All merge request discussions retrieved",
		);

		return allDiscussions;
	}

	/**
	 * Find a discussion that matches a todo item by comparing author ID, body text, and creation timestamp
	 * @param todo - The todo item from GitLab's API
	 * @param discussions - Array of discussions from the merge request
	 * @param timeTolerance - Time tolerance in milliseconds (default: 5000ms)
	 * @returns The matching discussion, or null if not found
	 */
	findDiscussionFromTodo(
		todo: Todo,
		discussions: Discussion[],
		_timeTolerance = 5000,
	): Discussion | null {
		logger.debug(
			{
				todoId: todo.id,
				todoAuthorId: todo.author.id,
				todoCreatedAt: todo.created_at,
				todoBodyLength: todo.body.length,
				discussionCount: discussions.length,
			},
			"Searching for discussion matching todo",
		);

		const match = discussions.find((discussion) => {
			return (
				discussion.notes.some((note) => note.author.id === todo.author.id) &&
				discussion.notes.some((note) => note.body === todo.body) &&
				discussion.notes.some(
					(note) => note.id === Number(todo.target_url.split("#note_")[1]),
				)
			);
		});

		if (!match) {
			logger.warn(
				{
					todoId: todo.id,
					todoAuthorId: todo.author.id,
					todoCreatedAt: todo.created_at,
				},
				"No matching discussion found for todo",
			);
		}

		return match ?? null;
	}

	/**
	 * Add a note (reply) to an existing discussion in a merge request
	 * @param projectId - The project ID or URL-encoded path
	 * @param mergeRequestIid - The IID of the merge request
	 * @param discussionId - The ID of the discussion to reply to
	 * @param params - The note parameters
	 * @returns The created note
	 * @throws Error if the request fails
	 */
	async replyToDiscussion(
		projectId: string | number,
		mergeRequestIid: number,
		discussionId: string,
		params: AddDiscussionNoteParams,
	): Promise<DiscussionNote> {
		const encodedId = encodeURIComponent(projectId);

		logger.debug(
			{
				projectId,
				mergeRequestIid,
				discussionId,
				bodyLength: params.body.length,
			},
			"Replying to discussion",
		);

		const response = await fetch(
			`${this.apiUrl}/projects/${encodedId}/merge_requests/${mergeRequestIid}/discussions/${discussionId}/notes`,
			{
				method: "POST",
				headers: {
					"PRIVATE-TOKEN": this.token,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(params),
			},
		);

		if (!response.ok) {
			if (response.status === 401) {
				logger.error("Invalid GitLab token: 401 Unauthorized");
				throw new Error("Invalid GitLab token: 401 Unauthorized");
			}
			if (response.status === 404) {
				logger.error(
					{ projectId, mergeRequestIid, discussionId },
					"Project, MR, or discussion not found",
				);
				throw new Error(
					`Project, merge request, or discussion not found: ${projectId}/!${mergeRequestIid}/discussions/${discussionId}`,
				);
			}
			const errorText = await response.text();
			logger.error(
				{ status: response.status, error: errorText },
				"Failed to reply to discussion",
			);
			throw new Error(
				`Failed to reply to discussion: ${response.status} ${response.statusText}\n${errorText}`,
			);
		}

		const data = (await response.json()) as DiscussionNote;
		logger.info(
			{ projectId, mergeRequestIid, discussionId, noteId: data.id },
			"Discussion reply created",
		);

		return data;
	}
}
