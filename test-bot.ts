import { execSync } from "node:child_process";
import { cloneToTemp, getCurrentBranch } from "./lib/git";
import logger from "./lib/logger";
import { createClient, promptAndWaitForResponse } from "./lib/opencode-helper";

interface GitLabProject {
	name_with_namespace: string;
	default_branch: string;
	http_url_to_repo: string;
}

interface GitLabMR {
	iid: number;
	web_url: string;
}

// Test environment variables (optional)
const testToken = process.env.GITLAB_TEST_TOKEN!;
const testProject = process.env.GITLAB_TEST_PROJECT!;
const testProvider =
	process.env.OPENCODE_TEST_PROVIDER ||
	process.env.OPENCODE_PROVIDER ||
	"opencode";
const testModel =
	process.env.OPENCODE_TEST_MODEL ||
	process.env.OPENCODE_MODEL ||
	"glm-4.7-free";

if (!testToken || !testProject) {
	console.error(
		"Error: Please set GITLAB_TEST_TOKEN and GITLAB_TEST_PROJECT environment variables",
	);
	console.error("Example:");
	console.error("  GITLAB_TEST_TOKEN=your_token");
	console.error("  GITLAB_TEST_PROJECT=12345  (project ID)");
	process.exit(1);
}

const apiUrl = process.env.GITLAB_API_URL || "https://gitlab.com/api/v4";

async function createTestMR() {
	logger.info("🚀 Starting bot test...\n");

	try {
		// Step 1: Get project info
		logger.info("📋 Step 1: Getting project information...");
		const projectResponse = await fetch(`${apiUrl}/projects/${testProject}`, {
			headers: {
				"PRIVATE-TOKEN": testToken,
			},
		});

		if (!projectResponse.ok) {
			throw new Error(
				`Failed to get project: ${projectResponse.status} ${projectResponse.statusText}`,
			);
		}

		const project = (await projectResponse.json()) as GitLabProject;
		logger.info(`   ✓ Project: ${project.name_with_namespace}`);
		logger.info(`   ✓ Default branch: ${project.default_branch}\n`);

		// Step 2: Clone the repository
		logger.info("📦 Step 2: Cloning repository...");
		const repo = cloneToTemp(project.http_url_to_repo);
		logger.info(`   ✓ Cloned to: ${repo.path}\n`);

		try {
			// Step 3: Create a new branch with timestamp
			const timestamp = Date.now();
			const branchName = `bot-test-${timestamp}`;
			const defaultBranch = project.default_branch || "main";

			logger.info(`📝 Step 3: Creating branch ${branchName}...`);

			// Create branch via API (better than local git)
			const createBranchResponse = await fetch(
				`${apiUrl}/projects/${encodeURIComponent(testProject)}/repository/branches`,
				{
					method: "POST",
					headers: {
						"PRIVATE-TOKEN": testToken,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						branch: branchName,
						ref: defaultBranch,
					}),
				},
			);

			if (!createBranchResponse.ok) {
				const errorText = await createBranchResponse.text();
				throw new Error(
					`Failed to create branch: ${createBranchResponse.status} ${createBranchResponse.statusText}\n${errorText}`,
				);
			}

			logger.info(`   ✓ Branch created: ${branchName}\n`);

			// Step 4: Fetch and checkout the new branch locally
			logger.info("🔄 Step 4: Fetching and checking out new branch...");

			// Fetch the new branch from remote
			execSync(`git fetch origin ${branchName}`, {
				cwd: repo.path,
				stdio: "inherit",
			});

			// Checkout the branch
			execSync(`git checkout ${branchName}`, {
				cwd: repo.path,
				stdio: "inherit",
			});

			const currentBranch = getCurrentBranch(repo.path);
			logger.info(`   ✓ Current branch: ${currentBranch}\n`);

			// Step 5: Use OpenCode to generate test code with intentional bugs
			logger.info(
				"✏️  Step 5: Using OpenCode to generate test code with bugs...",
			);
			logger.debug(`   Using model: ${testProvider}/${testModel}`);

			const { client: opencodeClient } = await createClient(repo.path);

			const codePrompt = `Add a few bugs to the codebase in various files. They can be security issues, performance problems, or simple bugs. Make sure to spread them across multiple files.`;

			await promptAndWaitForResponse(opencodeClient, codePrompt, {
				providerID: testProvider,
				modelID: testModel,
			});

			// Step 6: Commit and push all changes using git
			logger.info("💾 Step 6: Committing and pushing all changes...");

			// Get list of changed files using git status
			const changedFilesOutput = execSync("git status --porcelain", {
				cwd: repo.path,
				encoding: "utf-8",
			});

			const changedFiles = changedFilesOutput
				.split("\n")
				.filter((line) => line.trim());

			if (changedFiles.length === 0) {
				logger.info("   ⚠️  No files were changed by OpenCode\n");
			} else {
				logger.info(`   ✓ Found ${changedFiles.length} changed file(s):`);
				for (const line of changedFiles) {
					logger.info(`     ${line}`);
				}
				logger.info("");

				// Stage all changes
				logger.info("   📝 Staging all changes...");
				execSync("git add -A", {
					cwd: repo.path,
					stdio: "inherit",
				});

				// Commit changes
				logger.info("   📝 Committing changes...");
				execSync(
					'git commit -m "chore: add test changes with intentional bugs"',
					{
						cwd: repo.path,
						stdio: "inherit",
					},
				);

				// Push to remote
				logger.info("   📝 Pushing to remote...");
				execSync(`git push origin ${branchName}`, {
					cwd: repo.path,
					stdio: "inherit",
				});

				logger.info(`   ✓ All changes committed and pushed\n`);
			}

			// Step 7: Create merge request
			logger.info("🔀 Step 7: Creating merge request...");
			const mrResponse = await fetch(
				`${apiUrl}/projects/${testProject}/merge_requests`,
				{
					method: "POST",
					headers: {
						"PRIVATE-TOKEN": testToken,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						source_branch: branchName,
						target_branch: defaultBranch,
						title: `Test MR: Bot test ${timestamp}`,
						description: `This is an automated test merge request created by the bibus bot.\n\nTimestamp: ${new Date().toISOString()}`,
					}),
				},
			);

			if (!mrResponse.ok) {
				const errorText = await mrResponse.text();
				throw new Error(
					`Failed to create MR: ${mrResponse.status} ${mrResponse.statusText}\n${errorText}`,
				);
			}

			const mr = (await mrResponse.json()) as GitLabMR;
			logger.info(`   ✓ MR created: !${mr.iid}`);
			logger.info(`   ✓ URL: ${mr.web_url}\n`);

			// Step 8: Add a comment mentioning @ask-bibus
			logger.info("💬 Step 8: Adding comment with @ask-bibus mention...");
			const commentResponse = await fetch(
				`${apiUrl}/projects/${testProject}/merge_requests/${mr.iid}/notes`,
				{
					method: "POST",
					headers: {
						"PRIVATE-TOKEN": testToken,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						body: "@ask-bibus review",
					}),
				},
			);

			if (!commentResponse.ok) {
				throw new Error(
					`Failed to add comment: ${commentResponse.status} ${commentResponse.statusText}`,
				);
			}

			logger.info(`   ✓ Comment added: "@ask-bibus review"\n`);

			// Summary
			logger.info("✅ Test completed successfully!\n");
			logger.info("📊 Summary:");
			logger.info(`   - Branch: ${branchName}`);
			logger.info(`   - MR: !${mr.iid}`);
			logger.info(`   - URL: ${mr.web_url}`);
			logger.info(
				`   - Comment: Added "@ask-bibus review" to trigger the bot\n`,
			);
		} finally {
			// Cleanup
			logger.info("🧹 Cleaning up...");
			repo.cleanup();
			logger.info("   ✓ Cleaned up temporary files\n");
		}
	} catch (error) {
		console.error("\n❌ Test failed:");
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}

createTestMR();
