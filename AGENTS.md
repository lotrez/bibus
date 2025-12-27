# Agent Guidelines for Bibus

This document contains guidelines for AI coding agents working on the Bibus project - a GitLab bot that responds to mentions in merge requests.

## Project Overview

- **Runtime**: Bun (not Node.js)
- **Language**: TypeScript (strict mode)
- **Linter/Formatter**: Biome
- **Package Manager**: Bun

## Build, Lint, and Test Commands

### Running the Application
```bash
bun run index.ts              # Run the main bot
bun run test-bot.ts          # Create a test MR with bot mention
```

### Code Quality
```bash
bun biome check .            # Run formatter, linter, and import sorting
bun biome format --write .   # Format code
bun biome lint .             # Lint code
bun biome ci .               # CI mode (for pre-commit checks)
```

### Environment Setup
```bash
cp .env.example .env         # Copy environment template
# Edit .env with your GitLab token and API URL
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
- Avoid `any` - use `unknown` if type is truly unknown, then narrow with type guards
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
- Always validate environment variables at startup (see `lib/env-vars.ts`)
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
- Place utility functions in `lib/` (e.g., `git.ts`, `env-vars.ts`)
- Keep models/interfaces separate in `gitlab-models.ts`
- Main bot logic goes in `index.ts`
- Test utilities in `test-bot.ts`

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

Optional (for testing):
- `GITLAB_TEST_TOKEN` - Token for test project
- `GITLAB_TEST_PROJECT` - Project ID for testing

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
