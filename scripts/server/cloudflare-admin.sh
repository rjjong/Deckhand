#!/usr/bin/env bash
# Tunnel/DNS administration uses the account certificate; the running connector
# only receives its own tunnel credentials. Run this script on the Ubuntu server.
set -euo pipefail
deckhand_edge=/srv/deckhand/edge
deckhand_image=$(sed -n 's/^    image: //p' "$deckhand_edge/compose.yaml")
[[ -n "$deckhand_image" ]] || { echo 'No connector image configured.' >&2; exit 1; }
if [[ ${1:-} == login ]]; then
  exec docker run --rm --user 1000:1000 -e HOME=/home/nonroot \
    -v "$deckhand_edge/auth:/home/nonroot" "$deckhand_image" tunnel login
fi
exec docker run --rm --read-only --user 1000:1000 \
  -v "$deckhand_edge/auth/.cloudflared:/etc/cloudflared:ro" \
  -v "$deckhand_edge/runtime:/runtime" "$deckhand_image" \
  tunnel --origincert /etc/cloudflared/cert.pem "$@"
