import { gitlabApiUrl, gitlabToken } from "../env-vars";
import type {
	CurrentUser,
	GetTodosParams,
	PersonalAccessToken,
	Project,
	Todo,
} from "./gitlab-models";

export class GitLabClient {
	private token: string;
	private apiUrl: string;
	private currentUserCache: CurrentUser | null = null;

	constructor() {
		this.token = gitlabToken;
		this.apiUrl = gitlabApiUrl;
	}

	/**
	 * Verify the personal access token by fetching its details
	 * @returns The personal access token information
	 * @throws Error if the token is invalid or the request fails
	 */
	async verifyToken(): Promise<PersonalAccessToken> {
		const response = await fetch(`${this.apiUrl}/personal_access_tokens/self`, {
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
				`Failed to verify token: ${response.status} ${response.statusText}`,
			);
		}

		console.log("GitLab token is valid.");

		const data = await response.json();
		return data as PersonalAccessToken;
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
			return this.currentUserCache;
		}

		const response = await fetch(`${this.apiUrl}/user`, {
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
				`Failed to fetch current user: ${response.status} ${response.statusText}`,
			);
		}

		const data = await response.json();
		this.currentUserCache = data as CurrentUser;
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
}
