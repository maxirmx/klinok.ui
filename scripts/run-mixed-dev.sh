#!/usr/bin/env bash
set -Eeuo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

for command in docker node npm; do
  if ! command -v "$command" >/dev/null 2>&1; then
    printf 'Missing required command: %s\n' "$command" >&2
    exit 1
  fi
done

compose_version_output=""
if ! compose_version_output=$(docker compose version 2>&1); then
  printf 'Docker Compose could not start.\n' >&2
  if [[ -n "$compose_version_output" ]]; then
    printf '%s\n' "$compose_version_output" >&2
  fi
  if [[ -d /mnt/wsl/docker-desktop ]]; then
    printf '\nDocker Desktop WSL integration may be unhealthy. From Windows, quit Docker Desktop, run "wsl --shutdown" in PowerShell, then start Docker Desktop again.\n' >&2
  else
    printf 'Docker Compose v2 is required (the "docker compose" command).\n' >&2
  fi
  exit 1
fi

export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-klinok_local}"
export KLINOK_BOOTSTRAP_EMAIL="${KLINOK_BOOTSTRAP_EMAIL:-maxirmx@sw.consulting}"
export KLINOK_BOOTSTRAP_PASSWORD="${KLINOK_BOOTSTRAP_PASSWORD:-Password&Spaniel&26}"
export KLINOK_RECOVERY_PASSPHRASE="${KLINOK_RECOVERY_PASSPHRASE:-Bene facta me clarum non fecerunt}"
export KLINOK_PUBLIC_ORIGIN="${KLINOK_PUBLIC_ORIGIN:-http://127.0.0.1:5173}"

compose=(docker compose -f docker-compose.yml -f docker-compose.mixed-dev.yml)

diagnose() {
  status=$?
  if (( status != 0 )); then
    printf '\nMixed dev startup failed. Current services:\n' >&2
    "${compose[@]}" ps --all >&2 || true
    printf '\nRecent service logs:\n' >&2
    "${compose[@]}" logs --no-color --tail=100 auth p2p mail >&2 || true
  fi
  exit "$status"
}
trap diagnose EXIT

if [[ "${KLINOK_SKIP_BUILD:-false}" != "true" ]]; then
  "${compose[@]}" build auth p2p
fi

# A running auth process holds the LevelDB lock. Stop it before the idempotent
# provision step; named volumes and existing data remain intact.
"${compose[@]}" stop ui auth >/dev/null 2>&1 || true

# Provisioning is idempotent and reuses the same named volumes as the complete
# local stack.
"${compose[@]}" run --rm -T \
  -e KLINOK_BOOTSTRAP_EMAIL \
  -e KLINOK_BOOTSTRAP_PASSWORD \
  -e KLINOK_RECOVERY_PASSPHRASE \
  auth node auth-node/dist/provision.js

export KLINOK_AUTH_ATTESTATION_PUBLIC_KEY
KLINOK_AUTH_ATTESTATION_PUBLIC_KEY=$("${compose[@]}" run --rm -T auth node -e \
  "const fs=require('fs');process.stdout.write(JSON.stringify(JSON.parse(fs.readFileSync('/data/provisioned/auth-attestation-public-key.json'))))")

export KLINOK_BOOTSTRAP_SIGNING_PUBLIC_KEY
KLINOK_BOOTSTRAP_SIGNING_PUBLIC_KEY=$("${compose[@]}" run --rm -T auth node -e \
  "const fs=require('fs');process.stdout.write(JSON.stringify(JSON.parse(fs.readFileSync('/data/provisioned/bootstrap-public-anchor.json')).signingPublicKey))")

"${compose[@]}" up -d p2p

P2P_PEER_ID=""
for _ in {1..60}; do
  P2P_PEER_ID=$("${compose[@]}" logs --no-color p2p 2>/dev/null \
    | sed -n 's/.*"peerId":"\([^"]*\)".*/\1/p' \
    | tail -n 1 \
    | tr -d '\r\n')
  [[ -n "$P2P_PEER_ID" ]] && break
  sleep 1
done

if [[ -z "$P2P_PEER_ID" ]]; then
  printf 'Timed out waiting for the P2P node peer ID.\n' >&2
  exit 1
fi

export KLINOK_TRUSTED_NODE="/ip4/127.0.0.1/tcp/8089/ws/p2p/$P2P_PEER_ID"
export KLINOK_P2P_TRUSTED_NODES="/dns4/p2p/tcp/8089/ws/p2p/$P2P_PEER_ID"
"${compose[@]}" up -d auth mail

for _ in {1..60}; do
  if node -e "fetch('http://127.0.0.1:8090/healthz').then(response=>{if(!response.ok)process.exit(1)}).catch(()=>process.exit(1))"; then
    break
  fi
  sleep 1
done

if ! node -e "fetch('http://127.0.0.1:8090/healthz').then(response=>{if(!response.ok)process.exit(1)}).catch(()=>process.exit(1))"; then
  printf 'Timed out waiting for the authentication service.\n' >&2
  exit 1
fi

mkdir -p .klinok-local
"${compose[@]}" exec -T auth node -e \
  "const fs=require('fs');process.stdout.write(fs.readFileSync('/data/provisioned/bootstrap-recovery.bundle.json','utf8'))" \
  > .klinok-local/bootstrap-recovery.bundle.json
chmod 600 .klinok-local/bootstrap-recovery.bundle.json

export KLINOK_DEV_CONFIG="$PWD/.klinok-local/mixed-dev-config.json"
node -e '
const fs = require("node:fs");
fs.writeFileSync(process.env.KLINOK_DEV_CONFIG, JSON.stringify({
  enableLog: false,
  authBaseUrl: "",
  legal: {
    personalDataConsent: { version: "2026-07-10", href: "/legal/personal-data-consent" },
    userAgreement: { version: "2026-07-10", href: "/legal/user-agreement" }
  },
  p2p: {
    enabled: true,
    controlDatabaseName: "klinok-control-v1",
    medicalDatabaseName: "klinok-medical-v3",
    trustedNodeMultiaddrs: [process.env.KLINOK_TRUSTED_NODE],
    bootstrapAccountId: "bootstrap-administrator",
    authAttestationPublicKey: JSON.parse(process.env.KLINOK_AUTH_ATTESTATION_PUBLIC_KEY),
    bootstrapSigningPublicKey: JSON.parse(process.env.KLINOK_BOOTSTRAP_SIGNING_PUBLIC_KEY)
  }
}, null, 2) + "\n", { mode: 0o600 });
'

trap - EXIT
printf '\nKlinok mixed development mode is ready:\n'
printf '  UI with hot reload: %s\n' "$KLINOK_PUBLIC_ORIGIN"
printf '  Auth node: Docker, proxied by Vite\n'
printf '  P2P node: ws://localhost:8089\n'
printf '  Mailpit: http://localhost:8025\n'
printf '  Test email: %s\n' "$KLINOK_BOOTSTRAP_EMAIL"
printf '  Test password: %s\n\n' "$KLINOK_BOOTSTRAP_PASSWORD"
printf 'Stop backend containers with: COMPOSE_PROJECT_NAME=%s docker compose -f docker-compose.yml -f docker-compose.mixed-dev.yml down\n\n' "$COMPOSE_PROJECT_NAME"

exec npm run dev
