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
const logLevel = process.env.LOG_LEVEL || "info";

const logger = pino({
	level: logLevel,
	transport:
		process.env.NODE_ENV !== "production"
			? {
					targets: [
						{
							level: logLevel,
							target: "pino-pretty",
							options: {
								colorize: true,
								translateTime: "HH:MM:ss",
								ignore: "pid,hostname",
							},
						},
						{
							level: logLevel,
							target: "pino-pretty",
							options: {
								colorize: false,
								translateTime: "yyyy-mm-dd HH:MM:ss",
								ignore: "pid,hostname",
								destination: `.logs/${commandUsed}.log`,
								mkdir: true,
							},
						},
					],
				}
			: undefined,
});
export default logger;
