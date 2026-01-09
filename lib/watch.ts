import {
	determineMessageType,
	GITLAB_COMMANDS,
} from "./opencode/message-router";
import { answerQuestion } from "./opencode/question.ts";
import { reviewMergeRequest } from "./opencode/review";
import { testMergeRequest } from "./opencode/test.ts";
import { gitlabClient } from "./shared.ts";
import { pollingIntervalMs } from "./utils/env-vars.ts";
import logger from "./utils/logger";

const POLLING_INTERVAL_MS = pollingIntervalMs;
export const AVAILABLE_COMMANDS = GITLAB_COMMANDS;

// Keep track of MRs currently being processed to avoid duplicate work
const MRS_IN_PROGRESS = new Set<number>();

async function detectCommands() {
	const currentUser = await gitlabClient.getCurrentUser();
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

	// for each message, ask the ai to classify it and then process accordingly
	await Promise.allSettled(
		mentions.map(async (item) => {
			if (MRS_IN_PROGRESS.has(item.target.id)) {
				logger.debug(
					{
						mrIid: item.target.iid,
						projectId: item.project.id,
					},
					"MR already in progress, skipping",
				);
				return;
			}
			if (!item.body) return;
			MRS_IN_PROGRESS.add(item.target.id);
			const type = await determineMessageType(item.body || "", "gitlab");
			switch (type) {
				case "review":
					await reviewMergeRequest(item);
					break;
				case "general_question":
					await answerQuestion(item);
					break;
				case "test":
					await testMergeRequest(item);
					break;
				default:
					logger.warn(
						{ type, mrIid: item.target.iid },
						"Unknown message type detected",
					);
			}
			MRS_IN_PROGRESS.delete(item.target.id);
		}),
	);
}

export async function startWatching() {
	const interval = setInterval(async () => {
		await detectCommands();
	}, POLLING_INTERVAL_MS);
	await detectCommands(); // Initial immediate check
	return interval;
}
