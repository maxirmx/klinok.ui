#!/bin/sh
set -eu

# Git Bash rewrites leading-slash multiaddrs as Windows paths when invoking docker.exe.
MSYS_NO_PATHCONV=1
export MSYS_NO_PATHCONV

COMPOSE_PROJECT_NAME=${COMPOSE_PROJECT_NAME:-klinok_e2e_${GITHUB_RUN_ID:-local}}
export COMPOSE_PROJECT_NAME

cleanup() {
  status=$?
  trap - EXIT INT TERM
  if [ "$status" -ne 0 ]; then
    mkdir -p test-results/compose
    docker compose ps --all > test-results/compose/containers.txt 2>&1 || true
    docker compose logs --no-color > test-results/compose/compose.log 2>&1 || true
  fi
  docker compose down -v --remove-orphans || true
  exit "$status"
}
trap cleanup EXIT INT TERM

docker compose down -v --remove-orphans
docker compose build
docker compose run --rm -T \
  -e KLINOK_BOOTSTRAP_EMAIL=administrator@example.ru \
  -e KLINOK_BOOTSTRAP_PASSWORD='bootstrap-password-2026' \
  -e KLINOK_RECOVERY_PASSPHRASE='offline-recovery-passphrase-2026' \
  auth node auth-node/dist/provision.js

KLINOK_AUTH_ATTESTATION_PUBLIC_KEY=$(docker compose run --rm -T auth node -e "const fs=require('fs');process.stdout.write(JSON.stringify(JSON.parse(fs.readFileSync('/data/provisioned/auth-attestation-public-key.json'))))")
KLINOK_BOOTSTRAP_SIGNING_PUBLIC_KEY=$(docker compose run --rm -T auth node -e "const fs=require('fs');process.stdout.write(JSON.stringify(JSON.parse(fs.readFileSync('/data/provisioned/bootstrap-public-anchor.json')).signingPublicKey))")
export KLINOK_AUTH_ATTESTATION_PUBLIC_KEY KLINOK_BOOTSTRAP_SIGNING_PUBLIC_KEY

docker compose up -d p2p

attempt=0
until node -e "const socket=require('node:net').connect(8089,'127.0.0.1',()=>{socket.end();process.exit(0)});socket.setTimeout(1000,()=>process.exit(1));socket.on('error',()=>process.exit(1))"; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 60 ]; then
    docker compose logs --no-color p2p
    exit 1
  fi
  sleep 1
done

attempt=0
P2P_PEER_ID=
until [ -n "$P2P_PEER_ID" ]; do
  P2P_PEER_ID=$(docker compose logs --no-color p2p 2>/dev/null | sed -n 's/.*"peerId":"\([^"]*\)".*/\1/p' | tail -n 1 | tr -d '\r\n')
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 60 ]; then
    docker compose logs --no-color p2p
    exit 1
  fi
  sleep 1
done

KLINOK_TRUSTED_NODE="/ip4/127.0.0.1/tcp/8089/ws/p2p/$P2P_PEER_ID"
KLINOK_P2P_TRUSTED_NODES="/dns4/p2p/tcp/8089/ws/p2p/$P2P_PEER_ID"
export KLINOK_TRUSTED_NODE KLINOK_P2P_TRUSTED_NODES
printf 'Using trusted P2P node %s\n' "$KLINOK_P2P_TRUSTED_NODES"
docker compose up -d auth mail ui

attempt=0
until curl --fail --silent http://localhost:8080/api/auth/session >/dev/null; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 60 ]; then
    docker compose ps
    docker compose logs --no-color
    exit 1
  fi
  sleep 1
done

KLINOK_E2E_RECOVERY_BUNDLE=$(docker compose exec -T auth node -e "const fs=require('fs');process.stdout.write(fs.readFileSync('/data/provisioned/bootstrap-recovery.bundle.json','utf8'))")
export KLINOK_E2E_RECOVERY_BUNDLE
export KLINOK_E2E_BOOTSTRAP_EMAIL=administrator@example.ru
export KLINOK_E2E_BOOTSTRAP_PASSWORD=bootstrap-password-2026
export KLINOK_E2E_RECOVERY_PASSPHRASE=offline-recovery-passphrase-2026
npx playwright test
