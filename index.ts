import { GitLabClient } from "./lib/gitlab/gitlab-client";
import { rewiewMergeRequest } from "./lib/review";

const _AVAILABLE_COMMANDS = ["review"] as const;

console.log("Starting bibus bot...");

// test out the gitlab token
export const gitlabClient = new GitLabClient();

await gitlabClient.verifyToken();
const currentUser = await gitlabClient.getCurrentUser();
console.log(
	`Connected as user: ${currentUser.username} (ID: ${currentUser.id})`,
);
console.log("Fetching to-do items...");
const mentions = await gitlabClient
	.getTodos({ state: "pending" })
	.then((items) =>
		items.filter(
			(item) =>
				item.action_name === "directly_addressed" &&
				item.author.id !== currentUser.id,
		),
	);
console.log(
	`There are ${mentions.length} direct mentions of ${currentUser.username}.`,
);

const reviewRequests = mentions.filter((item) =>
	item.body?.toLowerCase().includes("review"),
);
console.log(`There are ${reviewRequests.length} review requests.`);
reviewRequests.forEach(async (item, _indexx) => {
	await rewiewMergeRequest(item);
});
