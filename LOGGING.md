# Logging with Pino

This project uses [Pino](https://getpino.io/) for fast, structured logging with log levels.

## Log Levels

Pino supports the following log levels (from lowest to highest priority):

- `trace` - Very detailed debugging information
- `debug` - Debugging information
- `info` - General informational messages (default)
- `warn` - Warning messages
- `error` - Error messages
- `fatal` - Fatal errors that cause application termination

## Configuration

Set the `LOG_LEVEL` environment variable to control which logs are shown:

```bash
# In your .env file
LOG_LEVEL=debug  # Show debug, info, warn, error, fatal

# Or when running the application
LOG_LEVEL=trace bun run index.ts
```

If `LOG_LEVEL` is not set, it defaults to `info`.

## Usage Examples

```typescript
import logger from "./lib/logger";

// Simple messages
logger.info("Starting application");
logger.debug("Debug information");
logger.warn("Warning message");
logger.error("Error occurred");

// Structured logging with context
logger.info({ userId: 123, username: "john" }, "User logged in");
logger.error({ error: err.message, stack: err.stack }, "Failed to process request");

// Logging with data objects
logger.debug({ 
  count: mentions.length, 
  username: currentUser.username 
}, "Direct mentions found");

// Child loggers for specific contexts
const requestLogger = logger.child({ requestId: "abc-123" });
requestLogger.info("Processing request");
requestLogger.error("Request failed");
```

## Output Format

### Development Mode
In development (when `NODE_ENV !== "production"`), logs are formatted with `pino-pretty` for human readability:

```
[14:30:45] INFO: Starting bibus bot...
[14:30:46] INFO (userId: 123, username: "ask-bibus"): Connected as user
[14:30:47] INFO (count: 5): Direct mentions found
```

### Production Mode
In production, logs are output as JSON for easy parsing:

```json
{"level":30,"time":1703686245000,"msg":"Starting bibus bot..."}
{"level":30,"time":1703686246000,"userId":123,"username":"ask-bibus","msg":"Connected as user"}
```

## Best Practices

1. **Use appropriate log levels**:
   - `trace/debug` for development and troubleshooting
   - `info` for important application events
   - `warn` for recoverable issues
   - `error` for errors that need attention
   - `fatal` for critical failures

2. **Include context in logs**:
   ```typescript
   // Good
   logger.info({ projectId: 123, mrId: 456 }, "Processing merge request");
   
   // Avoid
   logger.info("Processing merge request");
   ```

3. **Don't log sensitive data**:
   ```typescript
   // Bad
   logger.debug({ token: gitlabToken }, "Making API call");
   
   // Good
   logger.debug({ endpoint: "/api/v4/projects" }, "Making API call");
   ```

4. **Use child loggers for context**:
   ```typescript
   const mrLogger = logger.child({ projectId: project.id, mrId: mr.iid });
   mrLogger.info("Starting review");
   mrLogger.debug("Cloning repository");
   mrLogger.info("Review completed");
   ```

## Replacing console.log

Instead of `console.log`, `console.error`, etc., use the logger:

```typescript
// Before
console.log("Starting bot...");
console.error("Failed to connect:", error);

// After
logger.info("Starting bot...");
logger.error({ error: error.message }, "Failed to connect");
```

## Environment Variables

```bash
# Set log level
LOG_LEVEL=debug

# Production mode (JSON output)
NODE_ENV=production
```
