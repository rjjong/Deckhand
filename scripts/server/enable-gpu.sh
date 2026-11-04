#!/usr/bin/env bash
# Run after setup-gpu.sh and a reboot. Verify inference before retaining GPU mode.
set -euo pipefail
nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader
deckhand_root=/srv/deckhand
deckhand_image=$(docker compose --project-name deckhand --env-file "$deckhand_root/.env" \
  --env-file "$deckhand_root/current/.release.env" -f "$deckhand_root/current/compose.yaml" \
  -f "$deckhand_root/current/compose.server.yaml" config --images | grep 'ollama/' | head -1)
docker run --rm --gpus all --entrypoint nvidia-smi "$deckhand_image" --query-gpu=name,memory.total --format=csv,noheader
warm_model() {
  docker exec -i deckhand-deckhand-1 node --input-type=module <<'JS'
const base = process.env.OLLAMA_URL;
const model = process.env.OLLAMA_MODEL;
const response = await fetch(base + '/api/generate', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  signal: AbortSignal.timeout(85000),
  body: JSON.stringify({ model, prompt: 'Reply with ready.', stream: false, think: false,
    keep_alive: '30m', options: { num_ctx: 4096, num_predict: 8, num_batch: 128, num_thread: 3 } }),
});
if (!response.ok) throw new Error('Local model warmup failed: ' + response.status);
await response.json();
const { models } = await fetch(base + '/api/ps').then(r => r.json());
const running = models.find(entry => entry.name === model || entry.model === model);
if (!(running?.size_vram > 0)) throw new Error('Ollama still uses CPU only; GPU mode was not retained.');
console.log('Verified GPU inference:', model, Math.round(running.size_vram / 1048576), 'MiB in VRAM');
JS
}
touch "$deckhand_root/gpu.enabled"
if ! bash "$deckhand_root/current/scripts/server/manage.sh" up -d --no-deps --wait ollama || ! warm_model; then
  rm -f "$deckhand_root/gpu.enabled"
  bash "$deckhand_root/current/scripts/server/manage.sh" up -d --no-deps --wait ollama
  echo 'Returned to CPU mode because GPU inference could not be verified.' >&2
  exit 1
fi
echo 'GPU acceleration verified and enabled. Models remain in the same persistent volume.'
