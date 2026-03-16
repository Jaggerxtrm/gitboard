# Single-stage build for XTRM unified app (gitboard + beadboard)
FROM oven/bun:1.2-alpine

WORKDIR /app

# Copy everything
COPY . .

# Install dependencies at workspace root
RUN bun install

# Build packages
RUN bun run build:packages

# Build both dashboards
RUN cd apps/gitboard && bun run build:dashboard
RUN cd apps/beadboard && bun run build:dashboard

# Remove broken symlinks
RUN rm -rf apps/beadboard/node_modules apps/gitboard/node_modules

# Non-root user + data directory
RUN addgroup -g 1001 -S xtrm && adduser -S xtrm -u 1001 -G xtrm \
 && mkdir -p /home/xtrm/.xtrm && chown xtrm:xtrm /home/xtrm/.xtrm \
 && chown -R xtrm:xtrm /app

USER xtrm

ENV PORT=3000
ENV NODE_ENV=production

EXPOSE 3000

CMD ["bun", "/app/apps/gitboard/src/index.ts"]