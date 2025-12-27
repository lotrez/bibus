import { gitlabApiUrl, gitlabToken } from "../env-vars";
import logger from "../logger";
import type {
	CreateMergeRequestNoteParams,
	CurrentUser,
	GetTodosParams,
	MergeRequestNote,
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
			logger.debug({ cached: true }, "Returning cached user info");
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
}
