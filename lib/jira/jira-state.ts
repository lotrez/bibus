import * as fs from "node:fs";
import * as path from "node:path";
import logger from "../utils/logger";

const STATE_DIR = ".state";
const STATE_FILE = path.join(STATE_DIR, "jira-processed-comments.json");
const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

interface ProcessedComment {
	commentId: string;
	timestamp: number;
}

interface JiraStateData {
	processedComments: ProcessedComment[];
}

function ensureStateDir(): void {
	if (!fs.existsSync(STATE_DIR)) {
		fs.mkdirSync(STATE_DIR, { recursive: true });
	}
}

function readState(): JiraStateData {
	ensureStateDir();
	if (!fs.existsSync(STATE_FILE)) {
		return { processedComments: [] };
	}
	try {
		const content = fs.readFileSync(STATE_FILE, "utf-8");
		return JSON.parse(content) as JiraStateData;
	} catch (error) {
		logger.warn({ error }, "Failed to read Jira state file, starting fresh");
		return { processedComments: [] };
	}
}

function writeState(data: JiraStateData): void {
	ensureStateDir();
	try {
		fs.writeFileSync(STATE_FILE, JSON.stringify(data, null, 2));
	} catch (error) {
		logger.error({ error }, "Failed to write Jira state file");
	}
}

function getMaxAgeMs(): number {
	if (process.env.JIRA_STATE_MAX_AGE_DAYS) {
		const days = parseInt(process.env.JIRA_STATE_MAX_AGE_DAYS, 10);
		if (!Number.isNaN(days)) {
			return days * 24 * 60 * 60 * 1000;
		}
	}
	return DEFAULT_MAX_AGE_MS;
}

function isExpired(entry: ProcessedComment, maxAgeMs: number): boolean {
	return Date.now() - entry.timestamp > maxAgeMs;
}

export const jiraState = {
	getProcessedComments(): Set<string> {
		const data = readState();
		const maxAge = getMaxAgeMs();

		const validEntries = data.processedComments.filter(
			(entry) => !isExpired(entry, maxAge),
		);

		const validIds = new Set(validEntries.map((e) => e.commentId));

		if (validEntries.length !== data.processedComments.length) {
			const removed = data.processedComments.length - validEntries.length;
			logger.debug(
				{ removed, remaining: validIds.size },
				"Cleaned up expired Jira comment entries",
			);
			writeState({ processedComments: validEntries });
		}

		return validIds;
	},

	isProcessed(commentId: string): boolean {
		return this.getProcessedComments().has(commentId);
	},

	markProcessed(commentId: string): void {
		const data = readState();
		const existingIndex = data.processedComments.findIndex(
			(e) => e.commentId === commentId,
		);
		if (existingIndex !== -1) {
			const existing = data.processedComments[existingIndex];
			if (existing) {
				existing.timestamp = Date.now();
			}
		} else {
			data.processedComments.push({
				commentId,
				timestamp: Date.now(),
			});
		}
		writeState(data);
		logger.trace({ commentId }, "Marked Jira comment as processed");
	},

	cleanup(maxAgeMs?: number): number {
		const data = readState();
		const threshold = maxAgeMs ?? getMaxAgeMs();
		const before = data.processedComments.length;
		data.processedComments = data.processedComments.filter(
			(entry) => !isExpired(entry, threshold),
		);
		const removed = before - data.processedComments.length;
		if (removed > 0) {
			writeState(data);
			logger.info({ removed }, "Cleaned up expired Jira comment entries");
		}
		return removed;
	},

	getStats(): { total: number; unexpired: number } {
		const data = readState();
		const maxAge = getMaxAgeMs();
		const unexpired = data.processedComments.filter(
			(e) => !isExpired(e, maxAge),
		).length;
		return { total: data.processedComments.length, unexpired };
	},
};
