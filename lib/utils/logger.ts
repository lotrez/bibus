import pino from "pino";
import { config } from "./config.ts";

/**
 * Logger configuration
 * Log levels: trace, debug, info, warn, error, fatal
 * Uses global config for log level
 */
const logLevel = config.logLevel;

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
								destination: `.logs/bibus.log`,
								mkdir: true,
							},
						},
					],
				}
			: undefined,
});
export default logger;
