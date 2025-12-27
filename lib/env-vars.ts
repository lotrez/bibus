const GITLAB_TOKEN = process.env.GITLAB_TOKEN;
const GITLAB_API_URL = process.env.GITLAB_API_URL;

// say all of the env variables missing
if (!GITLAB_TOKEN) {
	console.error("Error: GITLAB_TOKEN is not set in environment variables.");
}
if (!GITLAB_API_URL) {
	console.error("Error: GITLAB_API_URL is not set in environment variables.");
}
if (!GITLAB_TOKEN || !GITLAB_API_URL) {
	process.exit(1);
}
// export as string variables
// Create typed exports
export const gitlabToken: string = GITLAB_TOKEN;
export const gitlabApiUrl: string = GITLAB_API_URL;
