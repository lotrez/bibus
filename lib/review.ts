import { gitlabClient } from "..";
import { cloneToTemp } from "./git";
import type { Todo } from "./gitlab/gitlab-models";

export async function rewiewMergeRequest(item: Todo) {
	// Placeholder function for reviewing a merge request
	console.log("Reviewing merge request...");
	// get the project, use the url to clone it
	const projectDetails = await gitlabClient.getProject(item.project.id);
	// clone the merge request
	const cloneResult = await cloneToTemp(
		projectDetails.http_url_to_repo,
		item.target.source_branch,
	);
	// delete the temp directory after use
	cloneResult.cleanup();
}
