#!/bin/bash
#
# HELIX Mission Control — One-Command Installer
# Usage:
#   curl -fsSL https://helixnode.tech/install.sh | bash
#   # or with options:
#   bash install.sh --domain helix.mycompany.com --email admin@mycompany.com
#
# Options:
#   --domain <domain>     Domain name for SSL (e.g., helix.mycompany.com)
#   --email <email>       Email for Let's Encrypt SSL certificate
#   --skip-ssl            Skip SSL setup (HTTP only)
#   --skip-proxy          Skip Caddy proxy (if using external Nginx/proxy)
#   --branch <branch>     Git branch to install (default: main)
#   --install-dir <path>  Installation directory (default: /home/helix/helix-mission-control)
#
# Requirements:
#   - Fresh Ubuntu 22.04 or 24.04 LTS
#   - Root access (or sudo)
#   - Minimum 2 vCPU, 2GB RAM (4GB recommended)
#   - Port 80, 443 available (unless --skip-proxy)

set -euo pipefail

# === Configuration ===
HELIX_VERSION="1.0.0"
HELIX_REPO="https://github.com/Xylement/helix-mission-control.git"
HELIX_BRANCH="main"
INSTALL_DIR="/home/helix/helix-mission-control"
HELIX_USER="helix"
LOG_FILE="/var/log/helix-install.log"
DOMAIN=""
SSL_EMAIL=""
ENABLE_SSL="false"
SKIP_PROXY="false"

# === Colors ===
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# === Logging ===
log() {
    echo -e "${GREEN}[HELIX]${NC} $1"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE" 2>/dev/null || true
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] WARN: $1" >> "$LOG_FILE" 2>/dev/null || true
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $1" >> "$LOG_FILE" 2>/dev/null || true
}

success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

show_help() {
    cat << 'EOF'

  ██╗  ██╗███████╗██╗     ██╗██╗  ██╗
  ██║  ██║██╔════╝██║     ██║╚██╗██╔╝
  ███████║█████╗  ██║     ██║ ╚███╔╝
  ██╔══██║██╔══╝  ██║     ██║ ██╔██╗
  ██║  ██║███████╗███████╗██║██╔╝ ██╗
  ╚═╝  ╚═╝╚══════╝╚══════╝╚═╝╚═╝  ╚═╝
  Mission Control Installer

Usage:
  bash install.sh [OPTIONS]

Options:
  --domain <domain>     Domain for SSL (e.g., helix.mycompany.com)
  --email <email>       Email for Let's Encrypt
  --skip-ssl            HTTP only, no SSL
  --skip-proxy          Don't install Caddy (use your own reverse proxy)
  --branch <branch>     Git branch (default: main)
  --install-dir <path>  Install path (default: /home/helix/helix-mission-control)
  -h, --help            Show this help

Examples:
  # Fresh install with SSL:
  bash install.sh --domain helix.mycompany.com --email admin@mycompany.com

  # HTTP only (no domain):
  bash install.sh --skip-ssl

  # Behind existing Nginx:
  bash install.sh --skip-proxy
EOF
}

# === Parse Arguments ===
while [[ $# -gt 0 ]]; do
    case $1 in
        --domain)     DOMAIN="$2"; shift 2 ;;
        --email)      SSL_EMAIL="$2"; shift 2 ;;
        --skip-ssl)   ENABLE_SSL="false"; shift ;;
        --skip-proxy) SKIP_PROXY="true"; shift ;;
        --branch)     HELIX_BRANCH="$2"; shift 2 ;;
        --install-dir) INSTALL_DIR="$2"; shift 2 ;;
        -h|--help)    show_help; exit 0 ;;
        *)            error "Unknown option: $1"; exit 1 ;;
    esac
done

# Auto-enable SSL if domain and email provided
if [ -n "$DOMAIN" ] && [ -n "$SSL_EMAIL" ] && [ "$DOMAIN" != "localhost" ]; then
    ENABLE_SSL="true"
fi


# === Pre-flight Checks ===
preflight() {
    log "Running pre-flight checks..."

    # Must be root or sudo
    if [ "$EUID" -ne 0 ]; then
        error "Please run as root: sudo bash install.sh"
        exit 1
    fi

    # Check Ubuntu version
    if ! grep -qE "Ubuntu (22|24)\." /etc/os-release 2>/dev/null; then
        warn "This script is designed for Ubuntu 22.04/24.04. Other versions may work but are untested."
    fi

    # Check minimum RAM (2GB)
    TOTAL_RAM=$(free -m | awk '/^Mem:/{print $2}')
    if [ "$TOTAL_RAM" -lt 1800 ]; then
        error "Minimum 2GB RAM required. Detected: ${TOTAL_RAM}MB"
        exit 1
    fi
    if [ "$TOTAL_RAM" -lt 3800 ]; then
        warn "4GB RAM recommended. Detected: ${TOTAL_RAM}MB. Will configure swap."
    fi

    # Check port availability (only if Caddy will be used)
    if [ "$SKIP_PROXY" != "true" ]; then
        for port in 80 443; do
            if ss -tlnp | grep -q ":${port} "; then
                error "Port $port is already in use. Stop the service using it or use --skip-proxy."
                ss -tlnp | grep ":${port} "
                exit 1
            fi
        done
    fi

    # Check disk space (minimum 10GB free)
    FREE_DISK=$(df -BG / | tail -1 | awk '{print $4}' | tr -d 'G')
    if [ "$FREE_DISK" -lt 10 ]; then
        error "Minimum 10GB free disk space required. Available: ${FREE_DISK}GB"
        exit 1
    fi

    success "Pre-flight checks passed (RAM: ${TOTAL_RAM}MB, Disk: ${FREE_DISK}GB free)"
}


# === Step 1: System Setup ===
setup_system() {
    log "Step 1/8: Updating system and installing essentials..."

    apt-get update -qq
    apt-get upgrade -y -qq
    apt-get install -y -qq \
        curl wget git build-essential unzip \
        software-properties-common \
        tmux htop ufw fail2ban \
        ca-certificates gnupg lsb-release

    success "System packages installed"
}


# === Step 2: Create helix user ===
setup_user() {
    log "Step 2/8: Setting up helix user..."

    if id "$HELIX_USER" &>/dev/null; then
        warn "User '$HELIX_USER' already exists, skipping creation"
    else
        adduser --disabled-password --gecos "HELIX Mission Control" "$HELIX_USER"
        usermod -aG sudo "$HELIX_USER"
        # Allow sudo without password for install
        echo "$HELIX_USER ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/helix
    fi

    # Copy SSH keys from root if available
    if [ -d /root/.ssh ] && [ ! -d /home/$HELIX_USER/.ssh ]; then
        rsync --archive --chown=$HELIX_USER:$HELIX_USER /root/.ssh /home/$HELIX_USER/
    fi

    success "User '$HELIX_USER' ready"
}


# === Step 3: Install Docker ===
setup_docker() {
    log "Step 3/8: Installing Docker..."

    if command -v docker &>/dev/null; then
        warn "Docker already installed: $(docker --version)"
    else
        install -m 0755 -d /etc/apt/keyrings
        curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
        chmod a+r /etc/apt/keyrings/docker.gpg

        echo \
            "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
            https://download.docker.com/linux/ubuntu \
            $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
            tee /etc/apt/sources.list.d/docker.list > /dev/null

        apt-get update -qq
        apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    fi

    usermod -aG docker "$HELIX_USER"

    # Start and enable Docker
    systemctl enable docker
    systemctl start docker

    success "Docker $(docker --version | awk '{print $3}') installed"
}


# === Step 4: Install Node.js ===
setup_node() {
    log "Step 4/8: Installing Node.js 22..."

    if command -v node &>/dev/null && node --version | grep -q "v22"; then
        warn "Node.js 22 already installed: $(node --version)"
    else
        curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
        apt-get install -y -qq nodejs
    fi

    success "Node.js $(node --version) installed"
}


# === Step 5: Setup Swap ===
setup_swap() {
    log "Step 5/8: Configuring swap..."

    if swapon --show | grep -q "/swapfile"; then
        warn "Swap already configured"
        return
    fi

    TOTAL_RAM_GB=$(free -g | awk '/^Mem:/{print $2}')
    if [ "$TOTAL_RAM_GB" -le 8 ]; then
        SWAP_SIZE="4G"
    else
        SWAP_SIZE="2G"
    fi

    fallocate -l "$SWAP_SIZE" /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile

    if ! grep -q "/swapfile" /etc/fstab; then
        echo '/swapfile none swap sw 0 0' >> /etc/fstab
    fi

    # Optimize swap settings
    sysctl vm.swappiness=10
    if ! grep -q "vm.swappiness" /etc/sysctl.conf; then
        echo 'vm.swappiness=10' >> /etc/sysctl.conf
    fi

    success "Swap configured: $SWAP_SIZE"
}


# === Step 6: Clone and Configure ===
setup_helix() {
    log "Step 6/8: Installing HELIX Mission Control..."

    if [ -d "$INSTALL_DIR" ]; then
        warn "Installation directory exists. Pulling latest..."
        cd "$INSTALL_DIR"
        sudo -u "$HELIX_USER" git pull origin "$HELIX_BRANCH" || true
    else
        sudo -u "$HELIX_USER" git clone --branch "$HELIX_BRANCH" "$HELIX_REPO" "$INSTALL_DIR"
        cd "$INSTALL_DIR"
    fi

    # Generate secrets
    POSTGRES_PW=$(openssl rand -hex 24)
    JWT_SECRET=$(openssl rand -hex 32)
    SERVICE_TOKEN=$(openssl rand -base64 48 | tr -d '=+/' | head -c 64)
    GATEWAY_TOKEN=$(openssl rand -hex 32)

    # Determine domain/URL
    if [ -z "$DOMAIN" ]; then
        DOMAIN=$(curl -s4 ifconfig.me 2>/dev/null || hostname -I | awk '{for(i=1;i<=NF;i++) if($i ~ /^[0-9]+\./) {print $i; exit}}')
    fi

    # Create .env from template
    if [ ! -f .env ] || [ ! -s .env ]; then
        log "Generating .env configuration..."
        cat > .env << ENVFILE
# ============================================================
# HELIX Mission Control — Configuration
# Generated by install.sh on $(date)
# ============================================================

# === Organization (configure in onboarding wizard) ===
ORG_NAME=
ADMIN_EMAIL=
ADMIN_PASSWORD=

# === AI Model (configure in onboarding wizard) ===
MODEL_PROVIDER=moonshot
MODEL_NAME=kimi-k2.5
MODEL_API_KEY=
MODEL_BASE_URL=
MODEL_DISPLAY_NAME=
MODEL_CONTEXT_WINDOW=256000
MODEL_MAX_TOKENS=8192

# === Gateway ===
GATEWAY_PORT=18789
GATEWAY_TOKEN=${GATEWAY_TOKEN}
GATEWAY_URL=ws://gateway:18789

# === Telegram (optional — configure in settings) ===
TELEGRAM_BOT_TOKEN=
TELEGRAM_ALLOWED_USER_IDS=

# === Domain & SSL ===
DOMAIN=${DOMAIN}
ENABLE_SSL=${ENABLE_SSL}
SSL_EMAIL=${SSL_EMAIL}
SKIP_PROXY=${SKIP_PROXY}

# === Database (auto-generated) ===
POSTGRES_USER=helix
POSTGRES_PASSWORD=${POSTGRES_PW}
POSTGRES_DB=helix_mc
DATABASE_URL=postgresql+asyncpg://helix:${POSTGRES_PW}@db:5432/helix_mc

# === Redis ===
REDIS_URL=redis://redis:6379/0

# === Authentication ===
AUTH_MODE=local
JWT_SECRET=${JWT_SECRET}
SERVICE_TOKEN=${SERVICE_TOKEN}

# === Frontend ===
NEXT_PUBLIC_API_URL=auto

# === CORS ===
CORS_ORIGINS=http://localhost:3000

# === Advanced ===
LOG_LEVEL=info
MAX_AGENTS=50
GENERATE_CONFIG=true

# === Legacy ===
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
ENVFILE
    else
        warn ".env already exists, preserving existing config"
    fi

    # Create OpenClaw directories so volume mounts don't fail on fresh install
    mkdir -p /home/$HELIX_USER/.openclaw/workspaces /home/$HELIX_USER/.openclaw/identity /home/$HELIX_USER/.openclaw/skills
    if [ ! -f /home/$HELIX_USER/.openclaw/openclaw.json ]; then
        echo '{}' > /home/$HELIX_USER/.openclaw/openclaw.json
    fi

    # Set ownership
    chown -R "$HELIX_USER:$HELIX_USER" "$INSTALL_DIR"
    chown -R 1001:1001 /home/$HELIX_USER/.openclaw

    # Select Caddyfile
    if [ "$SKIP_PROXY" != "true" ]; then
        sudo -u "$HELIX_USER" bash scripts/select-caddyfile.sh
    fi

    success "HELIX configured at $INSTALL_DIR"
}


# === Step 7: Build and Start ===
start_helix() {
    log "Step 7/8: Building and starting HELIX..."

    cd "$INSTALL_DIR"

    # Build all containers
    sudo -u "$HELIX_USER" docker compose build

    # Start the stack (with proxy profile if not skipping)
    if [ "$SKIP_PROXY" != "true" ]; then
        sudo -u "$HELIX_USER" docker compose --profile proxy up -d
    else
        sudo -u "$HELIX_USER" docker compose up -d
    fi

    # Wait for backend to be healthy
    log "Waiting for services to start..."
    local retries=30
    while [ $retries -gt 0 ]; do
        if curl -sf http://localhost:8000/api/health > /dev/null 2>&1; then
            break
        fi
        sleep 2
        retries=$((retries - 1))
    done

    if [ $retries -eq 0 ]; then
        error "Backend did not become healthy in 60 seconds. Check logs:"
        error "  docker compose logs backend --tail=50"
        exit 1
    fi

    # Run database migrations
    log "Running database migrations..."
    sudo -u "$HELIX_USER" docker compose exec -T backend alembic upgrade head || true

    success "HELIX Mission Control is running"
}


# === Step 8: Firewall ===
setup_firewall() {
    log "Step 8/8: Configuring firewall..."

    ufw --force reset
    ufw default deny incoming
    ufw default allow outgoing
    ufw allow 22/tcp comment 'SSH'

    if [ "$SKIP_PROXY" != "true" ]; then
        ufw allow 80/tcp comment 'HTTP'
        ufw allow 443/tcp comment 'HTTPS'
    else
        ufw allow 3000/tcp comment 'HELIX Frontend'
        ufw allow 8000/tcp comment 'HELIX Backend API'
    fi

    ufw --force enable

    success "Firewall configured"
}


# === Print Summary ===
print_summary() {
    local ACCESS_URL
    if [ "$ENABLE_SSL" = "true" ] && [ -n "$DOMAIN" ] && [ "$DOMAIN" != "localhost" ]; then
        ACCESS_URL="https://${DOMAIN}"
    elif [ "$SKIP_PROXY" = "true" ]; then
        ACCESS_URL="http://${DOMAIN}:3000"
    else
        ACCESS_URL="http://${DOMAIN}"
    fi

    echo ""
    echo -e "${GREEN}"
    cat << 'BANNER'
  ╔══════════════════════════════════════════════════════════╗
  ║                                                          ║
  ║   ██╗  ██╗███████╗██╗     ██╗██╗  ██╗                   ║
  ║   ██║  ██║██╔════╝██║     ██║╚██╗██╔╝                   ║
  ║   ███████║█████╗  ██║     ██║ ╚███╔╝                    ║
  ║   ██╔══██║██╔══╝  ██║     ██║ ██╔██╗                    ║
  ║   ██║  ██║███████╗███████╗██║██╔╝ ██╗                   ║
  ║   ╚═╝  ╚═╝╚══════╝╚══════╝╚═╝╚═╝  ╚═╝                 ║
  ║                                                          ║
  ║   Mission Control — Installation Complete                ║
  ║                                                          ║
  ╚══════════════════════════════════════════════════════════╝
BANNER
    echo -e "${NC}"
    echo ""
    echo -e "  ${BLUE}Access URL:${NC}  $ACCESS_URL"
    echo ""
    echo -e "  ${BLUE}Next steps:${NC}"
    echo "    1. Open $ACCESS_URL in your browser"
    echo "    2. Complete the onboarding wizard"
    echo "    3. Configure your AI model (API key)"
    echo "    4. Create departments, boards, and agents"
    echo ""
    echo -e "  ${BLUE}Useful commands:${NC}"
    echo "    cd $INSTALL_DIR"
    echo "    docker compose logs -f              # View all logs"
    echo "    docker compose logs backend -f      # Backend logs"
    echo "    docker compose restart              # Restart all"
    echo "    bash scripts/update.sh              # Update to latest"
    echo ""
    echo -e "  ${BLUE}Log file:${NC}  $LOG_FILE"
    echo ""
}


# === Main ===
main() {
    echo ""
    log "HELIX Mission Control Installer v${HELIX_VERSION}"
    log "============================================"
    echo ""

    # Initialize log file
    mkdir -p "$(dirname "$LOG_FILE")"
    touch "$LOG_FILE"

    preflight
    setup_system
    setup_user
    setup_docker
    setup_node
    setup_swap
    setup_helix
    start_helix
    setup_firewall
    print_summary
}

main "$@"
