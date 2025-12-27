const GITLAB_TOKEN = process.env.GITLAB_TOKEN;
const GITLAB_API_URL = process.env.GITLAB_API_URL;
const OPENCODE_PROVIDER = process.env.OPENCODE_PROVIDER;
const OPENCODE_MODEL = process.env.OPENCODE_MODEL;

// Validate required environment variables
const missingVars: string[] = [];

if (!GITLAB_TOKEN) {
	missingVars.push("GITLAB_TOKEN");
}
if (!GITLAB_API_URL) {
	missingVars.push("GITLAB_API_URL");
}
if (!OPENCODE_PROVIDER) {
	missingVars.push("OPENCODE_PROVIDER");
}
if (!OPENCODE_MODEL) {
	missingVars.push("OPENCODE_MODEL");
}

if (missingVars.length > 0) {
	console.error(
		`Error: Missing required environment variables: ${missingVars.join(", ")}`,
	);
	process.exit(1);
}

// Create typed exports - TypeScript now knows these are not undefined
export const gitlabToken = GITLAB_TOKEN as string;
export const gitlabApiUrl = GITLAB_API_URL as string;
export const opencodeProvider = OPENCODE_PROVIDER as string;
export const opencodeModel = OPENCODE_MODEL as string;
