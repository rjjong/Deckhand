#!/usr/bin/env bash
# Examples on the server: bash /srv/deckhand/current/scripts/server/manage.sh ps
set -euo pipefail
deckhand_root=/srv/deckhand
cd "$deckhand_root"
deckhand_gpu_args=()
if [[ -f "$deckhand_root/gpu.enabled" ]]; then
  deckhand_gpu_args=(-f "$deckhand_root/current/compose.gpu.yaml")
fi
exec docker compose --project-name deckhand \
  --env-file "$deckhand_root/.env" --env-file "$deckhand_root/current/.release.env" \
  -f "$deckhand_root/current/compose.yaml" -f "$deckhand_root/current/compose.server.yaml" "${deckhand_gpu_args[@]}" "$@"
