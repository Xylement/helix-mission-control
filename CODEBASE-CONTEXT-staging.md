# HELIX Mission Control — STAGING Environment
## Created: March 27, 2026

---

## THIS IS THE STAGING ENVIRONMENT

**Production is at ~/helix-mission-control/ — NEVER touch it from here.**

---

## Port Mappings

| Service | Host Port | Container Internal Port |
|---------|-----------|------------------------|
| Frontend | 3100 | 3000 |
| Backend | 8010 | 8000 |
| PostgreSQL | 5435 | 5432 |
| Redis | 6380 | 6379 |
| OpenClaw Gateway (host systemd) | 18810 | — |

## URLs

- Staging: https://staging.helixnode.tech
- Staging API: https://staging.helixnode.tech/api

## License

- Key: `HLX-STAG-7F27-48F9-90C7`
- Plan: Scale (50 agents, 25 members)
- Status: Active, expires March 2027
- Customer: staging@helixnode.tech

## Gateway

- Staging OpenClaw runs as a host systemd service on port 18810
- Config: `~/.openclaw-staging/openclaw.json`
- Auth token: `03fd1b8c09e5e10f14860757c454797bab0cdfe7aedabbd9`
- Model: kimi-coding/k2p5 via OpenClaw credential store

## Docker Compose

**File:** `docker-compose.staging.yml` (the ONLY compose file for staging)

**Build and start:**
```bash
cd ~/helix-staging
docker compose -f docker-compose.staging.yml up -d --build
```

**View logs:**
```bash
docker compose -f docker-compose.staging.yml logs -f staging-backend
```

**Restart a service:**
```bash
docker compose -f docker-compose.staging.yml restart staging-backend
```

**Stop all staging:**
```bash
docker compose -f docker-compose.staging.yml down
```

## Container Names

All prefixed with `staging-`: staging-db, staging-redis, staging-gateway, staging-backend, staging-frontend

## Volumes

- `staging_postgres_data` — PostgreSQL data
- `staging_uploads_data` — File uploads
- `staging_redis_data` — Redis data

## Network

`helix-staging-network` — completely isolated from production `helix-network`

## Database

- DB name: `helix_mc_staging`
- Port: 5435 (host) -> 5432 (container)
- Credentials in `.env` (not committed to git)

## Git Workflow

1. Work on the `staging` branch
2. Test changes at https://staging.helixnode.tech
3. When verified, merge to `main` and deploy to production

## DO NOT TOUCH

- ~/helix-mission-control/ (production)
- ~/helixnode-api/ (license server)
- Port 5432 (production PostgreSQL)
- Port 5433 (license server PostgreSQL)
- Port 18789 (production OpenClaw gateway)
- ~/.openclaw/ (production OpenClaw config)
