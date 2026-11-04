#!/usr/bin/env python3
"""Deploy this working tree over SSH, including uncommitted customizations."""
import datetime
from pathlib import Path
import re
import subprocess
import sys
import tarfile
import tempfile
import uuid

SOURCE = Path(__file__).resolve().parents[2]
REMOTE = r'''
set -euo pipefail
umask 077
deckhand_root=/srv/deckhand
release=$1
cd "$deckhand_root"
exec 9>.deploy.lock
flock -n 9 || { echo 'Another deployment is already running.' >&2; exit 1; }
test -f .env || { echo 'Configure /srv/deckhand/.env first.' >&2; exit 1; }
mkdir "releases/$release"
tar -xzf "releases/$release.tar.gz" -C "releases/$release"
candidate="$deckhand_root/releases/$release"
printf 'DECKHAND_IMAGE=deckhand:%s\n' "$release" > "$candidate/.release.env"
compose_at() {
  local directory=$1
  shift
  local gpu_args=()
  if [[ -f "$deckhand_root/gpu.enabled" && -f "$directory/compose.gpu.yaml" ]]; then
    gpu_args=(-f "$directory/compose.gpu.yaml")
  fi
  docker compose --project-name deckhand --env-file "$deckhand_root/.env" \
    --env-file "$directory/.release.env" -f "$directory/compose.yaml" \
    -f "$directory/compose.server.yaml" "${gpu_args[@]}" "$@"
}
compose_at "$candidate" config --quiet
compose_at "$candidate" build --pull
old=$(readlink -f current || true)
if [[ -f data/deckhand.sqlite ]]; then
  python3 "$candidate/scripts/server/backup.py"
fi
if ! compose_at "$candidate" up -d --no-build --wait --wait-timeout 120; then
  echo 'New release failed its health check.' >&2
  if [[ -n "$old" && -f "$old/.release.env" ]]; then
    echo 'Restoring the previous application image.' >&2
    compose_at "$old" up -d --no-build --wait --wait-timeout 120
  fi
  exit 1
fi
if [[ -n "$old" && -f "$old/.release.env" ]]; then
  ln -sfn "$old" previous
fi
ln -s "releases/$release" ".current-$release"
mv -Tf ".current-$release" current
echo "Deployed release: $release"
compose_at "$candidate" ps
'''


def main():
    host = sys.argv[1] if len(sys.argv) > 1 else 'ubuntu-server'
    if len(sys.argv) > 2 or not re.fullmatch(r'[A-Za-z0-9_][A-Za-z0-9_.@:-]*', host):
        raise SystemExit('Usage: python3 scripts/server/deploy.py [ssh-host]')
    release = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    release += '-' + uuid.uuid4().hex[:8]
    names = [
        'Dockerfile', '.dockerignore', '.node-version', 'compose.yaml', 'compose.server.yaml',
        'compose.cloudflare.yaml',
        'compose.gpu.yaml',
        'package.json', 'package-lock.json', 'index.html', 'sw.js', 'manifest.json', 'version.json',
        'server', 'scripts', 'shared', 'src', 'styles', 'assets', 'docs', 'README.md',
    ]
    names += [p.name for p in SOURCE.glob('*.png')]
    with tempfile.TemporaryDirectory(prefix='deckhand-release-') as temporary:
        archive = Path(temporary) / f'{release}.tar.gz'
        def include(info):
            if any(part in {'.env', '.git', '__pycache__', 'node_modules'} for part in Path(info.name).parts):
                return None
            if Path(info.name).name.startswith('.env.'):
                return None
            return info
        with tarfile.open(archive, 'w:gz') as tar:
            for name in names:
                file = SOURCE / name
                if file.exists():
                    tar.add(file, arcname=name, filter=include)
        subprocess.run(['scp', '-q', str(archive), f'{host}:/srv/deckhand/releases/{release}.tar.gz'], check=True)
        subprocess.run(['ssh', '-T', host, f'bash -s -- {release}'], input=REMOTE, text=True, check=True)


if __name__ == '__main__':
    main()
