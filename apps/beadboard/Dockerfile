# Single-stage build for beadboard
FROM oven/bun:1.2-alpine

WORKDIR /app

# Copy everything
COPY . .

# Install dependencies at workspace root
RUN bun install

# Build packages
RUN bun run build:packages

# Build dashboard
RUN cd apps/beadboard && bun run build:dashboard

# Remove broken symlinks in app node_modules so bun uses root node_modules
RUN rm -rf apps/beadboard/node_modules apps/gitboard/node_modules

ENV PORT=3001
ENV NODE_ENV=production
ENV HOME=/home/beadboard

EXPOSE 3001

# Stay in workspace root where node_modules lives
CMD ["bun", "/app/apps/beadboard/src/index.ts"]