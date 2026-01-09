# Agent Guidelines for Bibus

This document contains guidelines for AI coding agents working on the Bibus project - a GitLab and Jira bot that responds to mentions in merge requests and Jira issues.

## Project Overview

- **Runtime**: Bun (not Node.js)
- **Language**: TypeScript (strict mode)
- **Linter/Formatter**: Biome
- **Package Manager**: Bun
- **Integrations**: GitLab (required), Jira (optional)

## Build, Lint, and Test Commands

### Running the Application
```bash
bun run index.ts                    # Run the main bot (GitLab + Jira if enabled)
bun run index.ts run                # Explicitly run bot
bun run index.ts mcp                # Run MCP review server only
bun run index.ts --log-level debug  # Run with debug logging
```

### Testing
```bash
bun test                      # Run unit tests (Bun test suite)
bun run scripts/test-bot.ts   # Create a test GitLab MR with bot mention
bun run scripts/test-jira.ts  # Test Jira API integration
bun run scripts/test-mcp.ts   # Test MCP server standalone
```

Unit tests use Bun's built-in test suite. Test files should be named `*.spec.ts` and placed in the `test/` directory.

### Code Quality
```bash
bun biome check .                    # Run formatter, linter, and import sorting
bun biome check --write .            # Apply safe fixes automatically
bun biome check --write --unsafe .   # Apply all fixes (including unsafe)
bun biome format --write .           # Format code only
bun biome lint .                     # Lint code only
bun biome ci .                       # CI mode (for pre-commit checks)
bunx tsc --noEmit                    # TypeScript type checking only
```

### Environment Setup
```bash
cp .env.example .env         # Copy environment template
# Edit .env with your tokens and API URLs

# Required variables:
# - GITLAB_TOKEN, GITLAB_API_URL
# - OPENCODE_PROVIDER, OPENCODE_MODEL

# Optional Jira variables (set ENABLE_JIRA=true to activate):
# - JIRA_API_URL, JIRA_EMAIL, JIRA_API_TOKEN
# - JIRA_PROJECT_KEYS, JIRA_POLLING_INTERVAL_MS

# Run with custom log level
LOG_LEVEL=debug bun run index.ts
```

## Code Style Guidelines

### Imports
- Use explicit imports with `.ts` extensions (enabled by `allowImportingTsExtensions`)
- Group imports logically: Node.js built-ins first, then local modules
- Use named imports over default imports when possible
- Example:
  ```typescript
  import { execSync } from "node:child_process";
  import * as fs from "node:fs";
  import { GitLabClient } from "./lib/gitlab/gitlab-client";
  import type { Todo, GetTodosParams } from "./lib/gitlab/gitlab-models";
  ```

### TypeScript Types
- **Always use explicit types** for function parameters and return values
- Use `interface` for object shapes, `type` for unions/intersections
- Place all type definitions in `lib/gitlab/gitlab-models.ts` for GitLab API responses
- Place Jira type definitions in `lib/jira/jira-models.ts` for Jira API responses
- Avoid `any` - use `unknown` if type is truly unknown, then narrow with type guards
- Explicit return types on functions are optional if inferred type is clear
- Example:
  ```typescript
  async function getTodos(params?: GetTodosParams): Promise<Todo[]> {
    // implementation
  }
  ```

### Naming Conventions
- **Files**: `kebab-case.ts` (e.g., `gitlab-client.ts`, `gitlab-models.ts`)
- **Classes**: `PascalCase` (e.g., `GitLabClient`)
- **Functions/Variables**: `camelCase` (e.g., `getCurrentUser`, `testToken`)
- **Interfaces/Types**: `PascalCase` (e.g., `PersonalAccessToken`, `TodoAction`)
- **Constants**: `SCREAMING_SNAKE_CASE` for true constants (e.g., `GITLAB_TOKEN`)
- **Private class members**: prefix with `private` keyword, use `camelCase`

### Error Handling
- Always validate environment variables at startup (see `lib/utils/env-vars.ts`)
- Use descriptive error messages with context
- Check HTTP responses with `if (!response.ok)` before parsing
- Include response status and text in error messages
- Example:
  ```typescript
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Invalid GitLab token: 401 Unauthorized");
    }
    const errorText = await response.text();
    throw new Error(
      `Failed to create branch: ${response.status} ${response.statusText}\n${errorText}`
    );
  }
  ```

### Async/Await
- Use `async/await` over raw Promises
- Always `await` async operations
- Use `try/finally` for cleanup operations (e.g., temp directory cleanup)

### Comments and Documentation
- Add JSDoc comments for public functions with `@param`, `@returns`, `@throws`
- Use inline comments sparingly - code should be self-documenting
- Example:
  ```typescript
  /**
   * Clone a GitLab project to a temporary directory
   * @param projectUrl - The GitLab project URL
   * @param branch - Optional branch name to clone
   * @returns Object with the cloned directory path and cleanup function
   */
  export function cloneToTemp(projectUrl: string, branch?: string): CloneResult {
    // implementation
  }
  ```

### Code Organization
- Place GitLab API client code in `lib/gitlab/`
- Place Jira API client code in `lib/jira/`
- Place utility functions in `lib/` (e.g., `git.ts`, `env-vars.ts`, `logger.ts`)
- Keep models/interfaces separate in `gitlab-models.ts` and `jira-models.ts`
- Main bot logic goes in `index.ts`
- Test utilities in `test-bot.ts`
- MCP server code in `lib/mcp-review-server.ts`
- OpenCode integration helpers in `lib/opencode-helper.ts`

### Logging
- Use Pino logger from `lib/logger.ts` instead of `console.log`
- Log levels: `trace`, `debug`, `info`, `warn`, `error`, `fatal`
- Include structured context in logs
- Example:
  ```typescript
  import logger from "./lib/logger";
  
  logger.info("Starting operation");
  logger.debug({ count: items.length }, "Items processed");
  logger.error({ error: err.message }, "Operation failed");
  ```
- See `LOGGING.md` for detailed logging guidelines

### GitLab API Patterns
- Always use `encodeURIComponent()` for URL parameters
- Include proper headers: `PRIVATE-TOKEN` and `Content-Type: application/json`
- Use typed responses: `const data = (await response.json()) as TypeName;`
- Cache user info to reduce API calls (see `GitLabClient.currentUserCache`)

### Git Operations
- Temporary clones go in `.temp/` directory (auto-created, git-ignored)
- Always provide cleanup functions that remove temp directories
- Use `execSync` with `stdio: "inherit"` for git commands to show output
- Set `GIT_TERMINAL_PROMPT: "0"` to prevent interactive prompts

### Formatting Preferences
- Use tabs for indentation (biome default)
- Use double quotes for strings
- Semicolons required
- Trailing commas in multiline structures
- Max line length: flexible, prioritize readability

## Environment Variables

Required (in `.env`):
- `GITLAB_TOKEN` - Your GitLab personal access token
- `GITLAB_API_URL` - GitLab API URL (default: https://gitlab.com/api/v4)
- `OPENCODE_PROVIDER` - OpenCode AI provider (e.g., "anthropic")
- `OPENCODE_MODEL` - OpenCode AI model (e.g., "claude-3-5-sonnet-20241022")

Optional (for testing):
- `GITLAB_TEST_TOKEN` - Token for test project
- `GITLAB_TEST_PROJECT` - Project ID for testing

Optional (for Jira integration):
- `ENABLE_JIRA` - Set to "true" to enable Jira integration
- `JIRA_API_URL` - Jira Cloud URL (e.g., https://your-domain.atlassian.net)
- `JIRA_EMAIL` - Email for Jira authentication
- `JIRA_API_TOKEN` - Jira API token (create at https://id.atlassian.com/manage-profile/security/api-tokens)
- `JIRA_POLLING_INTERVAL_MS` - Polling interval for Jira mentions (default: 60000)
- `JIRA_PROJECT_KEYS` - Comma-separated list of Jira project keys to monitor

## TypeScript Configuration Notes

- **Strict mode enabled**: All strict checks are on
- **Module resolution**: `bundler` mode (for Bun)
- **No emit**: TypeScript is used only for type checking
- **Verbatim module syntax**: Use `import type` for type-only imports
- **No unchecked indexed access**: Arrays/objects require null checks

## Common Patterns

### API Client Method Pattern
```typescript
async methodName(params: ParamsType): Promise<ReturnType> {
  const response = await fetch(`${this.apiUrl}/endpoint`, {
    method: "GET",
    headers: {
      "PRIVATE-TOKEN": this.token,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as ReturnType;
}
```

### Cleanup Pattern
```typescript
const resource = acquireResource();
try {
  // use resource
} finally {
  resource.cleanup();
}
```

## Additional Notes

- Avoid GitLab branch names with forward slashes (causes hierarchy conflicts)
- Fetch remote branches before checking them out locally
- Use GitLab Files API for commits rather than local git commits
- Test scripts should be idempotent and self-cleaning

## Architecture: Review System with MCP Server

### Overview
The review system uses an MCP (Model Context Protocol) server that posts comments directly to GitLab in real-time as the AI generates them.

### Components

1. **Main Bot (`index.ts`)**: Polls GitLab for todo items (mentions) and triggers reviews
2. **Review Module (`lib/review.ts`)**: Orchestrates the review process, clones the MR branch, and creates the OpenCode session
3. **OpenCode Helper (`lib/opencode-helper.ts`)**: Manages OpenCode client/server, creates review sessions, and tracks comment counts
4. **MCP Review Server (`lib/mcp-review-server.ts`)**: Standalone process that provides the `post_review_comment` tool and posts comments directly to GitLab via API

### Review Flow

1. Bot detects a mention in a merge request
2. `reviewMergeRequest()` clones the MR branch to a temp directory
3. Creates an OpenCode client with MCP server configured
4. AI receives prompt to review the code using git diff (prompt includes projectId and mrIid)
5. For each issue found, AI calls `post_review_comment` tool:
   - Tool call includes projectId and mrIid as parameters
   - MCP server receives GitLab credentials from env
   - MCP server **immediately** posts comment to GitLab API
   - Returns confirmation to AI
6. Main process tracks comment count via OpenCode event stream
7. After review completes, posts summary if provided

### Key Design Decisions

- **Direct posting in MCP**: Comments are posted immediately when the tool is called, not batched or queued
- **Separate process**: MCP server runs as independent process, communicates via stdio
- **Tool parameters for context**: `projectId` and `mrIid` are passed as tool parameters in each call, NOT as environment variables. This allows the same MCP server to handle multiple MRs.
- **Real-time feedback**: Each comment appears on GitLab as soon as AI generates it
- **No callback chain**: Removed callback-based posting from event stream; MCP handles it directly
- **File logging**: MCP server logs to `mcp-server.log` in the project root for debugging

### MCP Server Details

**Environment variables required by MCP server:**
- `GITLAB_TOKEN` - GitLab API token (from main process env)
- `GITLAB_API_URL` - GitLab API URL (from main process env)

**Tool: `post_review_comment`**
- Parameters: projectId, mrIid, file, line, severity, comment, suggestedCode, suggestionLinesAbove, suggestionLinesBelow
- **IMPORTANT**: projectId and mrIid are required tool parameters, NOT environment variables
- Action: Formats comment with severity badge and optional code suggestion, posts to GitLab immediately
- Returns: Confirmation message to AI with posted comment details

**Logging:**
- MCP server writes logs to `mcp-server.log` in project root
- Logs include timestamps, log levels (INFO, DEBUG, WARN, ERROR), and structured data
- Logs are also written to stderr for immediate visibility

### Error Handling

- MCP server validates environment variables on startup, exits if missing
- Failed comment posts are caught and reported back to AI as tool errors
- Main process logs tool execution for debugging
- Temp directory cleanup always runs in finally block
