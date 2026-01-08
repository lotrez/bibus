import { GitLabClient } from "./gitlab/gitlab-client.ts";
import { updateProfile } from "./gitlab/profile.ts";
import { initializeGlobals } from "./shared.ts";
import logger from "./utils/logger.ts";
import { gracefulShutdown } from "./utils/shutdown.ts";
import { startWatching } from "./watch.ts";

/**
 * Start the Bibus bot
 * Verifies GitLab token, updates profile, and starts watching for mentions
 */
export async function startBot(): Promise<void> {
	// Register signal handlers for graceful shutdown
	process.on("SIGINT", () => gracefulShutdown("SIGINT"));
	process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

	logger.info("Starting bibus bot...");

	// Initialize GitLab client and verify token
	const client = new GitLabClient();

	await client.verifyToken();
	const user = await client.getCurrentUser();

	// Initialize global instances
	initializeGlobals(client);

	await updateProfile();
	logger.info(
		{ userId: user.id, username: user.username },
		"Connected as user",
	);

	await startWatching();
}
