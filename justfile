# Podman commands for gitboard + beadboard

# Build all images
build:
    podman-compose build

# Build gitboard only
build-gitboard:
    podman-compose build gitboard

# Build beadboard only
build-beadboard:
    podman-compose build beadboard

# Start all services
up:
    podman-compose up -d

# Start gitboard only
up-gitboard:
    podman-compose up -d gitboard

# Start beadboard only
up-beadboard:
    podman-compose up -d beadboard

# Stop all services
down:
    podman-compose down

# View logs
logs:
    podman-compose logs -f

# View gitboard logs
logs-gitboard:
    podman-compose logs -f gitboard

# View beadboard logs
logs-beadboard:
    podman-compose logs -f beadboard

# Restart all services
restart:
    podman-compose restart

# Check health
health:
    curl -s http://localhost:3000/health && echo " - gitboard"
    curl -s http://localhost:3001/health && echo " - beadboard"

# Pull latest images
pull:
    podman-compose pull

# Remove containers and volumes
clean:
    podman-compose down -v

# Rebuild from scratch
rebuild: clean build up

# Development mode (with hot reload)
dev:
    cd apps/gitboard && bun run dev &
    cd apps/beadboard && bun run dev &
    wait