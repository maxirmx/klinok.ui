#!/bin/sh
set -eu

CONFIG_PATH=${CONFIG_PATH:-/var/www/klinok/config.json}
ENABLE_LOG=${ENABLE_LOG:-false}
CONTROL_DB=${KLINOK_CONTROL_DB:-klinok-control-v1}
MEDICAL_DB=${KLINOK_MEDICAL_DB:-klinok-medical-v3}
TRUSTED_NODE=${KLINOK_TRUSTED_NODE:-/dns4/klinok.sw.consulting/tcp/8089/tls/ws}
BOOTSTRAP_ACCOUNT_ID=${KLINOK_BOOTSTRAP_ACCOUNT_ID:-bootstrap-administrator}
PERSONAL_DATA_VERSION=${KLINOK_PERSONAL_DATA_CONSENT_VERSION:-2026-07-10}
USER_AGREEMENT_VERSION=${KLINOK_USER_AGREEMENT_VERSION:-2026-07-10}
AUTH_ATTESTATION_PUBLIC_KEY=${KLINOK_AUTH_ATTESTATION_PUBLIC_KEY:-null}
BOOTSTRAP_SIGNING_PUBLIC_KEY=${KLINOK_BOOTSTRAP_SIGNING_PUBLIC_KEY:-null}

case "$ENABLE_LOG" in true|false) ;; *) ENABLE_LOG=false ;; esac

cat > "$CONFIG_PATH" <<EOF
{
  "enableLog": $ENABLE_LOG,
  "authBaseUrl": "",
  "legal": {
    "personalDataConsent": { "version": "$PERSONAL_DATA_VERSION", "href": "/legal/personal-data-consent" },
    "userAgreement": { "version": "$USER_AGREEMENT_VERSION", "href": "/legal/user-agreement" }
  },
  "p2p": {
    "enabled": true,
    "controlDatabaseName": "$CONTROL_DB",
    "medicalDatabaseName": "$MEDICAL_DB",
    "trustedNodeMultiaddrs": ["$TRUSTED_NODE"],
    "bootstrapAccountId": "$BOOTSTRAP_ACCOUNT_ID",
    "authAttestationPublicKey": $AUTH_ATTESTATION_PUBLIC_KEY,
    "bootstrapSigningPublicKey": $BOOTSTRAP_SIGNING_PUBLIC_KEY
  }
}
EOF

echo "Klinok public runtime configuration updated."
