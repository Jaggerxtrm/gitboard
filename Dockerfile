# ── Stage 1: install deps ──────────────────────────────────────────────────────
FROM oven/bun:1.2-alpine AS deps
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

# ── Stage 2: build dashboard ───────────────────────────────────────────────────
FROM deps AS build
COPY . .
RUN bun run build:dashboard

# ── Stage 3: production runtime ────────────────────────────────────────────────
FROM oven/bun:1.2-alpine AS production
WORKDIR /app

# Non-root user
RUN addgroup -g 1001 -S forge && adduser -S forge -u 1001 -G forge

COPY --from=deps   --chown=forge:forge /app/node_modules ./node_modules
COPY --from=build  --chown=forge:forge /app/dist         ./dist
COPY --from=build  --chown=forge:forge /app/src          ./src
COPY --from=build  --chown=forge:forge /app/package.json ./package.json

USER forge

ENV PORT=3000
ENV NODE_ENV=production

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["bun", "run", "src/index.ts"]
