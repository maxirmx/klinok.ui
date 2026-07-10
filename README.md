# Klinok

Klinok is a Russian-language, local-first veterinary application with operational email/password authentication and signed P2P authorization.

## Architecture

- `src/` — Vue UI. It starts with `GET /api/auth/session`, keeps private user keys in IndexedDB, and opens P2P databases only for an authenticated, attested device.
- `auth-node/` — Fastify/LevelDB authentication service for credentials, email verification, password recovery, HTTP sessions, device enrollment, and SMTP delivery.
- `p2p-node/` — untrusted OrbitDB storage/transport node. It verifies signed envelopes but receives no passwords or user private keys.
- `packages/protocol/` — shared event contracts, cryptography, authorization rules, and deterministic reducers used by browser and Node runtimes.

The current databases are `klinok-control-v1` and `klinok-medical-v3`. There is no migration or runtime fallback from earlier demo data.

## Development

The easiest way to start the complete application locally is Docker Compose:

```sh
./scripts/run-local.sh
```

The script builds the images, provisions a local bootstrap Administrator, connects the
services with the generated trust keys, and waits for the application to become ready.
It prints the local credentials when it finishes. The application is available at
`http://localhost:8080` and Mailpit at `http://localhost:8025`.

After the complete stack is running, rebuild and restart only the UI service with:

```sh
./scripts/rebuild-ui.sh
```

The script preserves the running auth, P2P, and mail services and reuses their current
trust configuration.

Docker with Compose v2 and `curl` are required. To rebuild less often after the first
run, use `KLINOK_SKIP_BUILD=true ./scripts/run-local.sh`. Stop the stack with:

```sh
COMPOSE_PROJECT_NAME=klinok_local docker compose down
```

If Compose crashes with `SIGBUS` or reports an input/output error under WSL, quit
Docker Desktop, run `wsl --shutdown` in Windows PowerShell, and restart Docker Desktop.

For local Node.js checks outside Docker:

```sh
npm ci
npm test
npm run build
```

## Bootstrap Administrator

Provision exactly once with secrets supplied through the environment or Docker secrets:

```sh
export KLINOK_BOOTSTRAP_EMAIL=administrator@example.ru
export KLINOK_BOOTSTRAP_PASSWORD='a-long-initial-password'
export KLINOK_RECOVERY_PASSPHRASE='a-separate-long-offline-passphrase'
npm run build:auth && npm run auth:provision
```

Store `bootstrap-recovery.bundle.json` offline. The bootstrap account and Administrator role cannot be deleted or revoked. Losing every bootstrap device and the offline recovery bundle requires resetting the operational deployment.

## Security boundaries

- Roles are `administrator`, `doctor`, and `owner`; users explicitly select one active role for every route and signed write.
- Profiles and medical records are encrypted with AES-GCM. Keys are wrapped with RSA-OAEP-256 and event envelopes are signed with ECDSA P-256.
- Administrators manage accounts, roles, dictionaries, and templates but receive no medical key envelopes.
- Revoking pet access rotates the key for future records; historical data already decrypted by a recipient cannot be clawed back.
- Legal document text, versions, retention schedules, SMTP, credentials, and persistent volumes are deployment-owned configuration.
