import { GitLabClient } from "./lib/gitlab/gitlab-client";
import logger from "./lib/logger";

/**
 * Example usage of the modifyCurrentUser and uploadCurrentUserAvatar methods
 *
 * This demonstrates how to:
 * 1. Update the bot's profile information
 * 2. Upload a new avatar image
 */

async function updateProfile() {
	try {
		const client = new GitLabClient();

		// Example 1: Modify user profile
		logger.info("Updating user profile...");
		const updatedUser = await client.modifyCurrentUser({
			bio: "I'm a helpful GitLab bot that reviews merge requests!",
			location: "The Cloud",
			website_url: "https://github.com/yourusername/bibus",
			pronouns: "it/its",
			// You can also update other fields:
			// public_email: "bot@example.com",
			// linkedin: "your-linkedin",
			// twitter: "your-twitter",
			// discord: "your-discord",
			// github: "your-github",
		});

		logger.info(`Profile updated for user: ${updatedUser.username}`);
		logger.info(`New bio: ${updatedUser.bio}`);
		logger.info(`Location: ${updatedUser.location}`);

		// Example 2: Upload avatar (uncomment and provide a valid image path)
		// Note: Image must be ≤200 KB and one of: .bmp, .gif, .ico, .jpeg, .png, .tiff
		/*
		logger.info("Uploading avatar...");
		const avatarResult = await client.uploadCurrentUserAvatar("/path/to/avatar.png");
		logger.info(`Avatar uploaded: ${avatarResult.avatar_url}`);
		*/

		logger.info("✅ Profile update completed successfully!");
	} catch (error) {
		logger.error(
			{ error: error instanceof Error ? error.message : String(error) },
			"Failed to update profile",
		);
		process.exit(1);
	}
}

updateProfile();
