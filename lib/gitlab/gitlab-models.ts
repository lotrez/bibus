export interface PersonalAccessToken {
	id: number;
	name: string;
	revoked: boolean;
	created_at: string;
	description: string | null;
	scopes: string[];
	user_id: number;
	last_used_at: string | null;
	active: boolean;
	expires_at: string | null;
}

export type TodoAction =
	| "assigned"
	| "mentioned"
	| "build_failed"
	| "marked"
	| "approval_required"
	| "unmergeable"
	| "directly_addressed"
	| "merge_train_removed"
	| "member_access_requested";

export type TodoState = "pending" | "done";

export type TodoTargetType =
	| "Issue"
	| "MergeRequest"
	| "Commit"
	| "Epic"
	| "DesignManagement::Design"
	| "AlertManagement::Alert"
	| "Project"
	| "Namespace"
	| "Vulnerability"
	| "WikiPage::Meta";

export interface GitLabUser {
	id: number;
	name: string;
	username: string;
	state: string;
	avatar_url: string;
	web_url: string;
}

export interface TodoProject {
	id: number;
	name: string;
	name_with_namespace: string;
	path: string;
	path_with_namespace: string;
}

export interface TodoMilestone {
	id: number;
	iid: number;
	project_id: number;
	title: string;
	description: string;
	state: string;
	created_at: string;
	updated_at: string;
	due_date: string | null;
}

export interface TodoTarget {
	id: number;
	iid: number;
	project_id: number;
	title: string;
	description: string;
	state: string;
	created_at: string;
	updated_at: string;
	target_branch?: string;
	source_branch?: string;
	upvotes?: number;
	downvotes?: number;
	author: GitLabUser;
	assignee?: GitLabUser;
	source_project_id?: number;
	target_project_id?: number;
	labels: string[];
	draft?: boolean;
	work_in_progress?: boolean;
	milestone?: TodoMilestone;
	merge_when_pipeline_succeeds?: boolean;
	merge_status?: string;
	user_notes_count?: number;
	subscribed?: boolean;
}

export interface Todo {
	id: number;
	project: TodoProject;
	author: GitLabUser;
	action_name: TodoAction;
	target_type: TodoTargetType;
	target: TodoTarget;
	target_url: string;
	body: string;
	state: TodoState;
	created_at: string;
	updated_at: string;
}

export interface GetTodosParams {
	action?: TodoAction;
	author_id?: number;
	project_id?: number;
	group_id?: number;
	state?: TodoState;
	type?: TodoTargetType;
}

export interface UserIdentity {
	provider: string;
	extern_uid: string;
	saml_provider_id?: number;
}

export interface CurrentUser {
	id: number;
	username: string;
	email: string;
	name: string;
	state: string;
	locked: boolean;
	avatar_url: string;
	web_url: string;
	created_at: string;
	bio: string;
	bot: boolean;
	location: string | null;
	public_email: string;
	linkedin: string;
	twitter: string;
	discord: string;
	github: string;
	website_url: string;
	organization: string;
	job_title: string;
	pronouns: string;
	work_information: string | null;
	followers: number;
	following: number;
	local_time: string;
	last_sign_in_at: string;
	confirmed_at: string;
	theme_id: number;
	last_activity_on: string;
	color_scheme_id: number;
	projects_limit: number;
	current_sign_in_at: string;
	identities: UserIdentity[];
	can_create_group: boolean;
	can_create_project: boolean;
	two_factor_enabled: boolean;
	external: boolean;
	private_profile: boolean;
	commit_email: string;
	preferred_language: string;
	shared_runners_minutes_limit?: number;
	extra_shared_runners_minutes_limit?: number;
}

export interface Project {
	id: number;
	name: string;
	name_with_namespace: string;
	path: string;
	path_with_namespace: string;
	description: string | null;
	default_branch: string;
	tag_list: string[];
	topics: string[];
	ssh_url_to_repo: string;
	http_url_to_repo: string;
	web_url: string;
	readme_url: string | null;
	avatar_url: string | null;
	forks_count: number;
	star_count: number;
	last_activity_at: string;
	namespace: {
		id: number;
		name: string;
		path: string;
		kind: string;
		full_path: string;
		parent_id: number | null;
		avatar_url: string | null;
		web_url: string;
	};
	container_registry_image_prefix?: string;
	_links: {
		self: string;
		issues: string;
		merge_requests: string;
		repo_branches: string;
		labels: string;
		events: string;
		members: string;
		cluster_agents: string;
	};
	packages_enabled?: boolean;
	empty_repo: boolean;
	archived: boolean;
	visibility: string;
	owner?: GitLabUser;
	resolve_outdated_diff_discussions?: boolean;
	container_expiration_policy?: {
		cadence: string;
		enabled: boolean;
		keep_n: number | null;
		older_than: string | null;
		name_regex: string | null;
		name_regex_keep: string | null;
		next_run_at: string;
	};
	issues_enabled: boolean;
	merge_requests_enabled: boolean;
	wiki_enabled: boolean;
	jobs_enabled: boolean;
	snippets_enabled: boolean;
	container_registry_enabled: boolean;
	service_desk_enabled?: boolean;
	can_create_merge_request_in?: boolean;
	issues_access_level: string;
	repository_access_level: string;
	merge_requests_access_level: string;
	forking_access_level: string;
	wiki_access_level: string;
	builds_access_level: string;
	snippets_access_level: string;
	pages_access_level: string;
	analytics_access_level: string;
	container_registry_access_level: string;
	security_and_compliance_access_level: string;
	releases_access_level?: string;
	environments_access_level?: string;
	feature_flags_access_level?: string;
	infrastructure_access_level?: string;
	monitor_access_level?: string;
	model_experiments_access_level?: string;
	model_registry_access_level?: string;
	emails_disabled?: boolean;
	emails_enabled?: boolean;
	shared_runners_enabled: boolean;
	lfs_enabled: boolean;
	creator_id: number;
	import_url?: string | null;
	import_type?: string | null;
	import_status: string;
	open_issues_count?: number;
	description_html?: string;
	updated_at?: string;
	ci_default_git_depth?: number;
	ci_forward_deployment_enabled?: boolean;
	ci_forward_deployment_rollback_allowed?: boolean;
	ci_job_token_scope_enabled?: boolean;
	ci_separated_caches?: boolean;
	ci_allow_fork_pipelines_to_run_in_parent_project?: boolean;
	build_git_strategy?: string;
	keep_latest_artifact?: boolean;
	restrict_user_defined_variables?: boolean;
	runners_token?: string;
	runner_token_expiration_interval?: number | null;
	group_runners_enabled?: boolean;
	auto_cancel_pending_pipelines?: string;
	build_timeout?: number;
	auto_devops_enabled?: boolean;
	auto_devops_deploy_strategy?: string;
	ci_config_path?: string | null;
	public_jobs?: boolean;
	shared_with_groups?: unknown[];
	only_allow_merge_if_pipeline_succeeds?: boolean;
	allow_merge_on_skipped_pipeline?: boolean | null;
	request_access_enabled?: boolean;
	only_allow_merge_if_all_discussions_are_resolved?: boolean;
	remove_source_branch_after_merge?: boolean;
	printing_merge_request_link_enabled?: boolean;
	merge_method?: string;
	squash_option?: string;
	enforce_auth_checks_on_uploads?: boolean;
	suggestion_commit_message?: string | null;
	merge_commit_template?: string | null;
	squash_commit_template?: string | null;
	issue_branch_template?: string | null;
	autoclose_referenced_issues?: boolean;
}

export interface MergeRequestNote {
	id: number;
	type: string | null;
	body: string;
	attachment: string | null;
	author: GitLabUser;
	created_at: string;
	updated_at: string;
	system: boolean;
	noteable_id: number;
	noteable_type: string;
	project_id: number;
	resolvable: boolean;
	resolved?: boolean;
	resolved_by?: GitLabUser | null;
	resolved_at?: string | null;
	confidential: boolean;
	internal: boolean;
	noteable_iid: number;
	commands_changes?: Record<string, unknown>;
}

export interface CreateMergeRequestNoteParams {
	body: string;
	created_at?: string;
	internal?: boolean;
}

export interface UpdateMergeRequestNoteParams {
	body: string;
}

export interface ModifyUserParams {
	admin?: boolean;
	auditor?: boolean;
	avatar?: string;
	bio?: string;
	can_create_group?: boolean;
	color_scheme_id?: number;
	commit_email?: string;
	email?: string;
	extern_uid?: string;
	external?: boolean;
	extra_shared_runners_minutes_limit?: number;
	group_id_for_saml?: number;
	linkedin?: string;
	location?: string;
	name?: string;
	note?: string;
	organization?: string;
	password?: string;
	private_profile?: boolean;
	projects_limit?: number;
	pronouns?: string;
	provider?: string;
	public_email?: string;
	shared_runners_minutes_limit?: number;
	skip_reconfirmation?: boolean;
	theme_id?: number;
	twitter?: string;
	discord?: string;
	github?: string;
	username?: string;
	view_diffs_file_by_file?: boolean;
	website_url?: string;
}

export interface DiffPosition {
	base_sha: string;
	start_sha: string;
	head_sha: string;
	old_path: string;
	new_path: string;
	position_type: "text" | "image" | "file";
	line_code?: string;
	old_line?: number;
	new_line?: number;
	width?: number;
	height?: number;
	x?: number;
	y?: number;
	line_range?: {
		start: {
			line_code: string;
			type: "old" | "new";
			old_line?: number;
			new_line?: number;
		};
		end: {
			line_code: string;
			type: "old" | "new";
			old_line?: number;
			new_line?: number;
		};
	};
}

export interface DiscussionNote {
	id: number;
	type: "DiscussionNote" | "DiffNote" | null;
	body: string;
	attachment: string | null;
	author: GitLabUser;
	created_at: string;
	updated_at: string;
	system: boolean;
	noteable_id: number;
	noteable_type: string;
	project_id: number;
	noteable_iid: number | null;
	resolvable: boolean;
	resolved?: boolean;
	resolved_by?: GitLabUser | null;
	resolved_at?: string | null;
	commit_id?: string;
	position?: DiffPosition;
	confidential?: boolean;
	internal?: boolean;
}

export interface Discussion {
	id: string;
	individual_note: boolean;
	notes: DiscussionNote[];
}

export interface CreateMergeRequestDiscussionParams {
	body: string;
	created_at?: string;
	position?: DiffPosition;
}

export interface AddDiscussionNoteParams {
	body: string;
	created_at?: string;
	internal?: boolean;
}

export interface MergeRequestVersion {
	id: number;
	head_commit_sha: string;
	base_commit_sha: string;
	start_commit_sha: string;
	created_at: string;
	merge_request_id: number;
	state: string;
	real_size: string;
}

export interface MergeRequestDiffLine {
	line_code: string;
	type: "old" | "new" | "match" | "old-nonewline" | "new-nonewline";
	old_line?: number;
	new_line?: number;
	text: string;
	rich_text?: string;
}

export interface MergeRequestDiffFile {
	old_path: string;
	new_path: string;
	a_mode: string;
	b_mode: string;
	new_file: boolean;
	renamed_file: boolean;
	deleted_file: boolean;
	diff: string;
	lines?: MergeRequestDiffLine[];
}

export interface MergeRequestDiff {
	id: number;
	head_commit_sha: string;
	base_commit_sha: string;
	start_commit_sha: string;
	created_at: string;
	merge_request_id: number;
	state: string;
	real_size: string;
	diffs: MergeRequestDiffFile[];
}

/**
 * Parameters for creating a new branch
 */
export interface CreateBranchParams {
	branch: string; // Name of the new branch
	ref: string; // The branch name or commit SHA to create branch from
}

/**
 * Represents a Git branch
 */
export interface Branch {
	name: string;
	commit: {
		id: string;
		short_id: string;
		title: string;
		author_name: string;
		author_email: string;
		created_at: string;
		message: string;
	};
	merged: boolean;
	protected: boolean;
	developers_can_push: boolean;
	developers_can_merge: boolean;
	can_push: boolean;
	default: boolean;
	web_url: string;
}

/**
 * Parameters for creating a new merge request
 */
export interface CreateMergeRequestParams {
	source_branch: string;
	target_branch: string;
	title: string;
	description?: string;
	assignee_id?: number;
	reviewer_ids?: number[];
	labels?: string[];
	remove_source_branch?: boolean;
	squash?: boolean;
}

/**
 * Represents a GitLab merge request
 */
export interface MergeRequest {
	id: number;
	iid: number;
	project_id: number;
	title: string;
	description: string;
	state: string;
	created_at: string;
	updated_at: string;
	merged_by: null | {
		id: number;
		username: string;
		name: string;
	};
	merge_user: null | {
		id: number;
		username: string;
		name: string;
	};
	merged_at: string | null;
	closed_by: null | {
		id: number;
		username: string;
		name: string;
	};
	closed_at: string | null;
	target_branch: string;
	source_branch: string;
	upvotes: number;
	downvotes: number;
	author: {
		id: number;
		username: string;
		name: string;
		state: string;
		avatar_url: string;
		web_url: string;
	};
	assignee: null | {
		id: number;
		username: string;
		name: string;
	};
	assignees: Array<{
		id: number;
		username: string;
		name: string;
	}>;
	reviewers: Array<{
		id: number;
		username: string;
		name: string;
	}>;
	source_project_id: number;
	target_project_id: number;
	labels: string[];
	draft: boolean;
	work_in_progress: boolean;
	milestone: null | {
		id: number;
		title: string;
	};
	merge_when_pipeline_succeeds: boolean;
	merge_status: string;
	sha: string;
	merge_commit_sha: string | null;
	squash_commit_sha: string | null;
	user_notes_count: number;
	discussion_locked: boolean | null;
	should_remove_source_branch: boolean | null;
	force_remove_source_branch: boolean;
	reference: string;
	references: {
		short: string;
		relative: string;
		full: string;
	};
	web_url: string;
	time_stats: {
		time_estimate: number;
		total_time_spent: number;
		human_time_estimate: string | null;
		human_total_time_spent: string | null;
	};
	squash: boolean;
	has_conflicts: boolean;
	blocking_discussions_resolved: boolean;
}
