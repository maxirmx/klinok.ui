#!/usr/bin/env bash
set -Eeuo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

for command in docker curl; do
  if ! command -v "$command" >/dev/null 2>&1; then
    printf 'Missing required command: %s\n' "$command" >&2
    exit 1
  fi
done

if ! docker compose version >/dev/null 2>&1; then
  printf 'Docker Compose v2 is required (the "docker compose" command).\n' >&2
  exit 1
fi

export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-klinok_local}"

require_running_service() {
  local service=$1

  if ! docker compose ps --status running --services | grep -Fxq "$service"; then
    printf 'The %s service must be running before rebuilding the UI.\n' "$service" >&2
    printf 'Start the local stack with ./scripts/run-local.sh first.\n' >&2
    exit 1
  fi
}

require_running_service auth
require_running_service p2p

export KLINOK_AUTH_ATTESTATION_PUBLIC_KEY
KLINOK_AUTH_ATTESTATION_PUBLIC_KEY=$(docker compose exec -T auth node -e \
  "const fs=require('fs');process.stdout.write(JSON.stringify(JSON.parse(fs.readFileSync('/data/provisioned/auth-attestation-public-key.json'))))")

export KLINOK_BOOTSTRAP_SIGNING_PUBLIC_KEY
KLINOK_BOOTSTRAP_SIGNING_PUBLIC_KEY=$(docker compose exec -T auth node -e \
  "const fs=require('fs');process.stdout.write(JSON.stringify(JSON.parse(fs.readFileSync('/data/provisioned/bootstrap-public-anchor.json')).signingPublicKey))")

P2P_PEER_ID=$(docker compose logs --no-color p2p 2>/dev/null \
  | sed -n 's/.*"peerId":"\([^"]*\)".*/\1/p' \
  | tail -n 1 \
  | tr -d '\r\n')

if [[ -z "$P2P_PEER_ID" ]]; then
  printf 'Could not determine the running P2P node peer ID.\n' >&2
  exit 1
fi

export KLINOK_TRUSTED_NODE="/ip4/127.0.0.1/tcp/8089/ws/p2p/$P2P_PEER_ID"

docker compose build ui
docker compose up -d --no-deps --force-recreate ui

for _ in {1..60}; do
  if curl --fail --silent http://localhost:8080/config.json >/dev/null \
    && curl --fail --silent http://localhost:8080/api/auth/session >/dev/null; then
    break
  fi
  sleep 1
done

if ! curl --fail --silent http://localhost:8080/config.json \
  | docker compose exec -T auth node -e \
      "let input='';process.stdin.on('data',chunk=>input+=chunk).on('end',()=>{const config=JSON.parse(input);if(!config.p2p?.authAttestationPublicKey||!config.p2p?.bootstrapSigningPublicKey||!config.p2p?.trustedNodeMultiaddrs?.length)process.exit(1)})"; then
  printf 'The rebuilt UI did not expose the required trust configuration.\n' >&2
  exit 1
fi

printf '\nUI rebuilt and restarted: http://localhost:8080\n'
