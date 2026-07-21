# Klinok cloud bootstrap

The deployment model that best fits the current architecture is a single persistent Linux VM running Docker Compose. Avoid an autoscaling container platform for now: `auth-node` uses LevelDB and in-memory rate limits, while `p2p-node` requires persistent OrbitDB storage and a stable peer identity.

## Deployment layout

```text
Internet
   ├── 80/443 ── UI nginx
   │                ├── /api/auth/* → auth-node:8090
   │                └── /api/events → p2p-node:8091
   └── 8089 ─── P2P TLS WebSocket

auth-node ── outbound SMTP
```

Only ports `80`, `443`, and `8089` should be public. Ports `8090` and `8091` must remain internal.

## 1. Prepare the cloud host

Provision a Linux VM with:

- a persistent system disk or attached data disk;
- a static public IP;
- Docker Engine and Docker Compose v2;
- DNS `A` and, if applicable, `AAAA` records for the deployment hostname;
- inbound firewall access to TCP ports `80`, `443`, and `8089`;
- restricted SSH access;
- outbound access to the selected SMTP provider.

Create persistent directories for the service data and TLS certificate:

```text
/srv/klinok/auth/data
/srv/klinok/p2p/data
/srv/klinok/certificate
```

The P2P container runs as a non-root Node user. It must be able to write its data directory and read the TLS private key.

## 2. Customize the production Compose configuration

[`docker-compose-ghrc.yml`](docker-compose-ghrc.yml) is the production template, but currently hard-codes:

- `klinok.sw.consulting`;
- `/home/maxirmx/...` storage paths;
- `latest` container tags;
- certificate names `s.crt` and `s.key`.

Replace these values with the deployment hostname and `/srv/klinok` paths. Prefer an immutable release tag over `latest`.

The UI [`config/nginx.conf`](config/nginx.conf) also hard-codes `klinok.sw.consulting`. For another hostname, either rebuild the UI image after changing the file or mount a customized configuration into the container.

Use the same certificate for:

- HTTPS on port `443`;
- the P2P TLS WebSocket on port `8089`.

If using Let's Encrypt, copy the certificate into the expected `s.crt` and `s.key` paths. Restart both `ui-blue` and `p2p-blue` after certificate renewal because the P2P process reads its certificate at startup.

Add the following environment value to `auth-blue` when nginx is its only proxy:

```yaml
KLINOK_AUTH_TRUST_PROXY: "1"
```

This allows authentication rate limiting to use the client address supplied by the trusted nginx proxy. Do not use the unrestricted value `true` when the authentication service is reachable from an untrusted network.

Configure the production SMTP service through the Compose environment:

```env
KLINOK_SMTP_HOST=smtp.example.com
KLINOK_SMTP_PORT=587
KLINOK_SMTP_SECURE=false
KLINOK_SMTP_USER=...
KLINOK_SMTP_PASSWORD=...
KLINOK_SMTP_FROM="Клинок <noreply@example.com>"
```

Port `587` normally uses STARTTLS with `KLINOK_SMTP_SECURE=false`. Implicit TLS on port `465` normally uses `KLINOK_SMTP_SECURE=true`. Follow the SMTP provider's requirements.

Protect the runtime environment file:

```sh
chmod 600 .env
```

If the GHCR packages are private, authenticate before pulling them:

```sh
docker login ghcr.io
```

## 3. Provision the bootstrap Administrator exactly once

Provisioning creates the permanent trust root for an operational deployment. Run it before starting `auth-blue`, and never generate a second bootstrap identity over existing operational data.

Supply the bootstrap secrets through the environment or a secret manager rather than committing them:

```sh
export KLINOK_BOOTSTRAP_EMAIL='administrator@example.com'
export KLINOK_BOOTSTRAP_PASSWORD='a-long-unique-password'
export KLINOK_RECOVERY_PASSPHRASE='a-separate-long-offline-passphrase'

docker compose -f docker-compose.yml run --rm --no-deps -T \
  -e KLINOK_BOOTSTRAP_EMAIL \
  -e KLINOK_BOOTSTRAP_PASSWORD \
  -e KLINOK_RECOVERY_PASSPHRASE \
  auth-blue node auth-node/dist/provision.js
```

This creates:

- the immutable bootstrap Administrator account;
- the authentication attestation private key;
- the user-key escrow master key;
- the bootstrap signing anchor;
- an encrypted recovery bundle.

Extract the authentication attestation public key:

```sh
docker compose -f docker-compose.yml run --rm --no-deps -T \
  auth-blue node -e \
  "const fs=require('fs');process.stdout.write(JSON.stringify(JSON.parse(fs.readFileSync('/data/provisioned/auth-attestation-public-key.json'))))"
```

Extract the bootstrap signing public key:

```sh
docker compose -f docker-compose.yml run --rm --no-deps -T \
  auth-blue node -e \
  "const fs=require('fs');process.stdout.write(JSON.stringify(JSON.parse(fs.readFileSync('/data/provisioned/bootstrap-public-anchor.json')).signingPublicKey))"
```

Store the compact JSON results in the protected `.env` file:

```env
KLINOK_AUTH_ATTESTATION_PUBLIC_KEY={"kty":"EC",...}
KLINOK_BOOTSTRAP_SIGNING_PUBLIC_KEY={"kty":"EC",...}
```

These public keys must be identical in the UI, authentication service, and P2P node.

Copy the recovery bundle to secure offline storage:

```sh
umask 077

docker compose -f docker-compose.yml run --rm --no-deps -T \
  auth-blue node -e \
  "const fs=require('fs');process.stdout.write(fs.readFileSync('/data/provisioned/bootstrap-recovery.bundle.json','utf8'))" \
  > bootstrap-recovery.bundle.json
```

Keep its passphrase separately as an emergency and legacy-migration backup. New installations also keep the bootstrap account's encrypted private-key copy in the authentication data directory, so a successfully authenticated replacement browser is approved automatically. Remove the bootstrap password and recovery passphrase from the shell after provisioning:

```sh
unset KLINOK_BOOTSTRAP_EMAIL KLINOK_BOOTSTRAP_PASSWORD KLINOK_RECOVERY_PASSPHRASE
```

## 4. Start the services

Pull the configured image versions and start the trusted P2P node first:

```sh
docker compose --env-file klinok.env -f docker-compose.yml pull
docker compose --env-file klinok.env -f docker-compose.yml up -d p2p-blue
docker compose --env-file klinok.env -f docker-compose.yml ps
```

Wait until `p2p-blue` is healthy, and then start authentication and the UI:

```sh
docker compose --env-file klinok.env -f docker-compose.yml up -d auth-blue
docker compose --env-file klinok.env -f docker-compose.yml up -d ui-blue
docker compose --env-file klinok.env -f docker-compose.yml ps
```

The resulting startup order is:

1. `p2p-blue` starts with the bootstrap and attestation public keys.
2. `auth-blue` starts and observes the trusted control database.
3. `ui-blue` starts after both backend services are healthy and publishes the same trust configuration in `config.json`.

## 5. Verify the deployment

Check the public endpoints:

```sh
curl -fsS https://your-domain.example/api/auth/session
curl -fsS https://your-domain.example/config.json
```

Confirm that:

- all three containers are healthy;
- `config.json` contains both public keys rather than `null`;
- the trusted P2P multiaddress uses the public hostname and `/tls/ws`;
- the `p2p-blue` logs contain a `p2p.started` event;
- a user can register, receive the SMTP verification message, verify the address, and sign in.

Use service logs when troubleshooting:

```sh
docker compose --env-file .env -f docker-compose-ghrc.yml logs --tail=200 ui-blue auth-blue p2p-blue
```

## 6. Backups and recovery

Back up both persistent data directories:

- `auth/data` contains accounts, encrypted user private-key sets, the attestation private key, and `user-key-escrow-key.json`;
- `p2p/data` contains control and medical events plus the stable P2P identity.

For a consistent filesystem backup, briefly stop the affected containers or use a quiesced disk snapshot. Store backups encrypted and test restoration periodically. The auth data directory must be restored as one unit: without `user-key-escrow-key.json`, none of its encrypted account key sets can be recovered.

The authentication service can decrypt all account key sets. This prototype therefore relies on the authentication host as a trusted key custodian and does not provide strict end-to-end key custody. A successful password login or email password reset authorizes automatic enrollment and key delivery to a new browser.

Never deploy either backend service with ephemeral storage. Do not run `docker compose down -v` against an operational deployment, because it can delete persistent volumes.

## 7. Updates

Back up the deployment, select a tested immutable image tag, and then update the containers:

```sh
docker compose --env-file .env -f docker-compose-ghrc.yml pull
docker compose --env-file .env -f docker-compose-ghrc.yml up -d
```

Verify health, login, email delivery, and P2P synchronization after every update. The current `auth-node` design is intended for one instance; do not horizontally scale it until LevelDB and the in-memory rate-limit counters are replaced with shared services.
