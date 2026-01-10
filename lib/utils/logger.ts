import pino from "pino";
import { config } from "./config.ts";

const logger = pino({
	level: config.logLevel,
	transport:
		process.env.NODE_ENV !== "production"
			? {
					targets: [
						{
							level: config.logLevel,
							target: "pino-pretty",
							options: {
								colorize: true,
								translateTime: "HH:MM:ss",
								ignore: "pid,hostname",
							},
						},
						{
							level: config.logLevel,
							target: "pino/file",
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
