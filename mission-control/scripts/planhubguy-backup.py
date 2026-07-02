#!/usr/bin/env python3
"""Create a timestamped local backup of PlanHubGuy state and audit data.

This intentionally avoids node_modules/.next and keeps a small rolling archive so
we can recover state/logs/templates after a bad run without filling the Pi.
"""
import datetime as dt
import hashlib
import json
import tarfile
from pathlib import Path

ROOT = Path('/home/davesalter/.openclaw/workspace')
BACKUP_DIR = ROOT / 'backups' / 'planhubguy'
RETENTION = 30
INCLUDE_PATHS = [
    ROOT / 'memory' / 'planhubguy-state.json',
    ROOT / 'memory' / 'planhubguy-log.jsonl',
    ROOT / 'memory' / 'planhubguy-weekday-run.log',
    ROOT / 'mission-control' / 'data' / 'planhubguy-templates.json',
    ROOT / 'mission-control' / 'data' / 'planhubguy-templates.locked.backup.json',
    ROOT / 'mission-control' / 'data' / 'planhubguy' / 'reply-edit-learning.jsonl',
    ROOT / 'mission-control' / 'scripts' / 'PLANHUBGUY-WORKFLOW-SPEC.md',
    ROOT / 'mission-control' / 'scripts' / 'PLANHUBGUY-INBOUND-NOTES.md',
    ROOT / 'mission-control' / 'scripts' / 'planhubguy-runner.py',
    ROOT / 'mission-control' / 'scripts' / 'planhubguy-review.py',
    ROOT / 'mission-control' / 'scripts' / 'planhubguy-refresh-queues.py',
    ROOT / 'mission-control' / 'app' / 'components' / 'PlanHubGuyPanel.tsx',
]


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def prune_old_backups() -> None:
    archives = sorted(BACKUP_DIR.glob('planhubguy-state-*.tgz'), key=lambda p: p.stat().st_mtime, reverse=True)
    for archive in archives[RETENTION:]:
        archive.unlink(missing_ok=True)
        archive.with_suffix(archive.suffix + '.sha256').unlink(missing_ok=True)


def main() -> None:
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    stamp = dt.datetime.now(dt.timezone.utc).strftime('%Y%m%d-%H%M%SZ')
    archive = BACKUP_DIR / f'planhubguy-state-{stamp}.tgz'
    manifest = {
        'createdAt': dt.datetime.now(dt.timezone.utc).isoformat(),
        'root': str(ROOT),
        'files': [],
    }
    with tarfile.open(archive, 'w:gz') as tar:
        for path in INCLUDE_PATHS:
            if not path.exists():
                manifest['files'].append({'path': str(path.relative_to(ROOT)), 'missing': True})
                continue
            tar.add(path, arcname=str(path.relative_to(ROOT)))
            manifest['files'].append({'path': str(path.relative_to(ROOT)), 'size': path.stat().st_size})
        manifest_bytes = json.dumps(manifest, indent=2).encode('utf-8')
        info = tarfile.TarInfo('BACKUP-MANIFEST.json')
        info.size = len(manifest_bytes)
        info.mtime = dt.datetime.now().timestamp()
        import io
        tar.addfile(info, io.BytesIO(manifest_bytes))
    digest = sha256(archive)
    archive.with_suffix(archive.suffix + '.sha256').write_text(f'{digest}  {archive.name}\n', encoding='utf-8')
    prune_old_backups()
    print(json.dumps({'ok': True, 'archive': str(archive), 'sha256': digest, 'retention': RETENTION}))


if __name__ == '__main__':
    main()
