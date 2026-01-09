import { describe, expect, test } from "bun:test";
import { GitLabClient } from "../lib/gitlab/gitlab-client";

describe("GitLabClient.extractProjectPath", () => {
	const client = new GitLabClient();

	test("extract project path from full URL", () => {
		const url = "https://gitlab.com/LOTREZ/front-end-bibus-test";
		const result = client.extractProjectPath(url);
		expect(result).toBe("LOTREZ/front-end-bibus-test");
	});

	test("extract project path from URL with www", () => {
		const url = "https://www.gitlab.com/namespace/project";
		const result = client.extractProjectPath(url);
		expect(result).toBe("namespace/project");
	});

	test("extract project path from URL with subgroups", () => {
		const url = "https://gitlab.com/group/subgroup/project";
		const result = client.extractProjectPath(url);
		expect(result).toBe("group/subgroup/project");
	});

	test("extract project path from self-hosted URL", () => {
		const url = "https://gitlab.example.com/namespace/project";
		const result = client.extractProjectPath(url);
		expect(result).toBe("namespace/project");
	});

	test("throw error for invalid URL", () => {
		expect(() => {
			client.extractProjectPath("not-a-url");
		}).toThrow("Invalid GitLab URL: not-a-url");
	});

	test("handle URL with trailing slash", () => {
		const url = "https://gitlab.com/LOTREZ/front-end-bibus-test/";
		const result = client.extractProjectPath(url);
		expect(result).toBe("LOTREZ/front-end-bibus-test/");
	});
});
