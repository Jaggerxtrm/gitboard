# Single-stage build for gitboard
FROM oven/bun:1.2-alpine

WORKDIR /app

# Copy everything
COPY . .

# Install dependencies
RUN bun install

# Build packages
RUN bun run build:packages

# Build dashboard
RUN cd apps/gitboard && bun run build:dashboard

# Non-root user + data directory
RUN addgroup -g 1001 -S forge && adduser -S forge -u 1001 -G forge \
 && mkdir -p /home/forge/.agent-forge && chown forge:forge /home/forge/.agent-forge \
 && chown -R forge:forge /app

USER forge

ENV PORT=3000
ENV NODE_ENV=production

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

WORKDIR /app/apps/gitboard
CMD ["bun", "run", "src/index.ts"]