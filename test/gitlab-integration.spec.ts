import { describe, expect, test } from "bun:test";
import { GitLabClient } from "../lib/gitlab/gitlab-client.ts";

describe("GitLabClient.getProject integration with extractProjectPath", () => {
	test("getProject should work with project path extracted from full URL", async () => {
		const fullUrl = "https://gitlab.com/LOTREZ/front-end-bibus-test";
		const client = new GitLabClient();

		const projectPath = client.extractProjectPath(fullUrl);
		expect(projectPath).toBe("LOTREZ/front-end-bibus-test");

		const project = await client.getProject(projectPath);

		expect(project).not.toBeNull();
		expect(project?.path_with_namespace).toBe("LOTREZ/front-end-bibus-test");
		expect(project?.http_url_to_repo).toContain(
			"LOTREZ/front-end-bibus-test.git",
		);
	});

	test("extractProjectPath should handle various URL formats", () => {
		const client = new GitLabClient();

		expect(
			client.extractProjectPath("https://gitlab.com/namespace/project"),
		).toBe("namespace/project");
		expect(
			client.extractProjectPath("https://gitlab.com/namespace/sub/project"),
		).toBe("namespace/sub/project");
		expect(
			client.extractProjectPath("https://www.gitlab.com/namespace/project"),
		).toBe("namespace/project");
	});

	test("extractProjectPath should throw error for invalid URL", () => {
		const client = new GitLabClient();

		expect(() => {
			client.extractProjectPath("not-a-url");
		}).toThrow("Invalid GitLab URL: not-a-url");
	});
});
