import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { updateConfig } from "./config.ts";

/**
 * Create and configure the CLI using yargs
 * @returns Configured yargs instance
 */
export function createCli() {
	return yargs(hideBin(process.argv))
		.scriptName("bibus")
		.usage("$0 [command] [options]")
		.version(false)
		.command(
			["run", "$0"],
			"Start the bot and watch for GitLab mentions (default)",
			() => {},
			async (argv) => {
				// Update global config with CLI options
				updateConfig({
					logLevel: argv.logLevel as string | undefined,
					configPath: argv.config as string | undefined,
				});

				// Import logger after config is set
				const logger = (await import("./logger.ts")).default;

				logger.info("Starting bot in run mode");
				const { startBot } = await import("../bot.ts");
				await startBot();
			},
		)
		.command(
			"mcp",
			"Start the MCP review server",
			() => {},
			async (argv) => {
				// Update global config with CLI options
				updateConfig({
					logLevel: argv.logLevel as string | undefined,
					configPath: argv.config as string | undefined,
				});

				// Import logger after config is set
				const logger = (await import("./logger.ts")).default;
				logger.info("Starting MCP review server");
				// Import and run the MCP server
				await import("../gitlab/mcp-review-server.ts");
			},
		)
		.option("log-level", {
			alias: "l",
			type: "string",
			description: "Set log level",
			choices: ["trace", "debug", "info", "warn", "error", "fatal"],
		})
		.option("config", {
			alias: "c",
			type: "string",
			description: "Path to config file",
			default: "config/agents.json",
		})
		.help()
		.alias("help", "h")
		.example("$0", "Start bot with default settings")
		.example("$0 run", "Explicitly start bot")
		.example("$0 --log-level debug", "Start bot with debug logging")
		.example("$0 mcp", "Start MCP server")
		.example(
			"$0 --log-level trace --config ./my-config.json",
			"Start bot with custom config and trace logging",
		)
		.epilogue(
			"For more information, visit: https://github.com/yourusername/bibus",
		)
		.strict();
}
