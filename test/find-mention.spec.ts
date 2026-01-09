import { describe, expect, test } from "bun:test";
import type { ADF, JiraComment, JiraUser } from "../lib/jira/jira-models.ts";

function extractPlainTextFromADF(body: string | ADF): string {
	if (typeof body === "string") {
		return body;
	}

	if (!body.content) return "";

	let text = "";
	for (const node of body.content) {
		if (node.type === "paragraph" && node.content) {
			for (const child of node.content) {
				if (child.type === "text" && child.text) {
					text += `${child.text} `;
				}
			}
		}
	}
	return text.trim();
}

function findMentionComment(
	comments: JiraComment[],
	currentUserId: string,
	processedComments: Set<string>,
): JiraComment | null {
	const sortedComments = [...comments].sort(
		(a, b) => new Date(b.created).getTime() - new Date(a.created).getTime(),
	);

	for (const comment of sortedComments) {
		if (comment.author.accountId === currentUserId) {
			continue;
		}

		if (processedComments.has(comment.id)) {
			continue;
		}

		const plainText = extractPlainTextFromADF(comment.body);
		const commentBody = comment.body;
		if (typeof commentBody !== "string" && commentBody.content) {
			const bodyJson = JSON.stringify(commentBody.content);
			if (bodyJson.includes(currentUserId)) {
				return comment;
			}
		}

		if (plainText.includes(currentUserId)) {
			return comment;
		}
	}

	return null;
}

function createMockUser(accountId: string, displayName: string): JiraUser {
	return {
		accountId,
		accountType: "atlassian",
		active: true,
		avatarUrls: {
			"16x16": "",
			"24x24": "",
			"32x32": "",
			"48x48": "",
		},
		displayName,
		self: "",
	};
}

function createMockComment(
	id: string,
	author: JiraUser,
	body: ADF | string,
	created: string,
): JiraComment {
	return {
		id,
		self: "",
		author,
		body,
		created,
		updated: created,
	};
}

function createADFWithMention(text: string, mentionId: string): ADF {
	return {
		type: "doc",
		version: 1,
		content: [
			{
				type: "paragraph",
				content: [
					{
						type: "text",
						text: text,
					},
					{
						type: "mention",
						attrs: {
							id: mentionId,
						},
					},
					{
						type: "text",
						text: " please review",
					},
				],
			},
		],
	};
}

function createADFWithoutMention(text: string): ADF {
	return {
		type: "doc",
		version: 1,
		content: [
			{
				type: "paragraph",
				content: [
					{
						type: "text",
						text,
					},
				],
			},
		],
	};
}

describe("findMentionComment", () => {
	const BOT_USER_ID = "bot-123";
	const USER_A = createMockUser("user-a", "Alice");
	const USER_B = createMockUser("user-b", "Bob");
	const BOT_USER = createMockUser(BOT_USER_ID, "Bibus Bot");

	test("find mention in ADF format", () => {
		const processedComments = new Set<string>();

		const comments: JiraComment[] = [
			createMockComment(
				"comment-1",
				USER_A,
				createADFWithMention("Hey ", BOT_USER_ID),
				"2024-01-01T10:00:00Z",
			),
		];

		const result = findMentionComment(comments, BOT_USER_ID, processedComments);
		expect(result?.id).toBe("comment-1");
	});

	test("find mention in plain text (string body)", () => {
		const processedComments = new Set<string>();

		const comments: JiraComment[] = [
			createMockComment(
				"comment-2",
				USER_A,
				`Hey bot-123 please help`,
				"2024-01-01T10:00:00Z",
			),
		];

		const result = findMentionComment(comments, BOT_USER_ID, processedComments);
		expect(result?.id).toBe("comment-2");
	});

	test("skip bot's own comments", () => {
		const processedComments = new Set<string>();

		const comments: JiraComment[] = [
			createMockComment(
				"comment-3",
				BOT_USER,
				createADFWithMention("I am ", BOT_USER_ID),
				"2024-01-01T10:00:00Z",
			),
		];

		const result = findMentionComment(comments, BOT_USER_ID, processedComments);
		expect(result).toBeNull();
	});

	test("skip already processed comments", () => {
		const processedComments = new Set<string>(["comment-4"]);

		const comments: JiraComment[] = [
			createMockComment(
				"comment-4",
				USER_A,
				createADFWithMention("Hey ", BOT_USER_ID),
				"2024-01-01T10:00:00Z",
			),
		];

		const result = findMentionComment(comments, BOT_USER_ID, processedComments);
		expect(result).toBeNull();
	});

	test("return newest unprocessed mention", () => {
		const processedComments = new Set<string>();

		const comments: JiraComment[] = [
			createMockComment(
				"comment-5a",
				USER_A,
				createADFWithMention("First mention ", BOT_USER_ID),
				"2024-01-01T10:00:00Z",
			),
			createMockComment(
				"comment-5b",
				USER_B,
				createADFWithMention("Second mention ", BOT_USER_ID),
				"2024-01-01T11:00:00Z",
			),
			createMockComment(
				"comment-5c",
				USER_A,
				createADFWithMention("Third mention ", BOT_USER_ID),
				"2024-01-01T12:00:00Z",
			),
		];

		const result = findMentionComment(comments, BOT_USER_ID, processedComments);
		expect(result?.id).toBe("comment-5c");
	});

	test("no mention found", () => {
		const processedComments = new Set<string>();

		const comments: JiraComment[] = [
			createMockComment(
				"comment-6",
				USER_A,
				createADFWithoutMention("Just a regular comment"),
				"2024-01-01T10:00:00Z",
			),
		];

		const result = findMentionComment(comments, BOT_USER_ID, processedComments);
		expect(result).toBeNull();
	});

	test("find newest unprocessed mention, skip processed", () => {
		const processedComments = new Set<string>(["comment-7c"]);

		const comments: JiraComment[] = [
			createMockComment(
				"comment-7a",
				USER_A,
				createADFWithMention("First mention ", BOT_USER_ID),
				"2024-01-01T10:00:00Z",
			),
			createMockComment(
				"comment-7b",
				USER_B,
				createADFWithMention("Second mention ", BOT_USER_ID),
				"2024-01-01T11:00:00Z",
			),
			createMockComment(
				"comment-7c",
				USER_A,
				createADFWithMention("Third mention (processed) ", BOT_USER_ID),
				"2024-01-01T12:00:00Z",
			),
		];

		const result = findMentionComment(comments, BOT_USER_ID, processedComments);
		expect(result?.id).toBe("comment-7b");
	});

	test("handle empty comments array", () => {
		const processedComments = new Set<string>();

		const comments: JiraComment[] = [];

		const result = findMentionComment(comments, BOT_USER_ID, processedComments);
		expect(result).toBeNull();
	});

	test("find mention in complex ADF with nested content", () => {
		const processedComments = new Set<string>();

		const complexADF: ADF = {
			type: "doc",
			version: 1,
			content: [
				{
					type: "paragraph",
					content: [
						{
							type: "text",
							text: "Hey ",
						},
						{
							type: "mention",
							attrs: {
								id: BOT_USER_ID,
								text: "@Bibus Bot",
							},
						},
						{
							type: "text",
							text: " can you ",
						},
						{
							type: "strong",
							content: [
								{
									type: "text",
									text: "review",
								},
							],
						},
						{
							type: "text",
							text: " this?",
						},
					],
				},
			],
		};

		const comments: JiraComment[] = [
			createMockComment(
				"comment-9",
				USER_A,
				complexADF,
				"2024-01-01T10:00:00Z",
			),
		];

		const result = findMentionComment(comments, BOT_USER_ID, processedComments);
		expect(result?.id).toBe("comment-9");
	});

	test("find mention in mixed comment types (string and ADF)", () => {
		const processedComments = new Set<string>();

		const comments: JiraComment[] = [
			createMockComment(
				"comment-10a",
				USER_A,
				"Plain text without mention",
				"2024-01-01T10:00:00Z",
			),
			createMockComment(
				"comment-10b",
				USER_B,
				createADFWithoutMention("ADF without mention"),
				"2024-01-01T11:00:00Z",
			),
			createMockComment(
				"comment-10c",
				USER_A,
				`Hey ${BOT_USER_ID} please help`,
				"2024-01-01T12:00:00Z",
			),
		];

		const result = findMentionComment(comments, BOT_USER_ID, processedComments);
		expect(result?.id).toBe("comment-10c");
	});
});
