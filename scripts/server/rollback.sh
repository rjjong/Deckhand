#!/usr/bin/env bash
# Switch application images; database restoration is a separate, explicit step.
set -euo pipefail
deckhand_root=/srv/deckhand
cd "$deckhand_root"
exec 9>.deploy.lock
flock -n 9 || { echo 'Another deployment is already running.' >&2; exit 1; }
old=$(readlink -f current)
target=$(readlink -f previous)
[[ -f "$target/.release.env" ]] || { echo 'No previous release exists.' >&2; exit 1; }
python3 "$old/scripts/server/backup.py"
compose_at() {
  local directory=$1
  shift
  docker compose --project-name deckhand --env-file "$deckhand_root/.env" \
    --env-file "$directory/.release.env" -f "$directory/compose.yaml" \
    -f "$directory/compose.server.yaml" "$@"
}
if ! compose_at "$target" up -d --no-build --wait --wait-timeout 120; then
  compose_at "$old" up -d --no-build --wait --wait-timeout 120
  exit 1
fi
ln -s "$target" .current-rollback
mv -Tf .current-rollback current
ln -sfn "$old" previous
echo "Active release: $(basename "$target")"
