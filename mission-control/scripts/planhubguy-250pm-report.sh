#!/usr/bin/env bash
set -euo pipefail
cd /home/davesalter/.openclaw/workspace
PLANHUBGUY_REPORT_ONLY=1 python3 /home/davesalter/.openclaw/workspace/mission-control/scripts/planhubguy-runner.py >/tmp/planhubguy-250pm-report.log 2>&1 || true
python3 - <<'PY'
import json
from pathlib import Path
report_path = Path('/home/davesalter/.openclaw/workspace/mission-control/scripts/tmp/planhubguy-candidate-report-current.json')
if not report_path.exists():
    print('PlanHubGuy 2:50pm preflight report failed: candidate report file not found.')
    raise SystemExit(1)
report = json.loads(report_path.read_text())
initial = report.get('initialCandidates') or report.get('initialPreview') or []
lines = ['PlanHubGuy 2:50pm preflight report', f"Initial candidate count: {report.get('initialCount', len(initial))}", f"Follow-up candidate count: {report.get('followupCount', 0)}", '']
for idx, item in enumerate(initial, start=1):
    email = item.get('email', '')
    projects = item.get('projects', []) or []
    if not isinstance(projects, list):
        projects = [str(projects)]
    project_text = '; '.join(projects)
    lines.append(f'{idx}. {email} | {project_text}')
message = '\n'.join(lines).strip()
Path('/tmp/planhubguy-250pm-report-message.txt').write_text(message + '\n')
print(message)
PY
openclaw message send --channel telegram --target 8778247675 --message "$(cat /tmp/planhubguy-250pm-report-message.txt)" >/tmp/planhubguy-250pm-report-send.log 2>&1 || true
