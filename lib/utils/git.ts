import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { gitlabToken } from "./env-vars";
import logger from "./logger";

export interface CloneResult {
	path: string;
	cleanup: () => void;
}

/**
 * Clone a GitLab project to a temporary directory
 * @param projectUrl - The GitLab project URL (e.g., "https://gitlab.com/namespace/project.git" or "gitlab.com/namespace/project")
 * @param branch - Optional branch name to clone (defaults to the default branch)
 * @returns Object with the cloned directory path and cleanup function
 */
export function cloneToTemp(projectUrl: string, branch?: string): CloneResult {
	// Normalize the URL
	let normalizedUrl = projectUrl;
	if (
		!normalizedUrl.startsWith("http://") &&
		!normalizedUrl.startsWith("https://")
	) {
		normalizedUrl = `https://${normalizedUrl}`;
	}
	if (!normalizedUrl.endsWith(".git")) {
		normalizedUrl = `${normalizedUrl}.git`;
	}

	// Insert token into URL for authentication
	const urlWithToken = normalizedUrl.replace(
		"https://",
		`https://oauth2:${gitlabToken}@`,
	);

	// Create a temporary directory in the current project
	const projectRoot = process.cwd();
	const tempBaseDir = path.join(projectRoot, ".temp");

	// Ensure .temp directory exists
	if (!fs.existsSync(tempBaseDir)) {
		fs.mkdirSync(tempBaseDir, { recursive: true });
	}

	const tempDir = fs.mkdtempSync(path.join(tempBaseDir, "gitlab-clone-"));

	try {
		// Build git clone command
		const branchArg = branch ? `--branch ${branch}` : "";
		const command = `git clone ${branchArg} "${urlWithToken}" "${tempDir}"`;

		logger.debug({ url: projectUrl, branch, tempDir }, "Cloning repository...");

		// Execute clone command and capture output
		const output = execSync(command, {
			encoding: "utf-8",
			env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
		});

		logger.debug({ output: output.trim() }, "Git clone output");
		logger.info({ path: tempDir, branch }, "Repository cloned successfully");

		return {
			path: tempDir,
			cleanup: () => {
				if (fs.existsSync(tempDir)) {
					fs.rmSync(tempDir, { recursive: true, force: true });
					logger.debug({ path: tempDir }, "Cleaned up temporary directory");
				}
			},
		};
	} catch (error) {
		// Clean up on error
		if (fs.existsSync(tempDir)) {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
		throw new Error(
			`Failed to clone repository: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

/**
 * Clone a GitLab project to a temporary directory (shallow clone - faster)
 * @param projectUrl - The GitLab project URL
 * @param branch - Optional branch name to clone (defaults to the default branch)
 * @returns Object with the cloned directory path and cleanup function
 */
export function cloneToTempShallow(
	projectUrl: string,
	branch?: string,
): CloneResult {
	// Normalize the URL
	let normalizedUrl = projectUrl;
	if (
		!normalizedUrl.startsWith("http://") &&
		!normalizedUrl.startsWith("https://")
	) {
		normalizedUrl = `https://${normalizedUrl}`;
	}
	if (!normalizedUrl.endsWith(".git")) {
		normalizedUrl = `${normalizedUrl}.git`;
	}

	// Insert token into URL for authentication
	const urlWithToken = normalizedUrl.replace(
		"https://",
		`https://oauth2:${gitlabToken}@`,
	);

	// Create a temporary directory in the current project
	const projectRoot = process.cwd();
	const tempBaseDir = path.join(projectRoot, ".temp");

	// Ensure .temp directory exists
	if (!fs.existsSync(tempBaseDir)) {
		fs.mkdirSync(tempBaseDir, { recursive: true });
	}

	const tempDir = fs.mkdtempSync(path.join(tempBaseDir, "gitlab-clone-"));

	try {
		// Build git clone command with shallow clone
		const branchArg = branch ? `--branch ${branch}` : "";
		const command = `git clone --depth 1 ${branchArg} "${urlWithToken}" "${tempDir}"`;

		logger.debug(
			{ url: projectUrl, branch, tempDir, shallow: true },
			"Shallow cloning repository...",
		);

		// Execute clone command and capture output
		const output = execSync(command, {
			encoding: "utf-8",
			env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
		});

		logger.debug({ output: output.trim() }, "Git shallow clone output");
		logger.info(
			{ path: tempDir, branch, shallow: true },
			"Repository shallow cloned successfully",
		);

		return {
			path: tempDir,
			cleanup: () => {
				if (fs.existsSync(tempDir)) {
					fs.rmSync(tempDir, { recursive: true, force: true });
					logger.debug({ path: tempDir }, "Cleaned up temporary directory");
				}
			},
		};
	} catch (error) {
		// Clean up on error
		if (fs.existsSync(tempDir)) {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
		throw new Error(
			`Failed to shallow clone repository: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

/**
 * Checkout a branch in a git repository
 * @param repoPath - Path to the git repository
 * @param branch - Branch name to checkout
 * @param createNew - If true, creates a new branch instead of checking out existing one
 * @throws Error if checkout fails
 */
export function checkoutBranch(
	repoPath: string,
	branch: string,
	createNew = false,
): void {
	if (!fs.existsSync(repoPath)) {
		throw new Error(`Repository path does not exist: ${repoPath}`);
	}

	const gitDir = path.join(repoPath, ".git");
	if (!fs.existsSync(gitDir)) {
		throw new Error(`Not a git repository: ${repoPath}`);
	}

	try {
		const createFlag = createNew ? "-b" : "";
		const command = `git checkout ${createFlag} ${branch}`;

		logger.debug({ branch, createNew, repoPath }, "Checking out branch...");

		const output = execSync(command, {
			cwd: repoPath,
			encoding: "utf-8",
		});

		logger.debug({ output: output.trim() }, "Git checkout output");
		logger.info({ branch, createNew }, "Branch checked out successfully");
	} catch (error) {
		throw new Error(
			`Failed to checkout branch ${branch}: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

/**
 * Get the current branch name
 * @param repoPath - Path to the git repository
 * @returns The current branch name
 */
export function getCurrentBranch(repoPath: string): string {
	if (!fs.existsSync(repoPath)) {
		throw new Error(`Repository path does not exist: ${repoPath}`);
	}

	const gitDir = path.join(repoPath, ".git");
	if (!fs.existsSync(gitDir)) {
		throw new Error(`Not a git repository: ${repoPath}`);
	}

	try {
		const branch = execSync("git rev-parse --abbrev-ref HEAD", {
			cwd: repoPath,
			encoding: "utf-8",
		}).trim();

		logger.debug({ branch, repoPath }, "Got current branch");
		return branch;
	} catch (error) {
		throw new Error(
			`Failed to get current branch: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

/**
 * Fetch all remote branches
 * @param repoPath - Path to the git repository
 * @throws Error if fetch fails
 */
export function fetchAll(repoPath: string): void {
	if (!fs.existsSync(repoPath)) {
		throw new Error(`Repository path does not exist: ${repoPath}`);
	}

	const gitDir = path.join(repoPath, ".git");
	if (!fs.existsSync(gitDir)) {
		throw new Error(`Not a git repository: ${repoPath}`);
	}

	try {
		logger.debug({ repoPath }, "Fetching all remote branches...");

		const output = execSync("git fetch --all", {
			cwd: repoPath,
			encoding: "utf-8",
		});

		logger.debug({ output: output.trim() }, "Git fetch output");
		logger.info("Fetched all remote branches successfully");
	} catch (error) {
		throw new Error(
			`Failed to fetch branches: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

/**
 * Add all changes to the staging area
 * @param repoPath - Path to the git repository
 * @throws Error if git add fails
 */
export function addAll(repoPath: string): void {
	if (!fs.existsSync(repoPath)) {
		throw new Error(`Repository path does not exist: ${repoPath}`);
	}

	const gitDir = path.join(repoPath, ".git");
	if (!fs.existsSync(gitDir)) {
		throw new Error(`Not a git repository: ${repoPath}`);
	}

	try {
		logger.debug({ repoPath }, "Adding all changes to staging area...");

		const output = execSync("git add -A", {
			cwd: repoPath,
			encoding: "utf-8",
		});

		logger.debug({ output: output.trim() }, "Git add output");
		logger.info("Added all changes to staging area");
	} catch (error) {
		throw new Error(
			`Failed to add changes: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

/**
 * Commit staged changes
 * @param repoPath - Path to the git repository
 * @param message - Commit message
 * @param allowEmpty - Allow empty commits
 * @throws Error if git commit fails
 */
export function commit(
	repoPath: string,
	message: string,
	allowEmpty = false,
): void {
	if (!fs.existsSync(repoPath)) {
		throw new Error(`Repository path does not exist: ${repoPath}`);
	}

	const gitDir = path.join(repoPath, ".git");
	if (!fs.existsSync(gitDir)) {
		throw new Error(`Not a git repository: ${repoPath}`);
	}

	try {
		const emptyFlag = allowEmpty ? "--allow-empty" : "";
		const command = `git commit ${emptyFlag} -m "${message.replace(/"/g, '\\"')}"`;

		logger.debug({ repoPath, message, allowEmpty }, "Creating commit...");

		const output = execSync(command, {
			cwd: repoPath,
			encoding: "utf-8",
		});

		logger.debug({ output: output.trim() }, "Git commit output");
		logger.info({ message }, "Commit created successfully");
	} catch (error) {
		throw new Error(
			`Failed to commit changes: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

/**
 * Push commits to remote repository
 * @param repoPath - Path to the git repository
 * @param remote - Remote name (default: "origin")
 * @param branch - Branch name to push (if not specified, pushes current branch)
 * @param force - Force push
 * @throws Error if git push fails
 */
export function push(
	repoPath: string,
	remote = "origin",
	branch?: string,
	force = false,
): void {
	if (!fs.existsSync(repoPath)) {
		throw new Error(`Repository path does not exist: ${repoPath}`);
	}

	const gitDir = path.join(repoPath, ".git");
	if (!fs.existsSync(gitDir)) {
		throw new Error(`Not a git repository: ${repoPath}`);
	}

	try {
		const forceFlag = force ? "--force" : "";
		const branchArg = branch ? branch : "";
		const command = `git push ${forceFlag} ${remote} ${branchArg}`.trim();

		logger.debug({ repoPath, remote, branch, force }, "Pushing to remote...");

		const output = execSync(command, {
			cwd: repoPath,
			encoding: "utf-8",
			env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
		});

		logger.debug({ output: output.trim() }, "Git push output");
		logger.info({ remote, branch }, "Pushed to remote successfully");
	} catch (error) {
		throw new Error(
			`Failed to push to remote: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}
