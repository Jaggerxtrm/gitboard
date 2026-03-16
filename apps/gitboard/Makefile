.PHONY: up down build logs shell ps restart clean prune token

# ── Config ──────────────────────────────────────────────────────────────────────
COMPOSE      := docker compose
SERVICE      := gitboard
TOKEN        := $(shell gh auth token 2>/dev/null)
DOCKER_HOST  ?= unix:///var/run/docker.sock

export DOCKER_HOST

# ── Lifecycle ───────────────────────────────────────────────────────────────────

## Start (build if needed, run in background)
up:
	GITHUB_TOKEN=$(TOKEN) $(COMPOSE) up -d --build

## Stop and remove containers
down:
	$(COMPOSE) down

## Rebuild image without cache, then start
build:
	GITHUB_TOKEN=$(TOKEN) $(COMPOSE) up -d --build --force-recreate --no-deps $(SERVICE)

## Rebuild image from scratch (no layer cache)
rebuild:
	GITHUB_TOKEN=$(TOKEN) $(COMPOSE) build --no-cache
	GITHUB_TOKEN=$(TOKEN) $(COMPOSE) up -d

## Restart container (no rebuild)
restart:
	$(COMPOSE) restart $(SERVICE)

# ── Observability ───────────────────────────────────────────────────────────────

## Tail logs (Ctrl-C to stop)
logs:
	$(COMPOSE) logs -f $(SERVICE)

## Show running containers + health
ps:
	$(COMPOSE) ps

## Open a shell inside the running container
shell:
	$(COMPOSE) exec $(SERVICE) sh

# ── Cleanup ─────────────────────────────────────────────────────────────────────

## Remove containers and named volumes (wipes DB!)
clean:
	@echo "WARNING: this deletes the state.db volume. Continue? [y/N] " && read ans && [ $${ans:-N} = y ]
	$(COMPOSE) down -v

## Remove dangling images + build cache
prune:
	docker image prune -f
	docker builder prune -f

# ── Dev helpers ─────────────────────────────────────────────────────────────────

## Print the resolved GITHUB_TOKEN (redacted)
token:
	@echo "GITHUB_TOKEN=$(shell echo $(TOKEN) | cut -c1-8)..."

## Show this help
help:
	@awk '/^##/{sub(/^## /,""); desc=$$0; next} /^[a-zA-Z_-]+:/{print "\033[36m" $$1 "\033[0m\t" desc; desc=""}' $(MAKEFILE_LIST) | column -t -s $$'\t'

.DEFAULT_GOAL := help
