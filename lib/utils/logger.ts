import pino from "pino";

const commandUsed =
	process.argv[1]?.replaceAll("\\", "/")?.split("/")[
		process.argv[1]?.replaceAll("\\", "/")?.split("/").length - 1
	] || "bibus";

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
					targets: [
						{
							target: "pino-pretty",
							options: {
								colorize: true,
								translateTime: "HH:MM:ss",
								ignore: "pid,hostname",
							},
						},
						{
							level: "trace",
							target: "pino/file",
							options: {
								destination: `.logs/${commandUsed}.log`,
								mkdir: true,
							},
						},
					],
				}
			: undefined,
});

export default logger;
