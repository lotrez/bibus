# Finding Discussion ID from Todo

## Problem
GitLab's Todos API doesn't include the `discussion_id`, making it impossible to reply directly to the comment that mentioned you.

## Solution
Use the new `findDiscussionFromTodo` method in `GitLabClient` to match todos with discussions.

## Example Usage

```typescript
import { gitlabClient } from "./index";

// Get pending todos (mentions)
const todos = await gitlabClient.getTodos({ state: "pending" });
const todo = todos[0]; // Example: first todo

// Fetch all discussions for the merge request
const discussions = await gitlabClient.getMergeRequestDiscussions(
  todo.project.id,
  todo.target.iid
);

// Find the specific discussion that created this todo
const discussion = gitlabClient.findDiscussionFromTodo(todo, discussions);

if (discussion) {
  // Reply directly to the discussion thread
  await gitlabClient.replyToDiscussion(
    todo.project.id,
    todo.target.iid,
    discussion.id,
    { body: "Thanks for mentioning me! I'll review this now." }
  );
  
  console.log(`Replied to discussion ${discussion.id}`);
} else {
  // Fallback: create a standalone comment if no match found
  await gitlabClient.createMergeRequestNote(
    todo.project.id,
    todo.target.iid,
    { body: "Starting review..." }
  );
  
  console.log("Created new comment (no matching discussion found)");
}
```

## How It Works

The `findDiscussionFromTodo` method matches by:

1. **Author ID** - The first note's author must match the todo's author
2. **Body Text** - Exact match of the comment body
3. **Creation Date** - Timestamps must be within 5 seconds (configurable)

### Custom Time Tolerance

```typescript
// Use a 10-second tolerance instead of default 5 seconds
const discussion = gitlabClient.findDiscussionFromTodo(todo, discussions, 10000);
```

## API Methods Added

### `getMergeRequestDiscussions(projectId, mergeRequestIid)`
Fetches all discussion threads for a merge request.

### `findDiscussionFromTodo(todo, discussions, timeTolerance?)`
Finds the discussion that matches a todo item.

### `replyToDiscussion(projectId, mergeRequestIid, discussionId, params)`
Replies to a specific discussion thread.
