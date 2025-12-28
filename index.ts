import { GitLabClient } from "./lib/gitlab/gitlab-client";
import { updateProfile } from "./lib/gitlab/profile";
import logger from "./lib/utils/logger";
import { gracefulShutdown } from "./lib/utils/shutdown";
import { startWatching } from "./lib/watch";

// Register signal handlers for graceful shutdown
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

logger.info("Starting bibus bot...");

// test out the gitlab token
export const gitlabClient = new GitLabClient();

await gitlabClient.verifyToken();
export const currentUser = await gitlabClient.getCurrentUser();
await updateProfile();
logger.info(
	{ userId: currentUser.id, username: currentUser.username },
	"Connected as user",
);

await startWatching();
