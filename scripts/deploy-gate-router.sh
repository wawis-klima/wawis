#!/usr/bin/env bash
set -euo pipefail

MODE="$(node -p "require('./RELEASE-GATE.json').release_mode || 'standard'")"

if [[ "$MODE" == "micro-ui" ]]; then
  echo "WAWIS DEPLOY GATE ROUTER: MICRO UI"
  node scripts/micro-ui-deploy-gate.cjs
else
  echo "WAWIS DEPLOY GATE ROUTER: STANDARD"
  node scripts/release-policy-gate.cjs --deploy
fi
