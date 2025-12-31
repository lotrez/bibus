/**
 * Global application configuration
 * This module provides a singleton config object that can be mutated by the CLI
 * and read by other parts of the application.
 *
 * @example
 * // In any module, import and use the config
 * import { config } from "./utils/config.ts";
 *
 * console.log(config.logLevel); // "info" or CLI-provided value
 * console.log(config.configPath); // "config/agents.json" or CLI-provided value
 *
 * @example
 * // To update config programmatically
 * import { updateConfig } from "./utils/config.ts";
 *
 * updateConfig({ logLevel: "debug" });
 */

export interface AppConfig {
	logLevel: string;
	configPath: string;
}

/**
 * Global configuration object
 * Default values are set from environment variables or hardcoded defaults
 * Can be overridden by CLI arguments via updateConfig()
 */
export const config: AppConfig = {
	logLevel: process.env.LOG_LEVEL || "info",
	configPath: process.env.BIBUS_CONFIG || "config/agents.json",
};

/**
 * Update configuration values
 * @param updates - Partial config object with values to update
 */
export function updateConfig(updates: Partial<AppConfig>): void {
	// Only update defined values
	for (const [key, value] of Object.entries(updates)) {
		if (value !== undefined) {
			config[key as keyof AppConfig] = value as never;
		}
	}
}
