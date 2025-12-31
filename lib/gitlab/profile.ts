import { gitlabClient } from "../shared.ts";
import logger from "../utils/logger";

export const updateProfile = async () => {
	logger.info("Updating bot profile...");
	await Promise.allSettled([
		gitlabClient.modifyCurrentUser({
			bio: "Bibous Bot - Meow",
			name: "Bibous Bot",
		}),
		gitlabClient.uploadCurrentUserAvatar("assets/bibous.png"),
	]);
};
