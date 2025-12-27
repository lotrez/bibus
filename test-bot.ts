import * as fs from "node:fs";
import { execSync } from "node:child_process";
import { cloneToTemp, checkoutBranch, getCurrentBranch } from "./lib/git";

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
	console.log("🚀 Starting bot test...\n");

	try {
		// Step 1: Get project info
		console.log("📋 Step 1: Getting project information...");
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
		console.log(`   ✓ Project: ${project.name_with_namespace}`);
		console.log(`   ✓ Default branch: ${project.default_branch}\n`);

		// Step 2: Clone the repository
		console.log("📦 Step 2: Cloning repository...");
		const repo = cloneToTemp(project.http_url_to_repo);
		console.log(`   ✓ Cloned to: ${repo.path}\n`);

		try {
			// Step 3: Create a new branch with timestamp
			const timestamp = Date.now();
			const branchName = `bot-test-${timestamp}`;
			const defaultBranch = project.default_branch || "main";

			console.log(`📝 Step 3: Creating branch ${branchName}...`);

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

			console.log(`   ✓ Branch created: ${branchName}\n`);

			// Step 4: Fetch and checkout the new branch locally
			console.log("🔄 Step 4: Fetching and checking out new branch...");
			
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
			console.log(`   ✓ Current branch: ${currentBranch}\n`);

			// Step 5: Make an insignificant change
			console.log("✏️  Step 5: Making a test change...");
			const testFilePath = `${repo.path}/test-${timestamp}.txt`;
			fs.writeFileSync(
				testFilePath,
				`Test file created by bot at ${new Date().toISOString()}`,
			);
			console.log(`   ✓ Created test file\n`);

			// Step 6: Commit the change using GitLab API (Files API)
			console.log("💾 Step 6: Committing change...");
			const commitResponse = await fetch(
				`${apiUrl}/projects/${testProject}/repository/files/test-${timestamp}.txt`,
				{
					method: "POST",
					headers: {
						"PRIVATE-TOKEN": testToken,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						branch: branchName,
						content: `Test file created by bot at ${new Date().toISOString()}`,
						commit_message: `test: Add test file for bot testing`,
					}),
				},
			);

			if (!commitResponse.ok) {
				throw new Error(
					`Failed to commit: ${commitResponse.status} ${commitResponse.statusText}`,
				);
			}

			console.log(`   ✓ Changes committed\n`);

			// Step 7: Create merge request
			console.log("🔀 Step 7: Creating merge request...");
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
			console.log(`   ✓ MR created: !${mr.iid}`);
			console.log(`   ✓ URL: ${mr.web_url}\n`);

			// Step 8: Add a comment mentioning @ask-bibus
			console.log("💬 Step 8: Adding comment with @ask-bibus mention...");
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

			console.log(`   ✓ Comment added: "@ask-bibus review"\n`);

			// Summary
			console.log("✅ Test completed successfully!\n");
			console.log("📊 Summary:");
			console.log(`   - Branch: ${branchName}`);
			console.log(`   - MR: !${mr.iid}`);
			console.log(`   - URL: ${mr.web_url}`);
			console.log(
				`   - Comment: Added "@ask-bibus review" to trigger the bot\n`,
			);
		} finally {
			// Cleanup
			console.log("🧹 Cleaning up...");
			repo.cleanup();
			console.log("   ✓ Cleaned up temporary files\n");
		}
	} catch (error) {
		console.error("\n❌ Test failed:");
		console.error(
			error instanceof Error ? error.message : String(error),
		);
		process.exit(1);
	}
}

createTestMR();
