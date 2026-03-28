# Task: Make install.sh Multi-OS (Ubuntu multi-version + Debian + macOS)

## Read CODEBASE-CONTEXT.md first, then follow these instructions.

---

## Overview

The current `install.sh` at `/home/helix/helix-mission-control/install.sh` only works on Ubuntu 24.04. We need to expand it to support:

1. **Ubuntu 20.04, 22.04, 24.04** (LTS versions)
2. **Debian 11 (Bullseye), 12 (Bookworm)**
3. **macOS (Apple Silicon + Intel)** — for local dev/small business use on Mac Mini

The script must NOT break existing functionality. Read the current install.sh first, understand its full flow, then refactor it.

---

## Current Script Location

- Source: `/home/helix/helix-mission-control/install.sh`
- Web copy: `/var/www/helixnode.tech/install.sh` (needs `sudo cp` to deploy)

## Important: What the Current Script Does

Read the current install.sh carefully. It currently:
1. Checks for root/sudo
2. Creates `helix` user if not exists
3. Installs system packages via `apt`
4. Installs Node.js 22 via NodeSource
5. Installs Docker + Docker Compose via Docker's apt repo
6. Sets up swap
7. Clones the HELIX repo from GitHub
8. Generates random secrets (.env)
9. Creates OpenClaw directories with correct ownership (1001:1001)
10. Sets up UFW firewall
11. Runs `docker compose up -d --build`
12. Installs helix-updater systemd service
13. Prints access URL and credentials

---

## OS Detection Strategy

Add OS detection at the very top of the script, right after the banner:

```bash
detect_os() {
    OS=""
    OS_VERSION=""
    ARCH=$(uname -m)
    
    if [[ "$OSTYPE" == "darwin"* ]]; then
        OS="macos"
        OS_VERSION=$(sw_vers -productVersion)
        log "Detected macOS $OS_VERSION ($ARCH)"
    elif [ -f /etc/os-release ]; then
        . /etc/os-release
        OS=$ID          # "ubuntu" or "debian"
        OS_VERSION=$VERSION_ID  # "24.04", "22.04", "12", etc.
        OS_CODENAME=$VERSION_CODENAME  # "noble", "jammy", "bookworm", etc.
        log "Detected $PRETTY_NAME ($ARCH)"
    else
        error "Unsupported operating system. HELIX requires Ubuntu 20.04+, Debian 11+, or macOS 12+."
        exit 1
    fi
    
    # Validate supported versions
    case "$OS" in
        ubuntu)
            case "$OS_VERSION" in
                20.04|22.04|24.04) ;;
                *) error "Unsupported Ubuntu version: $OS_VERSION. Supported: 20.04, 22.04, 24.04"; exit 1 ;;
            esac
            ;;
        debian)
            case "$OS_VERSION" in
                11|12) ;;
                *) error "Unsupported Debian version: $OS_VERSION. Supported: 11 (Bullseye), 12 (Bookworm)"; exit 1 ;;
            esac
            ;;
        macos) ;;
        *)
            error "Unsupported OS: $OS. HELIX requires Ubuntu 20.04+, Debian 11+, or macOS 12+."
            exit 1
            ;;
    esac
}
```

---

## Linux Path (Ubuntu + Debian)

For Ubuntu and Debian, the flow is almost identical. The differences:

### Package Installation
- Both use `apt` — no change needed
- `build-essential` exists on both — fine
- `ufw` exists on both — fine
- `fail2ban` exists on both — fine

### Docker Installation
Docker's official repo supports both Ubuntu and Debian. The current script likely hardcodes Ubuntu. Fix:

```bash
install_docker_linux() {
    if command -v docker &> /dev/null; then
        log "Docker already installed: $(docker --version)"
        return 0
    fi
    
    sudo apt-get install -y ca-certificates curl gnupg
    sudo install -m 0755 -d /etc/apt/keyrings
    
    # Docker GPG key — works for both Ubuntu and Debian
    curl -fsSL "https://download.docker.com/linux/$OS/gpg" | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    sudo chmod a+r /etc/apt/keyrings/docker.gpg
    
    # Docker repo — uses $OS (ubuntu or debian) and $OS_CODENAME
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/$OS $OS_CODENAME stable" | \
        sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    
    sudo apt-get update
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
}
```

### Node.js Installation
NodeSource supports both Ubuntu and Debian:

```bash
install_nodejs_linux() {
    if command -v node &> /dev/null; then
        log "Node.js already installed: $(node --version)"
        return 0
    fi
    
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    sudo apt-get install -y nodejs
}
```

### Swap Setup
Same on both Ubuntu and Debian — no change needed.

### UFW Firewall
Same on both — no change needed.

### systemd (helix-updater)
Same on both — no change needed.

### User Creation
Same on both — `adduser`/`useradd` works identically.

---

## macOS Path

macOS is fundamentally different. The script should:

1. **NOT** create a separate user (run as current user)
2. **NOT** set up swap (macOS manages its own)
3. **NOT** configure UFW (use macOS firewall or skip)
4. **NOT** install systemd services (no systemd on macOS)
5. **Require** Docker Desktop to be pre-installed (don't try to install it programmatically)
6. **Require** Homebrew for Node.js and git
7. **Use** `~/helix-mission-control/` as install path (not `/home/helix/`)

```bash
install_macos() {
    log "=== macOS Installation ==="
    
    # Check for Docker Desktop
    if ! command -v docker &> /dev/null; then
        error "Docker Desktop is required but not installed."
        error "Download it from: https://www.docker.com/products/docker-desktop/"
        error "After installing, make sure Docker Desktop is running, then re-run this script."
        exit 1
    fi
    
    # Check Docker is actually running
    if ! docker info &> /dev/null 2>&1; then
        error "Docker Desktop is installed but not running."
        error "Please start Docker Desktop and wait for it to be ready, then re-run this script."
        exit 1
    fi
    
    # Check for docker compose
    if ! docker compose version &> /dev/null 2>&1; then
        error "Docker Compose not found. Please update Docker Desktop to the latest version."
        exit 1
    fi
    
    # Install Homebrew if not present
    if ! command -v brew &> /dev/null; then
        log "Installing Homebrew..."
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
        # Add to path for Apple Silicon
        if [[ "$ARCH" == "arm64" ]]; then
            eval "$(/opt/homebrew/bin/brew shellenv)"
        fi
    fi
    
    # Install Node.js via Homebrew
    if ! command -v node &> /dev/null; then
        log "Installing Node.js 22..."
        brew install node@22
        brew link node@22 --force --overwrite
    fi
    
    # Install git if not present (Xcode CLT)
    if ! command -v git &> /dev/null; then
        log "Installing git..."
        brew install git
    fi
    
    # Set install directory
    HELIX_HOME="$HOME/helix-mission-control"
    HELIX_USER="$USER"
    
    # Clone repo
    if [ -d "$HELIX_HOME" ]; then
        log "HELIX directory already exists at $HELIX_HOME"
        cd "$HELIX_HOME"
        git pull origin main || true
    else
        log "Cloning HELIX Mission Control..."
        git clone https://github.com/Xylement/helix-mission-control.git "$HELIX_HOME"
        cd "$HELIX_HOME"
    fi
    
    # Generate .env if not exists
    if [ ! -f .env ]; then
        generate_env_file
    fi
    
    # Create OpenClaw directories
    # On macOS, Docker Desktop handles UID mapping differently
    # The gateway container runs as UID 1001, but Docker Desktop maps volumes through its VM
    mkdir -p "$HOME/.openclaw/workspaces"
    mkdir -p "$HOME/.openclaw/identity"
    mkdir -p "$HOME/.openclaw/skills"
    mkdir -p "$HOME/.openclaw/canvas"
    mkdir -p "$HOME/.openclaw/cron"
    [ ! -f "$HOME/.openclaw/openclaw.json" ] && echo '{}' > "$HOME/.openclaw/openclaw.json"
    
    # Build and start
    log "Building and starting HELIX Mission Control..."
    docker compose up -d --build
    
    # Wait for services
    log "Waiting for services to start..."
    sleep 15
    
    # Get IP
    LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "localhost")
    
    # Print access info
    echo ""
    echo "============================================"
    echo "  HELIX Mission Control — Installed!"
    echo "============================================"
    echo ""
    echo "  Access URL: http://${LOCAL_IP}:3000"
    echo "  Local URL:  http://localhost:3000"
    echo ""
    echo "  Complete the onboarding wizard to set up"
    echo "  your organization, AI model, and first agents."
    echo ""
    echo "  NOTE: macOS installation does not include:"
    echo "  - Automatic updates (no helix-updater service)"
    echo "  - Firewall configuration"
    echo "  - Swap configuration"
    echo "  Run 'docker compose up -d --build' manually to update."
    echo ""
    echo "  Docs: https://docs.helixnode.tech"
    echo "============================================"
}
```

---

## Refactored Script Structure

The install.sh should be refactored into functions:

```bash
#!/bin/bash
set -e

# Banner
# ...

# Logging functions
# log(), warn(), error()

# OS Detection
detect_os()

# Shared functions (used by both Linux and macOS)
generate_env_file()      # Generate random secrets and write .env
clone_repo()             # Git clone or pull
setup_openclaw_dirs()    # Create .openclaw directories
wait_for_services()      # Poll health endpoint
print_success()          # Print access URL and info

# Linux-only functions
install_packages_linux() # apt install essentials
install_docker_linux()   # Docker via official repo (Ubuntu + Debian)
install_nodejs_linux()   # Node.js via NodeSource
setup_swap_linux()       # Create swap file
setup_firewall_linux()   # UFW rules
create_helix_user()      # Create helix user if not exists
install_updater_linux()  # helix-updater systemd service

# macOS-only function
install_macos()          # Full macOS flow

# Main entrypoint
main() {
    detect_os
    
    if [ "$OS" = "macos" ]; then
        install_macos
    else
        # Linux flow (Ubuntu + Debian)
        create_helix_user
        install_packages_linux
        install_nodejs_linux
        install_docker_linux
        setup_swap_linux
        clone_repo
        generate_env_file
        setup_openclaw_dirs
        setup_firewall_linux
        
        # Build and start
        cd /home/helix/helix-mission-control
        docker compose up -d --build
        
        install_updater_linux
        wait_for_services
        print_success
    fi
}

main "$@"
```

---

## Key Technical Details

### OpenClaw directory ownership on macOS
On Linux, we `chown 1001:1001` the `.openclaw` directory because the gateway container runs as UID 1001. On macOS with Docker Desktop, the Linux VM handles UID mapping through its file sharing layer — files owned by the macOS user appear as the correct UID inside the container. So on macOS, just `mkdir` without `chown` should work. BUT test this — if the gateway can't write, we may need to make the dirs world-writable (chmod 777) as a fallback.

### docker-compose.yml compatibility
The existing `docker-compose.yml` uses `host.docker.internal` in some places and localhost in others. On macOS Docker Desktop, `host.docker.internal` is automatically available. The compose file should work as-is.

### Path differences
- Linux: `/home/helix/helix-mission-control/`
- macOS: `~/helix-mission-control/`

The `.env` file uses relative paths for volumes (like `./backups:/home/helix/backups`). These should work on both platforms since Docker Compose resolves them relative to the compose file location.

### The `helix-updater` service
Skip on macOS entirely. The one-click update from the dashboard writes a `.update-trigger` file that the systemd daemon watches — on macOS there's no daemon, so updates would be manual (`git pull && docker compose up -d --build`). Log a note about this.

### Architecture detection
macOS Apple Silicon (arm64) vs Intel (x86_64) — Docker Desktop handles multi-arch transparently through its VM. The Dockerfiles use standard base images (python:3.11-slim, node:20-alpine) which have ARM builds. This should just work.

---

## Additional Improvements While Refactoring

### 1. Idempotency (from known issues list)
While refactoring, add idempotency checks to every step:
- Check if helix user exists before creating
- Check if Docker is installed before installing
- Check if Node.js is installed before installing
- Check if repo is cloned before cloning (git pull if exists)
- Check if .env exists before generating (skip if exists, or prompt)
- Check if swap exists before creating
- Check if UFW rules exist before adding
- Check if helix-updater service exists before installing

### 2. Remove docker-compose.yml `version` attribute warning
While touching the compose file — if there's a `version:` line at the top of `docker-compose.yml`, remove it. Docker Compose v2 doesn't need it and it generates a warning.

---

## Testing

After the script is refactored:
1. Read through the entire script and verify the Linux path still does everything the original did
2. Verify the macOS path makes sense (we can't test it on the VPS, but it should be logically correct)
3. The script should print which OS was detected at the start

---

## Deployment

After the script is updated:
1. `git add -A && git commit -m "feat: multi-OS install script (Ubuntu 20/22/24, Debian 11/12, macOS)" && git push origin main`
2. Copy to web server: the user will do `sudo cp install.sh /var/www/helixnode.tech/install.sh` manually
3. Update CODEBASE-CONTEXT.md with the changes

---

## IMPORTANT: Do NOT break the existing Linux flow

The current script works for Ubuntu 24.04 and was tested with a real beta tester. Every step of the Linux path must produce the same result as the current script. You're refactoring for structure and adding OS support — not changing the Ubuntu 24.04 behavior.

Read the current install.sh FIRST, understand every line, then refactor. If anything is unclear about what a section does, keep it exactly as-is and just wrap it in the appropriate function.
