.PHONY: up down build logs ps restart clean prune token help \
        gitboard beadboard all

# ── Config ──────────────────────────────────────────────────────────────────────
COMPOSE      := podman-compose
TOKEN        := $(shell gh auth token 2>/dev/null)
PROJECTS_DIR := $(HOME)/projects

# ── Lifecycle ───────────────────────────────────────────────────────────────────

## Start all services (gitboard + beadboard)
up:
	GITHUB_TOKEN=$(TOKEN) $(COMPOSE) up -d

## Stop all containers
down:
	$(COMPOSE) down

## Build all images
build:
	$(COMPOSE) build

## Rebuild from scratch and start
rebuild:
	$(COMPOSE) build --no-cache
	GITHUB_TOKEN=$(TOKEN) $(COMPOSE) up -d

## Restart all containers
restart:
	$(COMPOSE) restart

# ── Individual Services ─────────────────────────────────────────────────────────

## Start only gitboard
gitboard:
	GITHUB_TOKEN=$(TOKEN) $(COMPOSE) up -d gitboard

## Start only beadboard
beadboard:
	$(COMPOSE) up -d beadboard

## Build gitboard only
build-gitboard:
	$(COMPOSE) build gitboard

## Build beadboard only
build-beadboard:
	$(COMPOSE) build beadboard

# ── Observability ───────────────────────────────────────────────────────────────

## Tail all logs
logs:
	$(COMPOSE) logs -f

## Tail gitboard logs
logs-gitboard:
	$(COMPOSE) logs -f gitboard

## Tail beadboard logs
logs-beadboard:
	$(COMPOSE) logs -f beadboard

## Show running containers
ps:
	$(COMPOSE) ps

## Open shell in gitboard
shell-gitboard:
	podman exec -it gitboard sh

## Open shell in beadboard
shell-beadboard:
	podman exec -it beadboard sh

# ── Health Checks ──────────────────────────────────────────────────────────────

## Check health endpoints
health:
	@echo "gitboard:  $$(curl -s http://localhost:3000/health 2>/dev/null || echo 'FAILED')"
	@echo "beadboard: $$(curl -s http://localhost:3001/health 2>/dev/null || echo 'FAILED')"

# ── Cleanup ─────────────────────────────────────────────────────────────────────

## Remove containers and volumes
clean:
	$(COMPOSE) down -v

## Prune dangling images
prune:
	podman image prune -f
	podman system prune -f

## Full reset (clean + rebuild)
reset: clean build up

# ── Dev helpers ─────────────────────────────────────────────────────────────────

## Print the resolved GITHUB_TOKEN (redacted)
token:
	@echo "GITHUB_TOKEN=$(shell echo $(TOKEN) | cut -c1-8)..."

## Show project directories that would be mounted
mounts:
	@echo "Projects: $(PROJECTS_DIR)"
	@echo "Beads: $(HOME)/.beads"
	@ls -la $(PROJECTS_DIR) 2>/dev/null | head -10 || echo "No projects dir"

## Show this help
help:
	@echo "Usage: make [target]"
	@echo ""
	@echo "Lifecycle:"
	@sed -n 's/^## //p' $(MAKEFILE_LIST) | grep -E "^(up|down|build|rebuild|restart)" | head -5
	@echo ""
	@echo "Services:"
	@sed -n 's/^## //p' $(MAKEFILE_LIST) | grep -E "(gitboard|beadboard)" | head -8
	@echo ""
	@echo "Observability:"
	@sed -n 's/^## //p' $(MAKEFILE_LIST) | grep -E "(logs|ps|shell|health)" | head -8
	@echo ""
	@echo "Cleanup:"
	@sed -n 's/^## //p' $(MAKEFILE_LIST) | grep -E "(clean|prune|reset)" | head -3

.DEFAULT_GOAL := help