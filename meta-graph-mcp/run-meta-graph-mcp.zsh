#!/bin/zsh
set -euo pipefail

export META_APP_ID='1838487097516540'
export META_APP_ACCESS_TOKEN="$(/usr/bin/security find-generic-password -a 'aandzumanalieva' -s 'codex-meta-graph-avtoins' -w)"
exec /Users/aandzumanalieva/.nvm/versions/node/v20.19.0/bin/node "$(dirname "$0")/index.js"
