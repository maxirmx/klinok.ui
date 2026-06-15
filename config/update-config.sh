#!/bin/sh
# Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
# All rights reserved.
# This file is a part of Klinok ui application

set -eu

# This script updates the runtime configuration with environment variables.

CONFIG_PATH=${CONFIG_PATH:-/var/www/klinok/config.json}
API_URL=${API_URL:-https://klinok.sw.consulting:8085/api}
ENABLE_LOG=${ENABLE_LOG:-false}

case "$ENABLE_LOG" in
  true|false) ;;
  *) ENABLE_LOG=false ;;
esac

json_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

cat > "$CONFIG_PATH" <<EOF
{
  "apiUrl": "$(json_escape "$API_URL")",
  "enableLog": $ENABLE_LOG
}
EOF

echo "Runtime configuration updated:"
echo "API URL: ${API_URL}"
echo "Enable Log: ${ENABLE_LOG}"
