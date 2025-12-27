import pino from "pino";

/**
 * Logger configuration
 * Log levels: trace, debug, info, warn, error, fatal
 * Set LOG_LEVEL environment variable to control verbosity
 */
const logger = pino({
	level: process.env.LOG_LEVEL || "info",
	transport:
		process.env.NODE_ENV !== "production"
			? {
					target: "pino-pretty",
					options: {
						colorize: true,
						translateTime: "HH:MM:ss",
						ignore: "pid,hostname",
					},
				}
			: undefined,
});

export default logger;
