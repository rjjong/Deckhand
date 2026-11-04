#!/usr/bin/env bash
# Manage the separate HTTPS connector without stopping the application.
set -euo pipefail
exec docker compose --project-name deckhand-edge \
  -f /srv/deckhand/edge/compose.yaml "$@"
