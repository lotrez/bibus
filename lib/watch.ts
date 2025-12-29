import { currentUser, gitlabClient } from "..";
import { reviewMergeRequest } from "./opencode/review";
import logger from "./utils/logger";

const POLLING_INTERVAL_MS = 5000;
const AVAILABLE_COMMANDS = ["review"] as const;

// Keep track of MRs currently being processed to avoid duplicate work
const MRS_IN_PROGRESS = new Set<number>();

async function detectCommands() {
	logger.trace("Fetching to-do items...");
	// right now we only handle direct mentions
	const mentions = await gitlabClient
		.getTodos({ state: "pending" })
		.then((items) =>
			items.filter(
				(item) =>
					item.action_name === "directly_addressed" &&
					item.author.id !== currentUser.id,
			),
		);
	if (mentions.length > 0) {
		logger.debug(
			{ count: mentions.length, username: currentUser.username },
			"Direct mentions found",
		);
	}
	const validRequests = mentions.filter((item) => {
		// check if the comment has one of the available commands
		const body = item.body?.toLowerCase() || "";
		return AVAILABLE_COMMANDS.some((command) => body.includes(command));
	});
	// process each valid request
	await Promise.allSettled(
		validRequests
			.filter((item) => !MRS_IN_PROGRESS.has(item.target.id))
			.map((item) => {
				MRS_IN_PROGRESS.add(item.target.id);
				return reviewMergeRequest(item).finally(() => {
					MRS_IN_PROGRESS.delete(item.target.id);
				});
			}),
	);
	logger.trace({ count: validRequests.length }, "Review requests found");
}

export async function startWatching() {
	const interval = setInterval(async () => {
		await detectCommands();
	}, POLLING_INTERVAL_MS);
	await detectCommands(); // Initial immediate check
	return interval;
}
