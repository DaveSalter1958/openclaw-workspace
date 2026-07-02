#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path
from urllib import request
from zoneinfo import ZoneInfo

NOTION_DATABASE_ID = 'd994df82-7105-4164-882c-0642d2b946bf'
NOTION_TOKEN_PATH = Path.home() / '.config/openclaw/notion-token'
MISSION_TASKS_PATH = Path('/home/davesalter/.openclaw/workspace/second-brain/data/tasks.json')
LOCAL_TZ = ZoneInfo('America/Los_Angeles')

HEADERS = {
    'Authorization': f'Bearer {NOTION_TOKEN_PATH.read_text().strip()}',
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json',
}


def notion_api(method: str, path: str, payload: dict | None = None):
    data = None if payload is None else json.dumps(payload).encode()
    req = request.Request('https://api.notion.com/v1' + path, data=data, method=method, headers=HEADERS)
    with request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode())


def rich(prop: dict) -> str:
    return ''.join(part.get('plain_text', '') for part in prop.get('rich_text', []))


def title(prop: dict) -> str:
    return ''.join(part.get('plain_text', '') for part in prop.get('title', []))


def select_name(prop: dict) -> str:
    return (prop.get('select') or {}).get('name', '')


def status_name(prop: dict) -> str:
    return (prop.get('status') or {}).get('name', '')


def read_tasks():
    if MISSION_TASKS_PATH.exists():
        return json.loads(MISSION_TASKS_PATH.read_text())
    return []


def write_tasks(tasks):
    MISSION_TASKS_PATH.write_text(json.dumps(tasks, indent=2) + '\n')


def priority(value: str) -> str:
    if 'High' in value:
        return 'high'
    if 'Low' in value:
        return 'low'
    return 'medium'


def line_value(notes: str, prefix: str) -> str:
    for line in notes.splitlines():
        if line.startswith(prefix):
            return line[len(prefix):].strip()
    return ''


def account_from_props(props: dict, notes: str) -> tuple[str, str]:
    acct = select_name(props.get('Account', {}))
    if 'DRS' in acct or 'DRS <' in notes:
        return 'DRS', 'business'
    if 'Personal' in acct or 'Personal <' in notes:
        return 'Personal', 'personal'
    return 'Email', ''


def main():
    tasks = read_tasks()
    existing_ids = {task.get('id') for task in tasks}
    payload = {
        'page_size': 100,
        'filter': {'property': 'Source', 'select': {'equals': '📧 Email'}},
    }
    result = notion_api('POST', f'/databases/{NOTION_DATABASE_ID}/query', payload)
    added = 0
    today = datetime.now(LOCAL_TZ).date().isoformat()
    for page in result.get('results', []):
        props = page.get('properties', {})
        notes = rich(props.get('Notes', {}))
        gmail_id = rich(props.get('Gmail ID', {})) or line_value(notes, 'Gmail message ID:') or page['id']
        task_id = f"notion-email-{gmail_id}".lower().replace('@', '-').replace('.', '-').replace(' ', '-')
        task_id = re.sub(r'[^a-z0-9_-]+', '-', task_id)
        if task_id in existing_ids:
            continue
        account, scope = account_from_props(props, notes)
        task = {
            'id': task_id,
            'title': title(props.get('Task', {})) or 'Review email task',
            'status': 'done' if status_name(props.get('Status', {})) == 'Done' else 'open',
            'priority': priority(select_name(props.get('Priority', {}))),
            'domain': 'email',
            'dueDate': today,
            'dueTime': '17:00',
            'project': 'Email — DRS' if account == 'DRS' else 'Email — Personal' if account == 'Personal' else 'Email',
            'notes': notes,
            'scope': scope,
        }
        tasks.insert(0, task)
        existing_ids.add(task_id)
        added += 1
    write_tasks(tasks)
    print(f'added {added} mission_control_tasks')


if __name__ == '__main__':
    main()
