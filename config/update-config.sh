#!/bin/sh
set -eu

# This script updates the runtime configuration with environment variables.

CONFIG_PATH=${CONFIG_PATH:-/usr/share/nginx/html/config.json}
API_URL=${API_URL:-}
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
