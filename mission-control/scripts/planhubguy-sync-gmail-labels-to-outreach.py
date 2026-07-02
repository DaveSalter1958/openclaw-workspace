#!/usr/bin/env python3
import json
from pathlib import Path

import importlib.util

try:
    from .planhubguy_labels import effective_label
except Exception:
    from mission_control.scripts.planhubguy_labels import effective_label

SCRIPT_DIR = Path(__file__).resolve().parent
RUNNER_PATH = SCRIPT_DIR / 'planhubguy-runner.py'
spec = importlib.util.spec_from_file_location('planhubguy_runner', RUNNER_PATH)
if spec is None or spec.loader is None:
    raise RuntimeError(f'Unable to load runner module from {RUNNER_PATH}')
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)  # type: ignore[attr-defined]


def label_name_map():
    payload = json.loads(runner.run('gog', 'gmail', 'labels', 'list', '-a', runner.INBOUND_ACCOUNT, '-j'))
    return {item.get('id', ''): item.get('name', '') for item in payload.get('labels', []) if item.get('id')}


def thread_label_names(thread_id: str, mapping: dict) -> set:
    names = set()
    thread = runner.thread_details(thread_id)
    for msg in (thread.get('messages', []) or []):
        for lid in (msg.get('labelIds', []) or []):
            name = mapping.get(lid, '')
            if name:
                names.add(name)
    return names


# use centralized effective_label


def ensure_header_has_gmail_label(header: list) -> list:
    if 'Gmail Label' in header:
        return header
    # Append header label; actual column creation is handled by sheet_update writes below
    return [*header, 'Gmail Label']


def pad_row(row: list, width: int) -> list:
    return (row + [''] * width)[:width]


def main():
    # Read Outreach Log
    rows = runner.sheet_get(runner.OUTREACH_RANGE)
    if not rows:
        print(json.dumps({'ok': True, 'updated': 0, 'reason': 'empty_outreach'}))
        return
    header = rows[0]
    header = ensure_header_has_gmail_label(header)
    width = max(len(header), runner.OUTREACH_WIDTH + 1)  # add Gmail Label as extra column

    mapping = label_name_map()

    # Write header if needed
    runner.sheet_update('Outreach Log!A1:L1', [header[:runner.OUTREACH_WIDTH]])
    if len(header) > runner.OUTREACH_WIDTH:
        # Write the added header cell for Gmail Label (column M)
        runner.sheet_update('Outreach Log!M1:M1', [[header[-1]]])

    updated = 0
    preview = []
    batch_size = 100
    total_rows = len(rows) - 1
    for start_idx in range(2, len(rows) + 1, batch_size):
        end_idx = min(start_idx + batch_size - 1, len(rows))
        vals = []
        for sheet_row in range(start_idx, end_idx + 1):
            row = rows[sheet_row - 1]
            r = pad_row(list(row), width)
            thread_id = (r[runner.OUTREACH_THREAD_ID] or '').strip()
            gmail_label = ''
            if thread_id:
                names = thread_label_names(thread_id, mapping)
                gmail_label = effective_label(names)
            vals.append([gmail_label])
            if gmail_label and len(preview) < 25:
                preview.append({'row': sheet_row, 'email': r[runner.OUTREACH_EMAIL], 'threadId': thread_id, 'gmailLabel': gmail_label})
            if gmail_label:
                updated += 1
        # Write this chunk to column M
        runner.sheet_update(f'Outreach Log!M{start_idx}:M{end_idx}', vals)
        runner.log({'status': 'gmail_label_sync_progress', 'range': f'M{start_idx}:M{end_idx}', 'updatedSoFar': updated, 'totalRows': total_rows})

    runner.log({'status': 'gmail_label_sync_complete', 'updatedRows': updated, 'totalRows': total_rows})
    print(json.dumps({'ok': True, 'updated': updated, 'rows': total_rows, 'preview': preview}, indent=2))


if __name__ == '__main__':
    main()
