#!/usr/bin/env python3
import json
from pathlib import Path

GAP_AUDIT = Path('/home/davesalter/.openclaw/workspace/mission-control/scripts/tmp/planhubguy-response-gap-audit.json')
OUT = Path('/home/davesalter/.openclaw/workspace/mission-control/scripts/tmp/planhubguy-missing-reply-recovery-candidates.json')


def main():
    payload = json.loads(GAP_AUDIT.read_text())
    missing = payload.get('missingSample', [])
    candidates = []
    seen = set()
    for item in missing:
        thread_id = (item.get('threadId') or '').strip()
        sender = (item.get('senderEmail') or '').strip().lower()
        subject = (item.get('subject') or '').strip()
        safe_subject = subject.replace(chr(34), '')
        query = f'newer_than:30d in:anywhere from:{sender} subject:"{safe_subject}"'
        if 'SPAM' in item.get('labels', []):
            query = f'newer_than:30d in:spam from:{sender} subject:"{safe_subject}"'
        key = (thread_id, sender, subject)
        if key in seen:
            continue
        seen.add(key)
        candidates.append({
            'messageId': item.get('id', ''),
            'threadId': thread_id,
            'senderEmail': sender,
            'subject': subject,
            'searchQuery': query,
        })
    result = {
        'candidateCount': len(candidates),
        'candidates': candidates,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(result, indent=2, default=str) + '\n')
    print(json.dumps({'candidateCount': len(candidates), 'sample': candidates[:20]}, indent=2))


if __name__ == '__main__':
    main()
