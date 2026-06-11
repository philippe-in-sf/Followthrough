#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "$script_dir/.." && pwd)"
config_file="${DEPLOY_CONFIG:-$script_dir/sites.env}"

if [ ! -f "$config_file" ]; then
  echo "Missing deploy config: $config_file" >&2
  echo "Copy deploy/sites.example.env to $config_file and edit it for your hosts." >&2
  exit 1
fi

set -a
source "$config_file"
set +a

cd "$repo_root"
npx tsx deploy/scripts/install-systemd.ts "$@"
