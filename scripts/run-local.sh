#!/usr/bin/env bash
set -Eeuo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

for command in docker curl; do
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
export KLINOK_BOOTSTRAP_EMAIL="${KLINOK_BOOTSTRAP_EMAIL:-administrator@example.ru}"
export KLINOK_BOOTSTRAP_PASSWORD="${KLINOK_BOOTSTRAP_PASSWORD:-bootstrap-password-2026}"
export KLINOK_RECOVERY_PASSPHRASE="${KLINOK_RECOVERY_PASSPHRASE:-offline-recovery-passphrase-2026}"
export KLINOK_PUBLIC_ORIGIN="http://localhost:8080"

diagnose() {
  status=$?
  if (( status != 0 )); then
    printf '\nLocal startup failed. Current services:\n' >&2
    docker compose ps --all >&2 || true
    printf '\nRecent service logs:\n' >&2
    docker compose logs --no-color --tail=100 >&2 || true
  fi
  exit "$status"
}
trap diagnose EXIT

stop_services_before_provisioning() {
  local running_services service

  # Stop services separately because a missing UI container must not prevent
  # auth from releasing the LevelDB lock before the one-off provision command.
  for service in ui auth; do
    docker compose stop "$service" >/dev/null 2>&1 || true
  done

  if ! running_services=$(docker compose ps --status running --services); then
    printf 'Unable to inspect the local services before provisioning.\n' >&2
    return 1
  fi

  for service in ui auth; do
    if grep -Fxq "$service" <<<"$running_services"; then
      printf 'Could not stop %s before provisioning. Stop the service and try again.\n' "$service" >&2
      return 1
    fi
  done
}

if [[ "${KLINOK_SKIP_BUILD:-false}" != "true" ]]; then
  docker compose build
fi

# Provisioning is idempotent: existing local volumes keep the original account
# and trust material; on first run these values create them.
stop_services_before_provisioning
docker compose run --rm -T \
  -e KLINOK_BOOTSTRAP_EMAIL \
  -e KLINOK_BOOTSTRAP_PASSWORD \
  -e KLINOK_RECOVERY_PASSPHRASE \
  auth node auth-node/dist/provision.js

export KLINOK_AUTH_ATTESTATION_PUBLIC_KEY
KLINOK_AUTH_ATTESTATION_PUBLIC_KEY=$(docker compose run --rm -T auth node -e \
  "const fs=require('fs');process.stdout.write(JSON.stringify(JSON.parse(fs.readFileSync('/data/provisioned/auth-attestation-public-key.json'))))")

export KLINOK_BOOTSTRAP_SIGNING_PUBLIC_KEY
KLINOK_BOOTSTRAP_SIGNING_PUBLIC_KEY=$(docker compose run --rm -T auth node -e \
  "const fs=require('fs');process.stdout.write(JSON.stringify(JSON.parse(fs.readFileSync('/data/provisioned/bootstrap-public-anchor.json')).signingPublicKey))")

docker compose up -d p2p

P2P_PEER_ID=""
for _ in {1..60}; do
  P2P_PEER_ID=$(docker compose logs --no-color p2p 2>/dev/null \
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
docker compose up -d auth mail ui

for _ in {1..60}; do
  if curl --fail --silent "$KLINOK_PUBLIC_ORIGIN/api/auth/session" >/dev/null; then
    break
  fi
  sleep 1
done

if ! curl --fail --silent "$KLINOK_PUBLIC_ORIGIN/api/auth/session" >/dev/null; then
  printf 'Timed out waiting for the application.\n' >&2
  exit 1
fi

mkdir -p .klinok-local
docker compose exec -T auth node -e \
  "const fs=require('fs');process.stdout.write(fs.readFileSync('/data/provisioned/bootstrap-recovery.bundle.json','utf8'))" \
  > .klinok-local/bootstrap-recovery.bundle.json
chmod 600 .klinok-local/bootstrap-recovery.bundle.json

trap - EXIT
printf '\nKlinok is running:\n'
printf '  Application: %s\n' "$KLINOK_PUBLIC_ORIGIN"
printf '  Test email: %s\n' "$KLINOK_BOOTSTRAP_EMAIL"
printf '  Test password: %s\n' "$KLINOK_BOOTSTRAP_PASSWORD"
printf '  Mailpit: http://localhost:8025\n'
printf '  Recovery bundle: .klinok-local/bootstrap-recovery.bundle.json\n\n'
printf 'Stop it with: COMPOSE_PROJECT_NAME=%s docker compose down\n' "$COMPOSE_PROJECT_NAME"
