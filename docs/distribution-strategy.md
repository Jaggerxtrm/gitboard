# Agent Forge — Distribution Strategy

**Date**: 2026-02-27
**Status**: Proposal
**Model**: Proprietary / Commercial
**Parent**: [PRD.md](./PRD.md)

---

## 1. The Challenge

Agent Forge is a TypeScript/Bun CLI tool with heavy system dependencies:

| Dependency | Type | Can bundle? |
|------------|------|-------------|
| Bun runtime | Runtime | Yes (bun compile) |
| tmux 3.3+ | System binary | No — must be installed |
| SQLite (better-sqlite3) | Native addon | Yes (bun compile bundles it) |
| Claude Code CLI | External tool | No — user installs separately |
| Gemini CLI / others | External tools | No — user installs separately |
| Dashboard (React SPA) | Static assets | Yes — embedded in binary |

**Constraint**: The product is proprietary. Source code must not be shipped as readable TypeScript/JavaScript.

---

## 2. Recommended Strategy: 3-Tier Distribution

```
┌──────────────────────────────────────────────────────────────┐
│                    DISTRIBUTION TIERS                          │
│                                                                │
│  Tier 1: COMPILED BINARY (primary)                             │
│  ├── bun build --compile → single executable                   │
│  ├── Source code not readable                                  │
│  ├── Dashboard SPA pre-built and embedded                      │
│  ├── Platforms: linux-x64, linux-arm64, darwin-x64, darwin-arm64│
│  └── Delivered via: private download portal + license key      │
│                                                                │
│  Tier 2: DOCKER IMAGE (zero-config)                            │
│  ├── Contains: compiled binary + tmux + Bun (for plugins)      │
│  ├── Source code NOT in image (only the compiled binary)        │
│  ├── Users mount project dir + provide API keys                │
│  └── Delivered via: private Docker registry                    │
│                                                                │
│  Tier 3: INSTALLER SCRIPT (onboarding)                         │
│  ├── Detects OS, downloads correct binary                      │
│  ├── Installs tmux if missing (via brew/apt)                   │
│  ├── Verifies prerequisites (claude, gemini CLIs)              │
│  └── Sets up ~/.agent-forge/ directory structure               │
│                                                                │
└──────────────────────────────────────────────────────────────┘
```

---

## 3. Tier 1: Compiled Binary

### How Bun Compile Works

```bash
bun build ./src/cli/main.ts --compile --outfile agent-forge
```

This produces a **single standalone executable** that:
- Includes the Bun runtime (no Bun install needed on user's machine)
- Bundles all TypeScript/JavaScript into bytecode (not readable source)
- Bundles native addons (better-sqlite3)
- Bundles static assets (Dashboard SPA build)
- Runs on the target OS/arch without any dependencies

### Build Matrix (CI/CD)

```yaml
# .github/workflows/release.yml
strategy:
  matrix:
    include:
      - os: ubuntu-latest
        target: bun-linux-x64
        artifact: agent-forge-linux-x64
      - os: ubuntu-latest
        target: bun-linux-arm64
        artifact: agent-forge-linux-arm64
      - os: macos-latest
        target: bun-darwin-x64
        artifact: agent-forge-darwin-x64
      - os: macos-latest
        target: bun-darwin-arm64
        artifact: agent-forge-darwin-arm64

steps:
  - uses: oven-sh/setup-bun@v2
  - run: bun install
  - run: bun run build:dashboard        # vite build → dist/dashboard/
  - run: bun build ./src/cli/main.ts \
         --compile \
         --target=${{ matrix.target }} \
         --outfile ${{ matrix.artifact }}
  - run: sha256sum ${{ matrix.artifact }} > ${{ matrix.artifact }}.sha256
```

### What users get

```
agent-forge-linux-x64          # 50-80MB standalone binary
agent-forge-linux-x64.sha256   # checksum for verification
```

### Embedding the Dashboard

The Dashboard (React SPA) is built before compilation:

```typescript
// src/api/server.ts
import { serveStatic } from 'hono/bun';

// In development: Vite dev server proxy
// In production: embedded static files
app.use('/dashboard/*', serveStatic({
  root: './dist/dashboard',  // bun compile bundles this directory
}));
```

Bun compile bundles the `dist/dashboard/` directory into the binary via `--asset-dir` or inline imports.

### Protection Level

| Attack | Protected? | Notes |
|--------|-----------|-------|
| Reading source files | Yes | No .ts/.js shipped |
| `strings` on binary | Partial | String literals visible, logic isn't |
| Decompilation | Partial | Bun bytecode is not trivially reversible |
| Runtime debugging | No | Attaching a debugger is always possible |
| Memory dump | No | In-memory code is accessible |

**Realistic assessment**: Bun compile provides **commercial-grade** protection. It stops casual copying and makes reverse engineering expensive. It does NOT stop a determined attacker with debugging tools — but neither does any client-side protection. This is the same protection level as Go, Rust, or C++ compiled binaries.

---

## 4. Tier 2: Docker Image

For users who want zero system-level setup. The Docker image contains the compiled binary (NOT source code) plus all system dependencies.

### Dockerfile

```dockerfile
# Stage 1: Build (in CI only, not shipped)
FROM oven/bun:1 AS builder
WORKDIR /build
COPY . .
RUN bun install
RUN bun run build:dashboard
RUN bun build ./src/cli/main.ts --compile --outfile /build/agent-forge

# Stage 2: Runtime (this is what ships)
FROM ubuntu:24.04

# System dependencies
RUN apt-get update && apt-get install -y \
    tmux=3.4-1 \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy ONLY the compiled binary (no source code)
COPY --from=builder /build/agent-forge /usr/local/bin/agent-forge

# Default directories
RUN mkdir -p /root/.agent-forge /workspace
WORKDIR /workspace

# Dashboard port
EXPOSE 3200

ENTRYPOINT ["agent-forge"]
CMD ["--help"]
```

### User runs it as

```bash
# Interactive TUI mode
docker run -it \
  -v $(pwd):/workspace \
  -v ~/.agent-forge:/root/.agent-forge \
  -v ~/.config/claude:/root/.config/claude \
  -e ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY \
  -p 3200:3200 \
  registry.example.com/agent-forge:latest \
  tui

# Dashboard mode
docker run -d \
  -v $(pwd):/workspace \
  -v ~/.agent-forge:/root/.agent-forge \
  -p 3200:3200 \
  registry.example.com/agent-forge:latest \
  dashboard
```

### Private Registry Options

| Registry | Cost | Notes |
|----------|------|-------|
| GitHub Container Registry (ghcr.io) | Free (private repos need plan) | Native to GitHub, easy CI integration |
| Docker Hub (private repo) | $5/mo per seat | Most familiar to users |
| AWS ECR | Pay-per-use | Good if already on AWS |
| Self-hosted (Harbor) | Free | Full control, more maintenance |

**Recommendation**: GitHub Container Registry — integrates with the same CI/CD that builds the binaries, private by default on private repos.

### Protection Level

The Docker image contains only the compiled binary. Running `docker save | tar` extracts the binary, not source code. Same protection as Tier 1.

---

## 5. Tier 3: Installer Script

The onboarding experience. Downloads the correct binary, checks prerequisites, sets up the environment.

```bash
curl -fsSL https://install.agent-forge.dev | sh
```

### What it does

```bash
#!/bin/bash
set -euo pipefail

echo "Agent Forge Installer"
echo "====================="

# 1. Detect platform
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)
case "$ARCH" in
  x86_64)  ARCH="x64" ;;
  aarch64|arm64) ARCH="arm64" ;;
  *) echo "Unsupported architecture: $ARCH"; exit 1 ;;
esac
BINARY="agent-forge-${OS}-${ARCH}"

# 2. Ask for license key
read -p "License key: " LICENSE_KEY

# 3. Download binary (authenticated)
echo "Downloading Agent Forge for ${OS}-${ARCH}..."
curl -fsSL \
  -H "Authorization: Bearer ${LICENSE_KEY}" \
  "https://releases.agent-forge.dev/latest/${BINARY}" \
  -o /usr/local/bin/agent-forge
chmod +x /usr/local/bin/agent-forge

# 4. Verify checksum
curl -fsSL "https://releases.agent-forge.dev/latest/${BINARY}.sha256" \
  -o /tmp/af.sha256
echo "$(cat /tmp/af.sha256)  /usr/local/bin/agent-forge" | sha256sum --check

# 5. Check prerequisites
echo ""
echo "Checking prerequisites..."

# tmux
if ! command -v tmux &>/dev/null; then
  echo "  tmux: MISSING — installing..."
  if command -v apt-get &>/dev/null; then
    sudo apt-get install -y tmux
  elif command -v brew &>/dev/null; then
    brew install tmux
  else
    echo "  Please install tmux 3.3+ manually"
    exit 1
  fi
else
  echo "  tmux: $(tmux -V)"
fi

# Claude Code
if command -v claude &>/dev/null; then
  echo "  claude: OK"
else
  echo "  claude: not found (optional — install with: npm install -g @anthropic-ai/claude-code)"
fi

# 6. Setup directory
mkdir -p ~/.agent-forge
echo "${LICENSE_KEY}" > ~/.agent-forge/license.key
chmod 600 ~/.agent-forge/license.key

# 7. Store license
agent-forge activate --key "${LICENSE_KEY}"

echo ""
echo "Agent Forge installed! Run 'agent-forge' to get started."
```

---

## 6. License System

### Architecture

```
User machine                          License server
┌─────────────┐                      ┌──────────────────┐
│ agent-forge │── activate ──────────→│ POST /activate   │
│             │←─ license.json ──────│ Validate key     │
│             │                      │ Return signed     │
│             │── heartbeat (7d) ───→│ POST /heartbeat  │
│             │←─ renewed license ──│ Check expiry     │
└─────────────┘                      └──────────────────┘
```

### License File

```json
// ~/.agent-forge/license.json
{
  "key": "AF-XXXX-XXXX-XXXX-XXXX",
  "email": "user@example.com",
  "plan": "pro",
  "issued_at": "2026-02-27T00:00:00Z",
  "expires_at": "2027-02-27T00:00:00Z",
  "features": ["dashboard", "protocols_advanced", "multi_model"],
  "signature": "base64-encoded-ed25519-signature"
}
```

### Validation Flow

```typescript
// src/license/validator.ts

export async function validateLicense(): Promise<LicenseStatus> {
  const license = readLicenseFile();

  // 1. Check signature (offline — ed25519 public key embedded in binary)
  if (!verifySignature(license, EMBEDDED_PUBLIC_KEY)) {
    return { valid: false, reason: 'invalid_signature' };
  }

  // 2. Check expiry
  if (new Date(license.expires_at) < new Date()) {
    return { valid: false, reason: 'expired' };
  }

  // 3. Online heartbeat (every 7 days, non-blocking)
  if (daysSinceLastHeartbeat(license) > 7) {
    try {
      const renewed = await heartbeat(license.key);
      writeLicenseFile(renewed);
    } catch {
      // Offline grace: 30 days without heartbeat
      if (daysSinceLastHeartbeat(license) > 30) {
        return { valid: false, reason: 'offline_too_long' };
      }
    }
  }

  return { valid: true, plan: license.plan, features: license.features };
}
```

### Key Design Decisions

1. **Offline-first**: Signature verification is local (ed25519 public key in binary). No internet needed for daily use.
2. **Grace period**: 30 days offline before requiring reconnection. Respects users with intermittent connectivity.
3. **No hardware fingerprinting**: Adds complexity, frustrates users who change machines. License key + email is sufficient.
4. **Feature gating**: The `features` array controls what functionality is available per plan tier.

### License Server

Lightweight — can be a single Hono/Cloudflare Worker endpoint:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/activate` | POST | Validate key, issue signed license |
| `/heartbeat` | POST | Renew license, check revocation |
| `/releases/:version/:artifact` | GET | Authenticated binary download |

**Recommendation**: Use [Keygen.sh](https://keygen.sh) or [LemonSqueezy](https://lemonsqueezy.com) for license management initially. Build custom only if scale demands it.

---

## 7. Update System

### Auto-update Check

```typescript
// src/updater/check.ts
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  const current = VERSION; // embedded at compile time
  try {
    const latest = await fetch('https://releases.agent-forge.dev/latest/version.json');
    const { version, changelog, mandatory } = await latest.json();

    if (semver.gt(version, current)) {
      return { version, changelog, mandatory };
    }
  } catch {
    // Silent fail — updates are best-effort
  }
  return null;
}
```

### Update Flow

```
agent-forge update
  → Checks latest version
  → Downloads new binary for current platform
  → Verifies checksum
  → Replaces current binary (atomic rename)
  → Prints changelog
```

No auto-install — user triggers updates explicitly. A notification appears on startup if a new version is available:

```
Agent Forge v0.8.0 (update available: v0.9.0 — run 'agent-forge update')
```

---

## 8. CI/CD Pipeline

### Release Flow

```
git tag v0.8.0
git push origin v0.8.0
  │
  ▼
GitHub Actions: release.yml
  │
  ├── Build Dashboard (vite build)
  ├── Build binaries (4 targets)
  ├── Generate checksums (SHA-256)
  ├── Sign binaries (optional: cosign)
  ├── Build Docker image (multi-arch)
  ├── Push Docker image to GHCR
  ├── Upload binaries to release CDN
  └── Update version.json on CDN
```

### CDN Structure

```
releases.agent-forge.dev/
├── latest/
│   ├── version.json
│   ├── agent-forge-linux-x64
│   ├── agent-forge-linux-x64.sha256
│   ├── agent-forge-linux-arm64
│   ├── agent-forge-linux-arm64.sha256
│   ├── agent-forge-darwin-x64
│   ├── agent-forge-darwin-x64.sha256
│   ├── agent-forge-darwin-arm64
│   └── agent-forge-darwin-arm64.sha256
└── v0.8.0/
    └── (same structure)
```

---

## 9. User Experience Summary

### First-time user journey

```
1. Purchase license on website → receives license key via email

2. Install:
   curl -fsSL https://install.agent-forge.dev | sh
   → enters license key
   → binary downloaded, tmux checked, ~/.agent-forge/ created

3. First run:
   agent-forge
   → License activated
   → "Welcome to Agent Forge. Run 'agent-forge tui' or 'agent-forge dashboard'"

4. Use:
   agent-forge tui           # Terminal interface
   agent-forge dashboard     # Web dashboard (opens browser)
   agent-forge spawn claude  # Headless CLI
```

### Returning user (update)

```
agent-forge update
→ "Updating v0.8.0 → v0.9.0..."
→ "Done. Changelog: [...]"
```

### Docker user

```
docker pull ghcr.io/your-org/agent-forge:latest
docker run -it -v $(pwd):/workspace -p 3200:3200 \
  -e AF_LICENSE_KEY=AF-XXXX-... \
  ghcr.io/your-org/agent-forge:latest tui
```

---

## 10. Decision Matrix

| Concern | Solution |
|---------|----------|
| Code protection | Bun compile (binary, no source shipped) |
| Cross-platform | 4 binaries: linux-x64, linux-arm64, darwin-x64, darwin-arm64 |
| System deps (tmux) | Installer script checks + installs |
| Zero-config option | Docker image with everything pre-installed |
| License enforcement | Ed25519 signed license file, offline-first, 30-day grace |
| Updates | CLI self-update (`agent-forge update`) |
| Distribution channel | Private CDN (authenticated download) + Docker registry |
| Dashboard delivery | Pre-built SPA embedded in binary |
| CI/CD | GitHub Actions: build matrix → CDN + GHCR |
| Payment/licensing | Keygen.sh or LemonSqueezy (initially) |
