#!/usr/bin/env bash
set -euo pipefail

config_file="${DEPLOY_CONFIG:-deploy/sites.env}"

if [ ! -f "$config_file" ]; then
  echo "Missing deploy config: $config_file" >&2
  echo "Copy deploy/sites.example.env to $config_file and edit it for your hosts." >&2
  exit 1
fi

set -a
source "$config_file"
set +a

npx tsx deploy/scripts/deploy.ts "${1:-all}"
