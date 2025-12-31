# Build stage
FROM oven/bun:1 AS builder

WORKDIR /app

# Copy package files
COPY package.json bun.lock ./

# Install ALL dependencies (including dev dependencies for pino-pretty)
RUN bun install

# Copy source code
COPY . .

# Build the executable with NODE_ENV=production to skip pino-pretty at runtime
RUN NODE_ENV=production bun build ./index.ts --compile --outfile ./dist/bibus

# Export stage - use scratch for minimal image with just the binary
FROM scratch AS export

# Copy the compiled binary
COPY --from=builder /app/dist/bibus /bibus

# Runtime stage (optional - if you want to run it)
FROM oven/bun:1 AS runtime

WORKDIR /app

# Install git (needed for cloning MR branches) and OpenCode CLI
RUN apt-get update && \
    apt-get install -y git && \
    rm -rf /var/lib/apt/lists/* && \
    bun install -g opencode-ai

# Copy the compiled binary from builder
COPY --from=builder /app/dist/bibus /app/bibus

# Make it executable
RUN chmod +x /app/bibus

# Set NODE_ENV to production (logger will skip pino-pretty)
ENV NODE_ENV=production

# Set entrypoint
ENTRYPOINT ["/app/bibus"]
