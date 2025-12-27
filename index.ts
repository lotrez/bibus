import { GitLabClient } from "./lib/gitlab/gitlab-client";
import logger from "./lib/logger";
import { server } from "./lib/opencode-helper";
import { reviewMergeRequest } from "./lib/review";

const AVAILABLE_COMMANDS = ["review"] as const;

logger.info("Starting bibus bot...");

// test out the gitlab token
export const gitlabClient = new GitLabClient();

await gitlabClient.verifyToken();
const currentUser = await gitlabClient.getCurrentUser();
logger.info(
	{ userId: currentUser.id, username: currentUser.username },
	"Connected as user",
);

logger.debug("Fetching to-do items...");
const mentions = await gitlabClient
	.getTodos({ state: "pending" })
	.then((items) =>
		items.filter(
			(item) =>
				item.action_name === "directly_addressed" &&
				item.author.id !== currentUser.id,
		),
	);
logger.info(
	{ count: mentions.length, username: currentUser.username },
	"Direct mentions found",
);

const reviewRequests = mentions.filter((item) => {
	// check if the comment has one of the available commands
	const body = item.body?.toLowerCase() || "";
	return AVAILABLE_COMMANDS.some((command) => body.includes(command));
});
logger.info({ count: reviewRequests.length }, "Review requests found");

// Process reviews sequentially
for (const item of reviewRequests) {
	await reviewMergeRequest(item);
}

logger.info("All reviews completed, closing the server.");
server.close();
process.exit(0);
