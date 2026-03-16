# Single-stage build for gitboard
FROM oven/bun:1.2-alpine

WORKDIR /app

# Copy everything
COPY . .

# Install dependencies at workspace root
RUN bun install

# Build packages
RUN bun run build:packages

# Build dashboard
RUN cd apps/gitboard && bun run build:dashboard

# Remove broken symlinks in app node_modules so bun uses root node_modules
RUN rm -rf apps/beadboard/node_modules apps/gitboard/node_modules

# Non-root user + data directory
RUN addgroup -g 1001 -S forge && adduser -S forge -u 1001 -G forge \
 && mkdir -p /home/forge/.agent-forge && chown forge:forge /home/forge/.agent-forge \
 && chown -R forge:forge /app

USER forge

ENV PORT=3000
ENV NODE_ENV=production

EXPOSE 3000

# Stay in workspace root where node_modules lives
CMD ["bun", "/app/apps/gitboard/src/index.ts"]