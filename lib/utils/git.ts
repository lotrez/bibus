import path from "node:path";
import { $ } from "bun";
import { gitlabToken } from "./env-vars";
import logger from "./logger";

export interface CloneResult {
	path: string;
	cleanup: () => Promise<void>;
}

/**
 * Clone a GitLab project to a temporary directory
 * @param projectUrl - The GitLab project URL (e.g., "https://gitlab.com/namespace/project.git" or "gitlab.com/namespace/project")
 * @param branch - Optional branch name to clone (defaults to the default branch)
 * @returns Object with the cloned directory path and cleanup function
 */
export async function cloneToTemp(
	projectUrl: string,
	branch?: string,
): Promise<CloneResult> {
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
	logger.debug({ projectRoot, tempBaseDir }, "Setting up temp directory");

	// Ensure .temp directory exists
	const tempBaseDirFile = Bun.file(tempBaseDir);
	const dirExists = await tempBaseDirFile.exists();
	logger.debug({ tempBaseDir, dirExists }, "Checking if temp base dir exists");

	if (!dirExists) {
		logger.debug({ tempBaseDir }, "Creating temp base directory");
		await $`mkdir -p ${tempBaseDir}`.quiet();
		logger.debug({ tempBaseDir }, "Temp base directory created");
	}

	// Create temp directory (Bun doesn't have mkdtemp, so we'll use a timestamp-based name)
	const tempDirName = `gitlab-clone-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
	const tempDir = path.join(tempBaseDir, tempDirName);
	logger.debug({ tempDir, tempDirName }, "Creating unique temp directory");

	await $`mkdir -p ${tempDir}`.quiet();
	logger.debug({ tempDir }, "Temp directory created");

	try {
		logger.debug({ url: projectUrl, branch, tempDir }, "Cloning repository...");

		// Execute clone command using Bun's $
		logger.debug(
			{ branch, hasToken: !!gitlabToken },
			"Preparing git clone command",
		);

		logger.info("Starting git clone...");
		const result = branch
			? await $`git clone --branch ${branch} ${urlWithToken} ${tempDir}`.env({
					GIT_TERMINAL_PROMPT: "0",
				})
			: await $`git clone ${urlWithToken} ${tempDir}`.env({
					GIT_TERMINAL_PROMPT: "0",
				});
		logger.info("Git clone completed");

		const output = result.text();
		const stderr = result.stderr ? new TextDecoder().decode(result.stderr) : "";
		logger.debug(
			{ output: output.trim(), stderr: stderr.trim() },
			"Git clone output",
		);
		logger.info({ path: tempDir, branch }, "Repository cloned successfully");

		return {
			path: tempDir,
			cleanup: async () => {
				logger.debug({ path: tempDir }, "Starting cleanup...");
				const dirFile = Bun.file(tempDir);
				const exists = await dirFile.exists();
				logger.debug(
					{ path: tempDir, exists },
					"Checking if temp dir exists for cleanup",
				);

				if (exists) {
					logger.debug({ path: tempDir }, "Removing temp directory");
					await $`rm -rf ${tempDir}`.quiet();
					logger.debug({ path: tempDir }, "Cleaned up temporary directory");
				} else {
					logger.debug(
						{ path: tempDir },
						"Temp directory doesn't exist, skipping cleanup",
					);
				}
			},
		};
	} catch (error) {
		// Try to extract stderr from the error
		let errorDetails = error instanceof Error ? error.message : String(error);
		let stderr = "";

		// Bun's $ throws errors with stderr/stdout
		if (error && typeof error === "object" && "stderr" in error) {
			const stderrBuffer = (error as any).stderr;
			if (stderrBuffer) {
				stderr = new TextDecoder().decode(stderrBuffer);
				errorDetails = stderr || errorDetails;
			}
		}

		logger.error(
			{
				error: errorDetails,
				stderr: stderr || undefined,
				projectUrl,
				branch,
				tempDir,
			},
			"Failed to clone repository",
		);

		// Clean up on error
		logger.debug({ tempDir }, "Cleaning up temp directory after error");
		const dirFile = Bun.file(tempDir);
		if (await dirFile.exists()) {
			logger.debug({ tempDir }, "Removing temp directory after error");
			await $`rm -rf ${tempDir}`.quiet();
			logger.debug({ tempDir }, "Temp directory removed after error");
		}

		throw new Error(`Failed to clone repository: ${errorDetails}`);
	}
}

/**
 * Clone a GitLab project to a temporary directory (shallow clone - faster)
 * @param projectUrl - The GitLab project URL
 * @param branch - Optional branch name to clone (defaults to the default branch)
 * @returns Object with the cloned directory path and cleanup function
 */
export async function cloneToTempShallow(
	projectUrl: string,
	branch?: string,
): Promise<CloneResult> {
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
	const tempBaseDirFile = Bun.file(tempBaseDir);
	if (!(await tempBaseDirFile.exists())) {
		await $`mkdir -p ${tempBaseDir}`.quiet();
	}

	// Create temp directory
	const tempDirName = `gitlab-clone-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
	const tempDir = path.join(tempBaseDir, tempDirName);
	await $`mkdir -p ${tempDir}`.quiet();

	try {
		logger.debug(
			{ url: projectUrl, branch, tempDir, shallow: true },
			"Shallow cloning repository...",
		);

		// Execute clone command using Bun's $
		logger.debug({ branch }, "Preparing shallow git clone command");

		logger.info("Starting shallow git clone...");
		const result = branch
			? await $`git clone --depth 1 --branch ${branch} ${urlWithToken} ${tempDir}`.env(
					{
						GIT_TERMINAL_PROMPT: "0",
					},
				)
			: await $`git clone --depth 1 ${urlWithToken} ${tempDir}`.env({
					GIT_TERMINAL_PROMPT: "0",
				});
		logger.info("Shallow git clone completed");

		const output = result.text();
		const stderr = result.stderr ? new TextDecoder().decode(result.stderr) : "";
		logger.debug(
			{ output: output.trim(), stderr: stderr.trim() },
			"Git shallow clone output",
		);
		logger.info(
			{ path: tempDir, branch, shallow: true },
			"Repository shallow cloned successfully",
		);

		return {
			path: tempDir,
			cleanup: async () => {
				logger.debug({ path: tempDir }, "Starting shallow clone cleanup...");
				const dirFile = Bun.file(tempDir);
				if (await dirFile.exists()) {
					logger.debug(
						{ path: tempDir },
						"Removing shallow clone temp directory",
					);
					await $`rm -rf ${tempDir}`.quiet();
					logger.debug({ path: tempDir }, "Cleaned up temporary directory");
				}
			},
		};
	} catch (error) {
		// Try to extract stderr from the error
		let errorDetails = error instanceof Error ? error.message : String(error);
		let stderr = "";

		if (error && typeof error === "object" && "stderr" in error) {
			const stderrBuffer = (error as any).stderr;
			if (stderrBuffer) {
				stderr = new TextDecoder().decode(stderrBuffer);
				errorDetails = stderr || errorDetails;
			}
		}

		logger.error(
			{
				error: errorDetails,
				stderr: stderr || undefined,
				projectUrl,
				branch,
				tempDir,
			},
			"Failed to shallow clone repository",
		);

		// Clean up on error
		const dirFile = Bun.file(tempDir);
		if (await dirFile.exists()) {
			logger.debug(
				{ tempDir },
				"Removing temp directory after shallow clone error",
			);
			await $`rm -rf ${tempDir}`.quiet();
		}
		throw new Error(`Failed to shallow clone repository: ${errorDetails}`);
	}
}

/**
 * Checkout a branch in a git repository
 * @param repoPath - Path to the git repository
 * @param branch - Branch name to checkout
 * @param createNew - If true, creates a new branch instead of checking out existing one
 * @throws Error if checkout fails
 */
export async function checkoutBranch(
	repoPath: string,
	branch: string,
	createNew = false,
): Promise<void> {
	logger.debug({ repoPath, branch, createNew }, "Starting checkoutBranch");

	const repoFile = Bun.file(repoPath);
	const repoExists = await repoFile.exists();
	logger.debug({ repoPath, repoExists }, "Checking if repo path exists");

	if (!repoExists) {
		throw new Error(`Repository path does not exist: ${repoPath}`);
	}

	const gitDir = path.join(repoPath, ".git");
	const gitDirFile = Bun.file(gitDir);
	const gitDirExists = await gitDirFile.exists();
	logger.debug({ gitDir, gitDirExists }, "Checking if .git directory exists");

	if (!gitDirExists) {
		throw new Error(`Not a git repository: ${repoPath}`);
	}

	try {
		logger.debug({ branch, createNew, repoPath }, "Checking out branch...");

		logger.info({ branch, createNew }, "Running git checkout...");
		const result = createNew
			? await $`git checkout -b ${branch}`.cwd(repoPath)
			: await $`git checkout ${branch}`.cwd(repoPath);
		logger.info("Git checkout completed");

		const output = result.text();
		const stderr = result.stderr ? new TextDecoder().decode(result.stderr) : "";
		logger.debug(
			{ output: output.trim(), stderr: stderr.trim() },
			"Git checkout output",
		);
		logger.info({ branch, createNew }, "Branch checked out successfully");
	} catch (error) {
		let errorDetails = error instanceof Error ? error.message : String(error);
		let stderr = "";

		if (error && typeof error === "object" && "stderr" in error) {
			const stderrBuffer = (error as any).stderr;
			if (stderrBuffer) {
				stderr = new TextDecoder().decode(stderrBuffer);
				errorDetails = stderr || errorDetails;
			}
		}

		logger.error(
			{
				error: errorDetails,
				stderr: stderr || undefined,
				branch,
				repoPath,
				createNew,
			},
			"Failed to checkout branch",
		);
		throw new Error(`Failed to checkout branch ${branch}: ${errorDetails}`);
	}
}

/**
 * Get the current branch name
 * @param repoPath - Path to the git repository
 * @returns The current branch name
 */
export async function getCurrentBranch(repoPath: string): Promise<string> {
	logger.debug({ repoPath }, "Starting getCurrentBranch");

	const repoFile = Bun.file(repoPath);
	if (!(await repoFile.exists())) {
		throw new Error(`Repository path does not exist: ${repoPath}`);
	}

	const gitDir = path.join(repoPath, ".git");
	const gitDirFile = Bun.file(gitDir);
	if (!(await gitDirFile.exists())) {
		throw new Error(`Not a git repository: ${repoPath}`);
	}

	try {
		logger.info("Getting current branch...");
		const result = await $`git rev-parse --abbrev-ref HEAD`
			.cwd(repoPath)
			.quiet();
		const branch = result.text().trim();

		logger.debug({ branch, repoPath }, "Got current branch");
		return branch;
	} catch (error) {
		logger.error(
			{
				error: error instanceof Error ? error.message : String(error),
				repoPath,
			},
			"Failed to get current branch",
		);
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
export async function fetchAll(repoPath: string) {
	logger.debug({ repoPath }, "Starting fetchAll");

	const repoFile = Bun.file(repoPath);
	if (!(await repoFile.exists())) {
		throw new Error(`Repository path does not exist: ${repoPath}`);
	}

	const gitDir = path.join(repoPath, ".git");
	const gitDirFile = Bun.file(gitDir);
	if (!(await gitDirFile.exists())) {
		throw new Error(`Not a git repository: ${repoPath}`);
	}

	try {
		logger.info("Getting current branch...");
		const result = await $`git rev-parse --abbrev-ref HEAD`
			.cwd(repoPath)
			.quiet();
		const branch = result.text().trim();

		logger.debug({ branch, repoPath }, "Got current branch");
		return branch;
	} catch (error) {
		let errorDetails = error instanceof Error ? error.message : String(error);
		let stderr = "";

		if (error && typeof error === "object" && "stderr" in error) {
			const stderrBuffer = (error as any).stderr;
			if (stderrBuffer) {
				stderr = new TextDecoder().decode(stderrBuffer);
				errorDetails = stderr || errorDetails;
			}
		}

		logger.error(
			{
				error: errorDetails,
				stderr: stderr || undefined,
				repoPath,
			},
			"Failed to get current branch",
		);
		throw new Error(`Failed to get current branch: ${errorDetails}`);
	}
}

/**
 * Add all changes to the staging area
 * @param repoPath - Path to the git repository
 * @throws Error if git add fails
 */
export async function addAll(repoPath: string): Promise<void> {
	const repoFile = Bun.file(repoPath);
	if (!(await repoFile.exists())) {
		throw new Error(`Repository path does not exist: ${repoPath}`);
	}

	const gitDir = path.join(repoPath, ".git");
	const gitDirFile = Bun.file(gitDir);
	if (!(await gitDirFile.exists())) {
		throw new Error(`Not a git repository: ${repoPath}`);
	}

	try {
		logger.debug({ repoPath }, "Adding all changes to staging area...");

		const result = await $`git add -A`.cwd(repoPath);

		const output = result.text();
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
export async function commit(
	repoPath: string,
	message: string,
	allowEmpty = false,
): Promise<void> {
	const repoFile = Bun.file(repoPath);
	if (!(await repoFile.exists())) {
		throw new Error(`Repository path does not exist: ${repoPath}`);
	}

	const gitDir = path.join(repoPath, ".git");
	const gitDirFile = Bun.file(gitDir);
	if (!(await gitDirFile.exists())) {
		throw new Error(`Not a git repository: ${repoPath}`);
	}

	try {
		logger.debug({ repoPath, message, allowEmpty }, "Creating commit...");

		const emptyFlag = allowEmpty ? "--allow-empty" : "";
		const result = await $`git commit ${emptyFlag} -m ${message}`.cwd(repoPath);

		const output = result.text();
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
export async function push(
	repoPath: string,
	remote = "origin",
	branch?: string,
	force = false,
): Promise<void> {
	const repoFile = Bun.file(repoPath);
	if (!(await repoFile.exists())) {
		throw new Error(`Repository path does not exist: ${repoPath}`);
	}

	const gitDir = path.join(repoPath, ".git");
	const gitDirFile = Bun.file(gitDir);
	if (!(await gitDirFile.exists())) {
		throw new Error(`Not a git repository: ${repoPath}`);
	}

	try {
		logger.debug({ repoPath, remote, branch, force }, "Pushing to remote...");

		const forceFlag = force ? "--force" : "";
		const branchArg = branch || "";
		const result = await $`git push ${forceFlag} ${remote} ${branchArg}`
			.cwd(repoPath)
			.env({ GIT_TERMINAL_PROMPT: "0" });

		const output = result.text();
		logger.debug({ output: output.trim() }, "Git push output");
		logger.info({ remote, branch }, "Pushed to remote successfully");
	} catch (error) {
		throw new Error(
			`Failed to push to remote: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}
