# Claude Code Task: Finalize Update Daemon Systemd Service

Read CODEBASE-CONTEXT.md first.

## Overview

The update daemon (`update-daemon.sh`) exists and works — it polls for `data/.update-trigger`, pulls code, rebuilds, and health-checks. The UI in Settings > System triggers it. However, the **systemd service was never actually created on the VPS**. The script was copied to `/usr/local/bin/` but `helix-update-daemon.service` (or `helix-updater.service`) doesn't exist as a running systemd unit.

This means the update daemon isn't running in the background, so clicking "Update Now" in the UI writes the trigger file but nothing picks it up.

## What Needs to Happen

### 1. Verify update-daemon.sh is in place

Check if the script exists and is correct:

```bash
ls -la /usr/local/bin/update-daemon.sh
cat /usr/local/bin/update-daemon.sh | head -5
```

If it doesn't exist at `/usr/local/bin/`, copy it from the project:

```bash
# This needs sudo — tell the user
sudo cp ~/helix-mission-control/update-daemon.sh /usr/local/bin/update-daemon.sh
sudo chmod +x /usr/local/bin/update-daemon.sh
```

Also check the version in the project dir:
```bash
ls -la ~/helix-mission-control/update-daemon.sh
```

### 2. Create the systemd service unit

**This requires sudo** — prepare the file and tell the user (Clement) to run the commands.

Create the service file content. The service should:
- Run as root (needs to run docker compose commands)
- Set the working directory to the HELIX install path
- Restart on failure
- Start after Docker

Prepare the file at `~/helix-updater.service`:

```ini
[Unit]
Description=HELIX Mission Control Update Daemon
Documentation=https://docs.helixnode.tech
After=docker.service
Requires=docker.service

[Service]
Type=simple
User=root
WorkingDirectory=/home/helix/helix-mission-control
ExecStart=/bin/bash /home/helix/helix-mission-control/update-daemon.sh
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=helix-updater

# Environment
Environment=HOME=/home/helix
Environment=PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

# Safety
NoNewPrivileges=no
ProtectSystem=false

[Install]
WantedBy=multi-user.target
```

Write this to `~/helix-updater.service`.

**IMPORTANT:** The WorkingDirectory and ExecStart paths must point to the actual HELIX install directory. For GALADO's production instance this is `/home/helix/helix-mission-control`. For other customer installs it could be different — the install.sh should set this dynamically.

### 3. Tell the user to install the service

After preparing the file, output these commands for Clement to run:

```bash
# Copy service file
sudo cp ~/helix-updater.service /etc/systemd/system/helix-updater.service

# Reload systemd
sudo systemctl daemon-reload

# Enable (start on boot)
sudo systemctl enable helix-updater.service

# Start now
sudo systemctl start helix-updater.service

# Check status
sudo systemctl status helix-updater.service
```

### 4. Verify the daemon is running

After Clement starts the service, verify:

```bash
# Check it's running
sudo systemctl status helix-updater.service

# Check logs
sudo journalctl -u helix-updater.service -f --no-pager -n 20
```

The daemon should be polling every 10 seconds for `data/.update-trigger`.

### 5. Test the full update flow

Once the daemon is running:
1. Go to Settings > System on helix.galado.com.my
2. Click "Check for Updates"
3. If there's an update available, click "Update Now"
4. Enter password to confirm
5. Watch the progress stages (Step 1/3, 2/3, 3/3)
6. Verify the update completes or test the cancel button

If no update is available (current == latest), you can test the trigger mechanism:

```bash
# Manually create a trigger to test
echo '{"triggered_at": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'", "triggered_by": "test"}' > ~/helix-mission-control/data/.update-trigger
```

Then watch the daemon logs:
```bash
sudo journalctl -u helix-updater.service -f
```

### 6. Update install.sh to create the service automatically

The install script should create this service for new installs. Check if `install.sh` already has systemd service creation logic:

```bash
grep -n "systemd\|systemctl\|helix-updater\|service" ~/helix-mission-control/install.sh | head -20
```

If it already has the logic, verify it matches the service file above. If not, add a section to `install.sh` that:

a. Writes the service file to `/etc/systemd/system/helix-updater.service`
b. Runs `systemctl daemon-reload`
c. Runs `systemctl enable helix-updater.service`
d. Runs `systemctl start helix-updater.service`

This should only run on Linux (not macOS) since macOS doesn't use systemd:

```bash
if [ "$OS" = "linux" ]; then
    echo "[HELIX] Setting up update daemon..."
    
    cat > /etc/systemd/system/helix-updater.service << SYSTEMD_EOF
[Unit]
Description=HELIX Mission Control Update Daemon
After=docker.service
Requires=docker.service

[Service]
Type=simple
User=root
WorkingDirectory=${INSTALL_DIR}
ExecStart=/bin/bash ${INSTALL_DIR}/update-daemon.sh
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=helix-updater
Environment=HOME=/home/helix
Environment=PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

[Install]
WantedBy=multi-user.target
SYSTEMD_EOF

    systemctl daemon-reload
    systemctl enable helix-updater.service
    systemctl start helix-updater.service
    echo "[HELIX] ✓ Update daemon installed and running"
fi
```

Where `${INSTALL_DIR}` is the actual install path (e.g., `/home/helix/helix-mission-control`).

### 7. macOS update mechanism

On macOS (Docker Desktop), there's no systemd. The update flow needs an alternative for macOS users.

**For now:** Document that macOS users should run updates manually:
```bash
cd ~/helix-mission-control
git pull origin main
docker compose up -d --build
```

**Future improvement:** The backend could run the update script directly as a subprocess instead of relying on a file-based trigger + daemon. But that's a larger refactor — skip for now.

Add a note to the Settings > System page on macOS: "Automatic updates require Linux with systemd. On macOS, update manually via terminal."

Check if the frontend can detect the OS or if the backend can report it. If the backend health endpoint already returns OS info, use it. Otherwise, just show the manual update command always as a fallback.

## Files Modified

- `~/helix-updater.service` — New systemd unit file (prepared for Clement)
- `~/helix-mission-control/install.sh` — Add systemd service creation for Linux installs
- `~/helix-mission-control/update-daemon.sh` — Verify it exists and is correct (no changes expected)

## Apply to Staging Too

Staging doesn't need its own update daemon (it shares the same VPS and we update it manually). Skip systemd setup for staging — only apply the install.sh changes to both branches.

## After Completion

Update CODEBASE-CONTEXT.md with:
- Note that helix-updater.service is now a real systemd unit
- install.sh creates it automatically on Linux installs

Then:
```bash
cd ~/helix-mission-control
git add -A && git commit -m "ops: finalize update daemon systemd service, update install.sh for auto-setup" && git push
```

Tell the user:
"Service file prepared at ~/helix-updater.service. Clement needs to run these commands to install it:"
(paste the sudo commands from step 3)
