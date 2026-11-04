#!/usr/bin/env python3
"""Consistent online SQLite backup, private configuration and local card cache."""
import datetime
from contextlib import closing
import fcntl
import os
from pathlib import Path
import sqlite3
import tarfile
import tempfile
import uuid


def main():
    os.umask(0o077)
    root = Path('/srv/deckhand')
    backups = root / 'backups'
    backups.mkdir(mode=0o700, exist_ok=True)
    with (backups / '.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        source = root / 'data/deckhand.sqlite'
        if not source.is_file():
            raise SystemExit('No server database exists; nothing was backed up.')
        stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
        archive = backups / f'deckhand-{stamp}-{uuid.uuid4().hex[:6]}.tar.gz'
        partial = archive.with_suffix('.partial')
        try:
            with tempfile.TemporaryDirectory(prefix='.snapshot-', dir=backups) as temporary:
                snapshot = Path(temporary) / 'deckhand.sqlite'
                with closing(sqlite3.connect(source.as_uri() + '?mode=ro', uri=True, timeout=30)) as src:
                    with closing(sqlite3.connect(snapshot)) as dst:
                        src.backup(dst)
                        dst.execute('PRAGMA journal_mode=DELETE')
                        result = dst.execute('PRAGMA quick_check').fetchall()
                        if result != [('ok',)]:
                            raise RuntimeError('SQLite backup integrity check failed')
                with tarfile.open(partial, 'w:gz', compresslevel=1) as tar:
                    tar.add(snapshot, arcname='deckhand.sqlite')
                    for name, archive_name in [('.env', 'config.env'), ('current/.release.env', 'release.env'), ('gpu.enabled', 'gpu.enabled')]:
                        file = root / name
                        if file.is_file():
                            tar.add(file, arcname=archive_name)
                    library = root / 'data/data-library'
                    if library.is_dir():
                        tar.add(library, arcname='data-library')
                    for name in ['edge/compose.yaml', 'edge/runtime']:
                        file = root / name
                        if file.exists():
                            tar.add(file, arcname=name)
                os.replace(partial, archive)
        finally:
            partial.unlink(missing_ok=True)
        # Only prune completed archives after a new backup succeeds.
        cutoff = datetime.datetime.now().timestamp() - 30 * 86400
        for old in backups.glob('deckhand-*.tar.gz'):
            if old != archive and old.stat().st_mtime < cutoff:
                old.unlink()
        print(f'Backup verified: {archive}')


if __name__ == '__main__':
    main()
