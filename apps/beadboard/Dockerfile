# Single-stage build for beadboard
FROM oven/bun:1.2-alpine

WORKDIR /app

# Copy everything
COPY . .

# Install dependencies
RUN bun install

# Build packages
RUN bun run build:packages

# Build dashboard
RUN cd apps/beadboard && bun run build:dashboard

# Non-root user
RUN addgroup -g 1002 -S beadboard && adduser -S beadboard -u 1002 -G beadboard \
 && chown -R beadboard:beadboard /app

USER beadboard

ENV PORT=3001
ENV NODE_ENV=production
ENV HOME=/home/beadboard

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

WORKDIR /app/apps/beadboard
CMD ["bun", "run", "src/index.ts"]