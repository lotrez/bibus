import { server } from "../opencode/opencode-helper";
import logger from "./logger";

let isShuttingDown = false;

export async function gracefulShutdown(signal: string) {
	if (isShuttingDown) {
		logger.warn("Shutdown already in progress, forcing exit...");
		process.exit(1);
	}
	isShuttingDown = true;

	logger.info({ signal }, "Received shutdown signal, closing server...");
	try {
		await server.close();
		logger.info("Server closed successfully");
		process.exit(0);
	} catch (error) {
		logger.error(
			{ error: error instanceof Error ? error.message : String(error) },
			"Error during shutdown",
		);
		process.exit(1);
	}
}
