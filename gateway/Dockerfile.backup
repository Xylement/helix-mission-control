FROM node:22-slim

# Install git (needed by openclaw npm package) and OpenClaw + ws
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*
RUN npm install -g openclaw@2026.3.11 ws

# Create openclaw user with matching host UID/GID
RUN groupadd -g 1001 openclaw && \
    useradd -u 1001 -g 1001 -m -s /bin/bash openclaw

# Create openclaw directories
RUN mkdir -p /home/openclaw/.openclaw/workspaces \
    /home/openclaw/.openclaw/identity \
    /home/openclaw/.openclaw/skills \
    /home/openclaw/.openclaw/agents && \
    chown -R openclaw:openclaw /home/openclaw/.openclaw

# Symlink /home/helix -> /home/openclaw so that host-generated
# paths in openclaw.json (e.g. /home/helix/.openclaw/workspace/...)
# resolve correctly inside the container.
RUN ln -s /home/openclaw /home/helix

# Copy entrypoint
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

USER openclaw
WORKDIR /home/openclaw

EXPOSE 18789

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD node -e "const ws = new (require('/usr/local/lib/node_modules/ws'))('ws://localhost:18789'); ws.on('open', () => { ws.close(); process.exit(0); }); ws.on('error', () => process.exit(1)); setTimeout(() => process.exit(1), 5000);" || exit 1

ENTRYPOINT ["/entrypoint.sh"]
