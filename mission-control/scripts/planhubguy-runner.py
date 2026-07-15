#!/usr/bin/env python3
import base64
import collections
import datetime as dt
import html
import json
import os
import random
import re
import subprocess
import tempfile
import time
import urllib.parse
import urllib.request
from dataclasses import dataclass
from email.message import EmailMessage
from email.utils import parsedate_to_datetime
from pathlib import Path
from typing import Dict, List, Optional, Set
import importlib.util
import sys

# Centralized label helpers — load robustly from the local scripts directory
SCRIPT_DIR = Path(__file__).resolve().parent
LABELS_PATH = SCRIPT_DIR / 'planhubguy_labels.py'
def _load_labels():
    spec = importlib.util.spec_from_file_location('planhubguy_labels', str(LABELS_PATH))
    if spec is None or spec.loader is None:
        raise RuntimeError(f'Unable to load labels module from {LABELS_PATH}')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)  # type: ignore[attr-defined]
    return module

_labels = _load_labels()
LABEL_FOLLOW_UP = _labels.LABEL_FOLLOW_UP
LABEL_AUTOMATIC_REPLY = _labels.LABEL_AUTOMATIC_REPLY
LABEL_BAD_EMAIL = _labels.LABEL_BAD_EMAIL
LABEL_RESPONDED = _labels.LABEL_RESPONDED
LABEL_POSSIBLE_WORK = _labels.LABEL_POSSIBLE_WORK
effective_label = _labels.effective_label
response_type_to_label_and_removals = _labels.response_type_to_label_and_removals
verify_labels_exist = _labels.verify_labels_exist
_effective_label = effective_label

WORKBOOK_ID = '1AJ5p4YHb3T1PtfFW8CFulVK1cHcDZT7cqrTxoo3An7s'
PLANHUBGUY_ACCOUNT = 'Dave@DRS-Engineering.net'
SHEETS_ACCOUNT = os.environ.get('PLANHUBGUY_SHEETS_ACCOUNT', PLANHUBGUY_ACCOUNT)
SEND_ACCOUNT = PLANHUBGUY_ACCOUNT
INBOUND_ACCOUNT = PLANHUBGUY_ACCOUNT
SEND_AS = PLANHUBGUY_ACCOUNT
NOTIFY_TO = PLANHUBGUY_ACCOUNT
SIGNATURE_SOURCE_ACCOUNT = PLANHUBGUY_ACCOUNT
SIGNATURE_SOURCE_EMAIL = PLANHUBGUY_ACCOUNT
DEDICATED_RESPONSE_MAILBOX = True
INTERNAL_SENDERS = {
    'dave@drs-engineering.net',
    'drs@drs-engineering.net',
    'luke@drs-engineering.net',
}
HARDCODED_DO_NOT_CONTACT_EMAILS = {
    'john@labibfunk.com',
    'info@labibfunk.com',
}
GMAIL_DAILY_SEND_LIMIT = 495
GMAIL_DAILY_SEND_WINDOW_HOURS = 24
STATE_FILE = Path('/home/davesalter/.openclaw/workspace/memory/planhubguy-state.json')
LOG_FILE = Path('/home/davesalter/.openclaw/workspace/memory/planhubguy-log.jsonl')
TEMPLATES_FILE = Path('/home/davesalter/.openclaw/workspace/mission-control/data/planhubguy-templates.json')
SIGNATURE_LOGO_FILE = Path('/home/davesalter/.openclaw/workspace/mission-control/data/planhubguy/DRS_Email_Logo.png')
LEGACY_SIGNATURE_LOGO_FILE = Path('/home/davesalter/.openclaw/workspace/mission-control/data/planhubguy/DRS_Email_Signature.jpg')
SIGNATURE_CID = 'drs-email-signature'
TEST_BATCH_LIMIT = 10
TEST_EMAIL_SAMPLE_LIMIT = 5
LIVE_BATCH_LIMIT = 25
OUTREACH_RANGE = 'Outreach Log!A1:L12000'
RESPONSE_RANGE = 'Response Log!A1:I12000'
PLANHUB_RANGE = 'PlanHub Leads!A1:U7000'
EXCAVATION_RANGE = 'Excavation Review!A1:F7000'

BOUNCE_MARKERS = [
    'mailer-daemon', 'postmaster', 'delivery status notification', 'delivery failure',
    'undeliverable', 'returned mail', 'delivery incomplete', 'failure notice', 'address not found',
    'message blocked', 'recipient address rejected'
]
AUTO_REPLY_MARKERS = [
    'out of office', 'out of the office', 'out-of-office', 'ooo',
    'automatic reply', 'auto reply', 'autoreply', 'auto-reply',
    'vacation', 'away from the office', 'currently away', 'currently unavailable',
    'will be out', 'i will be out', 'return to the office', 'returning to the office',
    'during my absence', 'in my absence', 'limited access to email', 'limited email access',
    'not checking email', 'will return on', 'will be returning',
]
POSSIBLE_WORK_MARKERS = [
    'proposal', 'quote', 'estimate', 'fee proposal', 'pricing', 'budget', 'scope of work',
    'can you help', 'can drs help', 'would like to discuss', 'like to discuss',
    'interested in working', 'interested in using', 'need an engineer', 'need engineering',
    'need shoring', 'need retaining', 'need foundation', 'earth retention', 'retaining wall',
    'soldier pile', 'tieback', 'micropile', 'caisson', 'shoring', 'specialty foundation',
    'new project', 'upcoming project', 'project coming up', 'project we are working on',
    'are you available', 'availability', 'rfp', 'rfq', 'request for proposal',
    'please call', 'give me a call', 'schedule a call', 'set up a call', 'meeting',
    'engage drs', 'hire drs', 'retain drs', 'work with drs',
]
NO_WORK_MARKERS = [
    'not interested', 'not at this time', 'no need', 'not needed', 'already awarded',
    'already selected', 'we selected', 'not involved', 'wrong person', 'unsubscribe',
]

OUTREACH_EMAIL = 0
OUTREACH_TITLE = 1
OUTREACH_DATE_SENT = 2
OUTREACH_TEMPLATE = 3
OUTREACH_PROJECTS = 4
OUTREACH_RESPONSE_DATE = 5
OUTREACH_RESPONSE_EMAIL = 6
OUTREACH_NOTES = 7
OUTREACH_STATUS = 8
OUTREACH_STAGE = 9
OUTREACH_MESSAGE_ID = 10
OUTREACH_THREAD_ID = 11
OUTREACH_WIDTH = 12

RESPONSE_EMAIL = 0
RESPONSE_RECEIVED_DATE = 1
RESPONSE_TYPE = 2
RESPONSE_THREAD_ID = 3
RESPONSE_SENDER = 4
RESPONSE_SUBJECT = 5
RESPONSE_SNIPPET = 6
RESPONSE_PROJECTS = 7
RESPONSE_NOTES = 8


@dataclass
class ContactProjects:
    email: str
    title: str
    first_name: str
    last_name: str
    company_name: str
    projects: List[str]


@dataclass
class OutreachRecord:
    email: str
    title: str = ''
    date_sent: str = ''
    template_used: str = ''
    projects_referenced: str = ''
    response_date: str = ''
    response_email: str = ''
    notes: str = ''
    campaign_status: str = ''
    follow_up_stage: str = ''
    message_id: str = ''
    thread_id: str = ''

    @classmethod
    def from_row(cls, row: List[str]):
        padded = list((row + [''] * OUTREACH_WIDTH)[:OUTREACH_WIDTH])
        return cls(
            email=str(padded[OUTREACH_EMAIL]).strip().lower(),
            title=str(padded[OUTREACH_TITLE]).strip(),
            date_sent=str(padded[OUTREACH_DATE_SENT]).strip(),
            template_used=str(padded[OUTREACH_TEMPLATE]).strip(),
            projects_referenced=str(padded[OUTREACH_PROJECTS]).strip(),
            response_date=str(padded[OUTREACH_RESPONSE_DATE]).strip(),
            response_email=str(padded[OUTREACH_RESPONSE_EMAIL]).strip(),
            notes=str(padded[OUTREACH_NOTES]).strip(),
            campaign_status=str(padded[OUTREACH_STATUS]).strip(),
            follow_up_stage=str(padded[OUTREACH_STAGE]).strip(),
            message_id=str(padded[OUTREACH_MESSAGE_ID]).strip(),
            thread_id=str(padded[OUTREACH_THREAD_ID]).strip(),
        )

    def to_row(self) -> List[str]:
        return [
            self.email.strip().lower(),
            self.title.strip(),
            self.date_sent.strip(),
            self.template_used.strip(),
            self.projects_referenced.strip(),
            self.response_date.strip(),
            self.response_email.strip(),
            self.notes.strip(),
            self.campaign_status.strip(),
            self.follow_up_stage.strip(),
            self.message_id.strip(),
            self.thread_id.strip(),
        ]

    def project_list(self) -> List[str]:
        return [p.strip() for p in self.projects_referenced.split('|') if p.strip()]


@dataclass
class ProcessContext:
    state: dict
    now: dt.datetime
    templates: dict
    contact_profiles: dict
    excavation_confidence: dict
    unique_map_all: Dict[str, ContactProjects]
    unique_map_allowed: Dict[str, ContactProjects]
    outreach_rows: List[List[str]]
    outreach_records: List[OutreachRecord]


def run(*args):
    env = {**os.environ, 'GOG_KEYRING_PASSWORD': os.environ.get('GOG_KEYRING_PASSWORD', '')}
    proc = subprocess.run(list(args), text=True, capture_output=True, env=env)
    if proc.returncode != 0:
        raise subprocess.CalledProcessError(proc.returncode, args, output=proc.stdout, stderr=proc.stderr)
    return proc.stdout


def log(event):
    LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    with LOG_FILE.open('a', encoding='utf-8') as f:
        f.write(json.dumps({'at': dt.datetime.now().isoformat(), **event}) + '\n')


def sheet_get(rng, retries=3):
    last_error = None
    for attempt in range(retries):
        try:
            return json.loads(run('gog', 'sheets', 'get', WORKBOOK_ID, rng, '-a', SHEETS_ACCOUNT, '-j', '--results-only'))
        except Exception as exc:
            last_error = exc
            if attempt < retries - 1:
                time.sleep(2 * (attempt + 1))
            else:
                raise last_error


def sheet_update(rng, values, mode='RAW'):
    payload = json.dumps(values)
    last_error = None
    for attempt in range(3):
        try:
            return run('gog', 'sheets', 'update', WORKBOOK_ID, rng, '-a', SHEETS_ACCOUNT, '--input', mode, f'--values-json={payload}')
        except Exception as exc:
            last_error = exc
            log({'status': 'sheet_update_failed_retrying', 'range': rng, 'attempt': attempt + 1, 'error': str(exc)})
            if attempt < 2:
                time.sleep(2 * (attempt + 1))
    raise last_error


def sheet_append(rng, values, mode='RAW'):
    chunk_size = 100
    for i in range(0, len(values), chunk_size):
        payload = json.dumps(values[i:i + chunk_size])
        last_error = None
        for attempt in range(3):
            try:
                run('gog', 'sheets', 'append', WORKBOOK_ID, rng, '-a', SHEETS_ACCOUNT, '--input', mode, f'--values-json={payload}')
                last_error = None
                break
            except Exception as exc:
                last_error = exc
                log({'status': 'sheet_append_failed_retrying', 'range': rng, 'attempt': attempt + 1, 'error': str(exc)})
                if attempt < 2:
                    time.sleep(2 * (attempt + 1))
        if last_error is not None:
            raise last_error


def prune_send_window(state, now=None):
    now = now or dt.datetime.now()
    cutoff = now - dt.timedelta(hours=GMAIL_DAILY_SEND_WINDOW_HOURS)
    history = []
    for item in state.get('recentSendTimestamps', []) or []:
        try:
            stamp = dt.datetime.fromisoformat(str(item))
        except Exception:
            continue
        if stamp >= cutoff:
            history.append(stamp.isoformat())
    state['recentSendTimestamps'] = history
    return history


def remaining_send_capacity(state, now=None):
    history = prune_send_window(state, now=now)
    return max(0, GMAIL_DAILY_SEND_LIMIT - len(history))


def record_send(state, count=1, now=None):
    now = now or dt.datetime.now()
    history = prune_send_window(state, now=now)
    for _ in range(max(0, count)):
        history.append(now.isoformat())
    state['recentSendTimestamps'] = history
    save_state(state)
    return len(history)


def enforce_send_capacity(state, required=1):
    remaining = remaining_send_capacity(state)
    if remaining < required:
        raise RuntimeError(f'PlanHubGuy send cap reached: {GMAIL_DAILY_SEND_LIMIT} emails in rolling {GMAIL_DAILY_SEND_WINDOW_HOURS}h window, remaining {remaining}')
    return remaining


def load_state():
    try:
        state = json.loads(STATE_FILE.read_text())
    except Exception:
        state = {'enabled': False, 'mode': 'test'}
    state.setdefault('seenInboundThreads', [])
    state['mode'] = 'live' if state.get('mode') == 'live' else 'test'
    prune_send_window(state)
    return state


def save_state(state):
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile('w', encoding='utf-8', dir=str(STATE_FILE.parent), prefix=f'{STATE_FILE.name}.', suffix='.tmp', delete=False) as tmp:
        json.dump(state, tmp, indent=2)
        tmp.write('\n')
        tmp_path = Path(tmp.name)
    os.replace(tmp_path, STATE_FILE)


def set_stage(state, stage, detail=''):
    state['currentStage'] = stage
    state['currentStageDetail'] = detail
    state['stageUpdatedAt'] = dt.datetime.now().isoformat()
    save_state(state)


def extract_email(text):
    m = re.search(r'<([^>]+@[^>]+)>', text or '')
    if m:
        return m.group(1).strip().lower()
    m = re.search(r'([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})', text or '', re.I)
    return m.group(1).lower() if m else ''


def get_header(headers, name):
    for h in headers or []:
        if (h.get('name') or '').lower() == name.lower():
            return h.get('value', '')
    return ''


def normalize_project_name(project: str) -> str:
    return re.sub(r'\s+', ' ', (project or '').strip()).lower()


def normalize_project_key(project: str) -> str:
    value = normalize_project_name(project)
    return re.sub(r'^regarding\s+', '', value).strip()


def project_tuple_key(projects: List[str]) -> tuple:
    return tuple(sorted(normalize_project_key(project) for project in projects if normalize_project_key(project)))


def parse_linkage_note(notes: str):
    text = notes or ''
    m = re.search(r'linkage:subject=([^;|]+);email=([^;|\s]+)', text, re.I)
    if not m:
        return {'subject': '', 'email': ''}
    return {
        'subject': normalize_subject(m.group(1).strip()),
        'email': m.group(2).strip().lower(),
    }


def normalize_subject(subject):
    value = (subject or '').strip().lower()
    while True:
        new_value = re.sub(r'^(re|fw|fwd):\s*', '', value).strip()
        if new_value == value:
            break
        value = new_value
    value = re.sub(r'^(undeliverable:\s*)', '', value)
    value = re.sub(r'^delivery status notification \(failure\)\s*', '', value)
    value = re.sub(r'\s+', ' ', value)
    return value


def looks_like_email(value):
    text = (value or '').strip()
    return bool(re.fullmatch(r'[^@\s]+@[^@\s]+\.[^@\s]+', text))


def load_templates():
    return json.loads(TEMPLATES_FILE.read_text(encoding='utf-8'))


def load_outreach_rows():
    try:
        return sheet_get(OUTREACH_RANGE)
    except Exception:
        return []


def load_outreach_records():
    rows = load_outreach_rows()
    return rows, [OutreachRecord.from_row(row) for row in rows[1:]] if rows else []


def load_response_rows():
    try:
        return sheet_get(RESPONSE_RANGE)
    except Exception:
        return []


def infer_excavation_review(description):
    text = (description or '').lower()
    high_terms = ['basement', 'below grade', 'below-grade', 'earth retention', 'retaining wall', 'shoring', 'soil nail', 'tieback', 'caisson', 'excavation', 'podium parking', 'subterranean', 'underground parking']
    medium_terms = ['podium', 'parking level', 'hillside', 'slope', 'grading', 'foundation', 'multi-story']
    reasons = []
    for term in high_terms:
        if term in text:
            reasons.append(term)
    if reasons:
        return ('Yes', 'High', ', '.join(sorted(set(reasons))))
    medium_hits = []
    for term in medium_terms:
        if term in text:
            medium_hits.append(term)
    if medium_hits:
        return ('Maybe', 'Medium', ', '.join(sorted(set(medium_hits))))
    return ('No', 'Low', 'no explicit below-grade indicators')


def load_excavation_confidence():
    result = {}
    try:
        vals = sheet_get(EXCAVATION_RANGE)
    except Exception:
        return result
    for row in vals[1:]:
        project = (row[0] if len(row) > 0 else '').strip()
        confidence = (row[3] if len(row) > 3 else '').strip()
        if project and confidence and project not in result:
            result[project] = confidence
    return result


def sync_excavation_review_from_planhub_leads(existing_confidence):
    try:
        vals = sheet_get(PLANHUB_RANGE)
    except Exception as exc:
        log({'status': 'excavation_review_sync_failed', 'error': str(exc)})
        return existing_confidence
    if not vals:
        return existing_confidence
    header = vals[0]
    index = {name: i for i, name in enumerate(header)}
    new_rows = []
    updated = dict(existing_confidence)
    seen = set(existing_confidence.keys())
    for row in vals[1:]:
        project = (row[index.get('projectName', -1)] if index.get('projectName', -1) >= 0 and len(row) > index.get('projectName', -1) else '').strip()
        description = (row[index.get('projectDescription', -1)] if index.get('projectDescription', -1) >= 0 and len(row) > index.get('projectDescription', -1) else '').strip()
        if not project or project in seen:
            continue
        likely, confidence, reasons = infer_excavation_review(description)
        new_rows.append([project, description, likely, confidence, reasons])
        updated[project] = confidence
        seen.add(project)
    if new_rows:
        sheet_append('Excavation Review!A:E', new_rows)
        log({'status': 'excavation_review_sync_written', 'added': len(new_rows)})
    else:
        log({'status': 'excavation_review_sync_written', 'added': 0})
    return updated


def load_contact_profiles():
    result = {}
    try:
        vals = sheet_get(PLANHUB_RANGE)
    except Exception:
        return result
    if not vals:
        return result
    header = vals[0]
    index = {name: i for i, name in enumerate(header)}
    for row in vals[1:]:
        email = (row[index.get('contactEmail', -1)] if index.get('contactEmail', -1) >= 0 and len(row) > index.get('contactEmail', -1) else '').strip().lower()
        if not email:
            continue
        first_name = (row[index.get('contactFirstName', -1)] if index.get('contactFirstName', -1) >= 0 and len(row) > index.get('contactFirstName', -1) else '').strip()
        last_name = (row[index.get('contactLastName', -1)] if index.get('contactLastName', -1) >= 0 and len(row) > index.get('contactLastName', -1) else '').strip()
        title = (row[index.get('contactTitle', -1)] if index.get('contactTitle', -1) >= 0 and len(row) > index.get('contactTitle', -1) else '').strip()
        company = (row[index.get('companyName', -1)] if index.get('companyName', -1) >= 0 and len(row) > index.get('companyName', -1) else '').strip()
        if email not in result:
            result[email] = {'firstName': first_name, 'lastName': last_name, 'title': title, 'companyName': company}
        else:
            if first_name and not result[email].get('firstName'):
                result[email]['firstName'] = first_name
            if last_name and not result[email].get('lastName'):
                result[email]['lastName'] = last_name
            if title and not result[email].get('title'):
                result[email]['title'] = title
            if company and not result[email].get('companyName'):
                result[email]['companyName'] = company
    return result


def build_unique_email_projects_from_planhub_leads(contact_profiles, excavation_confidence, allowed_confidence):
    result: Dict[str, ContactProjects] = {}
    try:
        vals = sheet_get(PLANHUB_RANGE)
    except Exception:
        return result
    if not vals:
        return result
    header = vals[0]
    index = {name: i for i, name in enumerate(header)}
    for row in vals[1:]:
        raw_email = (row[index.get('contactEmail', -1)] if index.get('contactEmail', -1) >= 0 and len(row) > index.get('contactEmail', -1) else '').strip()
        email = raw_email.lower()
        if not looks_like_email(email):
            continue
        project = (row[index.get('projectName', -1)] if index.get('projectName', -1) >= 0 and len(row) > index.get('projectName', -1) else '').strip()
        if not project or excavation_confidence.get(project, 'Low') not in allowed_confidence:
            continue
        profile = contact_profiles.get(email, {})
        if email not in result:
            result[email] = ContactProjects(
                email=email,
                title=profile.get('title', '') or ((row[index.get('contactTitle', -1)] if index.get('contactTitle', -1) >= 0 and len(row) > index.get('contactTitle', -1) else '').strip()),
                first_name=profile.get('firstName', ''),
                last_name=profile.get('lastName', ''),
                company_name=profile.get('companyName', ''),
                projects=[]
            )
        if project not in result[email].projects:
            result[email].projects.append(project)
    return result


def build_outreach_history(records: List[OutreachRecord]) -> Dict[str, Set[str]]:
    hist = collections.defaultdict(set)
    for rec in records:
        if rec.email and rec.projects_referenced:
            for project in rec.project_list():
                hist[rec.email].add(normalize_project_key(project))
    return hist


def build_followup_history(records: List[OutreachRecord]) -> Set[tuple]:
    hist = set()
    for rec in records:
        projects_key = project_tuple_key(rec.project_list())
        if not rec.email or not projects_key:
            continue
        stage = (rec.follow_up_stage or '').strip()
        template = (rec.template_used or '').strip()
        if stage == 'FollowUp1' or template == 'template2':
            hist.add((rec.email, projects_key, 'FollowUp1'))
        if stage == 'FinalFollowUp' or template == 'template3':
            hist.add((rec.email, projects_key, 'FinalFollowUp'))
    return hist


def build_response_history(rows) -> Dict[str, Set[str]]:
    hist = collections.defaultdict(set)
    for row in rows[1:] if rows else []:
        response_type = (row[RESPONSE_TYPE] if len(row) > RESPONSE_TYPE else '').strip().lower()
        if response_type != 'valid':
            continue
        email = (row[RESPONSE_EMAIL] if len(row) > RESPONSE_EMAIL else '').strip().lower()
        if not email or email in INTERNAL_SENDERS:
            continue
        projects_value = (row[RESPONSE_PROJECTS] if len(row) > RESPONSE_PROJECTS else '').strip()
        if not projects_value:
            continue
        for project in [p.strip() for p in projects_value.split('|') if p.strip()]:
            hist[email].add(normalize_project_key(project))
    return hist


_SENT_PROJECT_CACHE = {}


def project_seen_in_sent_mailbox(email: str, project: str, max_age_days: int = 365) -> bool:
    email = (email or '').strip().lower()
    project = (project or '').strip()
    if not email or not project:
        return False
    cache_key = (email, normalize_project_key(project), max_age_days)
    if cache_key in _SENT_PROJECT_CACHE:
        return _SENT_PROJECT_CACHE[cache_key]
    safe_subject = f'Regarding {project}'.replace('"', '')
    queries = [
        f'newer_than:{max_age_days}d in:sent to:{email} subject:"{safe_subject}"',
        f'in:sent to:{email} subject:"{safe_subject}"',
    ]
    accounts = [SEND_ACCOUNT, INBOUND_ACCOUNT]
    for account in accounts:
        for query in queries:
            try:
                payload = json.loads(run('gog', 'gmail', 'messages', 'search', query, '-a', account, '-j', '--all', '--max', '5'))
            except Exception as exc:
                log({'status': 'sent_project_search_failed', 'email': email, 'project': project, 'account': account, 'query': query, 'error': str(exc)})
                continue
            if payload.get('messages'):
                log({'status': 'duplicate_initial_suppressed_by_sent_mailbox', 'email': email, 'project': project, 'account': account, 'query': query})
                _SENT_PROJECT_CACHE[cache_key] = True
                return True
    _SENT_PROJECT_CACHE[cache_key] = False
    return False


_SENT_FOLLOWUP_CACHE = {}


def followup_seen_in_sent_mailbox(email: str, subject: str, max_age_days: int = 365) -> bool:
    email = (email or '').strip().lower()
    subject = (subject or '').strip()
    if not email or not subject:
        return False
    cache_key = (email, normalize_subject(subject), max_age_days)
    if cache_key in _SENT_FOLLOWUP_CACHE:
        return _SENT_FOLLOWUP_CACHE[cache_key]
    safe_subject = subject.replace('"', '')
    queries = [
        f'newer_than:{max_age_days}d in:sent to:{email} subject:"{safe_subject}"',
        f'in:sent to:{email} subject:"{safe_subject}"',
    ]
    for account in [SEND_ACCOUNT, INBOUND_ACCOUNT]:
        for query in queries:
            try:
                payload = json.loads(run('gog', 'gmail', 'messages', 'search', query, '-a', account, '-j', '--all', '--max', '5'))
            except Exception as exc:
                log({'status': 'sent_followup_search_failed', 'email': email, 'subject': subject, 'account': account, 'query': query, 'error': str(exc)})
                continue
            if payload.get('messages'):
                log({'status': 'duplicate_followup_suppressed_by_sent_mailbox', 'email': email, 'subject': subject, 'account': account, 'query': query})
                _SENT_FOLLOWUP_CACHE[cache_key] = True
                return True
    _SENT_FOLLOWUP_CACHE[cache_key] = False
    return False


def build_outreach_indexes(records: List[OutreachRecord]):
    by_thread = {}
    by_subject = collections.defaultdict(list)
    by_email = collections.defaultdict(list)
    by_linkage = {}
    for idx, rec in enumerate(records, start=2):
        subject = normalize_subject(f"Regarding {rec.project_list()[0]}") if rec.project_list() else ''
        linkage = parse_linkage_note(rec.notes)
        linkage_subject = linkage.get('subject', '') or subject
        linkage_email = linkage.get('email', '') or rec.email
        record = {
            'rowIndex': idx,
            'email': rec.email,
            'projects': rec.projects_referenced,
            'threadId': rec.thread_id,
            'subject': subject,
            'linkageSubject': linkage_subject,
            'linkageEmail': linkage_email,
        }
        if rec.thread_id:
            by_thread[rec.thread_id] = record
        if subject:
            by_subject[subject].append(record)
        if rec.email:
            by_email[rec.email].append(record)
        if linkage_subject and linkage_email:
            by_linkage[(linkage_subject, linkage_email)] = record
    return {'by_thread': by_thread, 'by_subject': by_subject, 'by_email': by_email, 'by_linkage': by_linkage}


def candidate_limit(state):
    if state['mode'] == 'test':
        configured = int(state.get('testBatchLimit', TEST_BATCH_LIMIT) or TEST_BATCH_LIMIT)
    else:
        configured = None
        env_limit = os.environ.get('PLANHUBGUY_LIVE_BATCH_LIMIT', '').strip()
        if env_limit:
            try:
                value = int(env_limit)
                if value > 0:
                    configured = value
            except Exception:
                log({'status': 'invalid_live_batch_limit_env', 'value': env_limit})
        if configured is None:
            state_limit = state.get('liveBatchLimit')
            if state_limit not in (None, ''):
                try:
                    value = int(state_limit)
                    if value > 0:
                        configured = value
                except Exception:
                    log({'status': 'invalid_live_batch_limit_state', 'value': state_limit})
        if configured is None:
            configured = LIVE_BATCH_LIMIT
    remaining = remaining_send_capacity(state)
    if os.environ.get('PLANHUBGUY_SCHEDULED_SEND') and configured > LIVE_BATCH_LIMIT:
        log({'status': 'scheduled_live_batch_limit_capped', 'configured': configured, 'effective': LIVE_BATCH_LIMIT})
        configured = LIVE_BATCH_LIMIT
    effective = min(configured, remaining)
    if effective < configured:
        log({'status': 'candidate_limit_capped_by_gmail_window', 'configured': configured, 'remaining': remaining, 'effective': effective})
    return effective


def format_project_phrase(projects):
    clean = [p.strip() for p in projects if p and p.strip()]
    if not clean:
        return 'this project'
    if len(clean) == 1:
        return clean[0]
    if len(clean) == 2:
        return f'{clean[0]} and {clean[1]}'
    if len(clean) == 3:
        return f'{clean[0]}, {clean[1]}, and {clean[2]}'
    return f'{clean[0]}, {clean[1]}, and {len(clean) - 2} other projects'


def apply_greeting(template_text, greeting_value):
    if greeting_value and greeting_value.lower() not in {'there', 'team', 'hello'}:
        return template_text.replace('{{ contact.firstname }}', greeting_value)
    return re.sub(r'Dear\s+\{\{\s*contact\.firstname\s*\}\},', 'Hello there,', template_text)


def apply_project_pluralization(template_text, project_count):
    if project_count > 1:
        text = template_text.replace('this project', 'these projects')
        text = text.replace('this or any other projects', 'these or any other projects')
        return text
    return template_text


def image_data_uri(path):
    if not path.exists():
        return ''
    mime = 'image/jpeg' if path.suffix.lower() in {'.jpg', '.jpeg'} else 'image/png'
    data = base64.b64encode(path.read_bytes()).decode('ascii')
    return f'data:{mime};base64,{data}'


_SIGNATURE_HTML_CACHE = None
_PROFILE_EMAIL_CACHE = {}
LEGACY_DRS_OUTBOUND_ACCOUNT = os.environ.get('PLANHUBGUY_LEGACY_DRS_OUTBOUND_ACCOUNT', '').strip()
INTERNAL_DRS_RECIPIENT = 'drs@drs-engineering.net'
INTERNAL_DRS_SEND_AS = 'DRS@drs-engineering.net'


def load_signature_html(account=SIGNATURE_SOURCE_ACCOUNT, send_as=SIGNATURE_SOURCE_EMAIL):
    global _SIGNATURE_HTML_CACHE
    if _SIGNATURE_HTML_CACHE is not None:
        return _SIGNATURE_HTML_CACHE
    try:
        payload = json.loads(run('gog', 'gmail', 'settings', 'sendas', 'get', send_as, '-a', account, '-j', '--results-only'))
        _SIGNATURE_HTML_CACHE = payload.get('signature', '') or ''
    except Exception:
        _SIGNATURE_HTML_CACHE = ''
    return _SIGNATURE_HTML_CACHE


def signature_logo_path():
    if SIGNATURE_LOGO_FILE.exists():
        return SIGNATURE_LOGO_FILE
    if LEGACY_SIGNATURE_LOGO_FILE.exists():
        return LEGACY_SIGNATURE_LOGO_FILE
    return None


def render_signature_html(inline_cid: str = SIGNATURE_CID):
    try:
        if signature_logo_path():
            # Render text as HTML so Gmail keeps it crisp; use the image only for the DRS logo.
            return (
                '<div style="margin:12px 0 0 0; padding:0; text-align:left; '
                'font-family:Arial,Helvetica,sans-serif; font-size:13px; line-height:1.35; color:#111;">'
                '<div style="margin:0 0 8px 0; padding:0; font-weight:700; font-style:italic;">'
                'Dave Salter BSc. PhD PE<br>Founder and Principal'
                '</div>'
                f'<img src="cid:{inline_cid}" alt="DRS Engineering Inc." width="102" '
                'style="display:block; width:102px; height:auto; margin:0 0 8px 0; padding:0; border:0; outline:none; text-decoration:none;"/>'
                '<div style="margin:0 0 12px 0; padding:0;">'
                'DRS@DRS-Engineering.net<br>'
                'Office:&nbsp;&nbsp;&nbsp;&nbsp;(818) 402-3962<br>'
                'Cell:&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(310) 699-1274'
                '</div>'
                '<div style="margin:0; padding:0; font-weight:700;">'
                'Los Angeles, Santa Barbara, San Luis Obispo,<br>'
                'Vancouver, Grand Rapids'
                '</div>'
                '</div>'
            )
    except Exception:
        pass
    # Fallback to Gmail SendAs signature HTML if logo file missing
    return load_signature_html()


def html_to_plain_text(html_body):
    text = re.sub(r'<br\s*/?>', '\n', html_body, flags=re.I)
    text = re.sub(r'</p\s*>', '\n\n', text, flags=re.I)
    text = re.sub(r'<[^>]+>', '', text)
    text = html.unescape(text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


def gmail_access_token(account=SEND_ACCOUNT):
    creds_path = Path.home() / '.config' / 'gogcli' / 'credentials.json'
    creds = json.loads(creds_path.read_text(encoding='utf-8'))
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(prefix='gog-token-', suffix='.json', delete=False) as tmp:
            tmp_path = Path(tmp.name)
        run('gog', 'auth', 'tokens', 'export', account, '--out', str(tmp_path), '--overwrite')
        token_payload = json.loads(tmp_path.read_text(encoding='utf-8'))
        form = urllib.parse.urlencode({
            'client_id': creds['client_id'],
            'client_secret': creds['client_secret'],
            'refresh_token': token_payload['refresh_token'],
            'grant_type': 'refresh_token',
        }).encode('utf-8')
        req = urllib.request.Request('https://oauth2.googleapis.com/token', data=form, headers={'Content-Type': 'application/x-www-form-urlencoded'})
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode('utf-8'))['access_token']
    finally:
        if tmp_path and tmp_path.exists():
            tmp_path.unlink()


def gmail_profile_email(account=SEND_ACCOUNT):
    key = (account or '').strip().lower()
    cached = _PROFILE_EMAIL_CACHE.get(key)
    if cached:
        return cached
    token = gmail_access_token(account)
    req = urllib.request.Request(
        'https://gmail.googleapis.com/gmail/v1/users/me/profile',
        headers={'Authorization': f'Bearer {token}'},
        method='GET',
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        payload = json.loads(resp.read().decode('utf-8'))
    email = (payload.get('emailAddress') or '').strip().lower()
    _PROFILE_EMAIL_CACHE[key] = email
    return email


def assert_live_sender_account_matches_from():
    actual = gmail_profile_email(SEND_ACCOUNT)
    expected = SEND_AS.strip().lower()
    if actual != expected:
        log({'status': 'live_send_blocked_sender_account_mismatch', 'sendAccount': SEND_ACCOUNT, 'authenticatedAs': actual, 'from': SEND_AS})
        raise RuntimeError(f'Live send blocked: authenticated Gmail account {actual} does not match configured From address {expected}')
    return actual


def sent_message_exists_in_account(account, message_id_header):
    clean = (message_id_header or '').strip().strip('<>')
    if not clean:
        return False
    query = f'in:sent rfc822msgid:{clean}'
    payload = json.loads(run('gog', 'gmail', 'messages', 'search', query, '-a', account, '-j', '--all', '--max', '5'))
    return bool(payload.get('messages'))


def assert_no_legacy_drs_send_leak(message_id_header, recipient):
    if not LEGACY_DRS_OUTBOUND_ACCOUNT:
        return
    if LEGACY_DRS_OUTBOUND_ACCOUNT.strip().lower() == SEND_ACCOUNT.strip().lower():
        return
    try:
        leaked = sent_message_exists_in_account(LEGACY_DRS_OUTBOUND_ACCOUNT, message_id_header)
    except Exception as exc:
        log({'status': 'legacy_drs_leak_check_skipped', 'recipient': recipient, 'messageId': message_id_header, 'legacyAccount': LEGACY_DRS_OUTBOUND_ACCOUNT, 'error': str(exc)})
        return
    if leaked:
        log({'status': 'live_send_blocked_legacy_drs_leak', 'recipient': recipient, 'messageId': message_id_header, 'legacyAccount': LEGACY_DRS_OUTBOUND_ACCOUNT})
        raise RuntimeError(f'Live send blocked: message also appeared in {LEGACY_DRS_OUTBOUND_ACCOUNT} sent mail, which would route bounces there')


def gmail_message_context(message_id, account=SEND_ACCOUNT):
    payload = json.loads(run('gog', 'gmail', 'get', message_id, '-a', account, '-j'))
    message = payload.get('message', {})
    headers = message.get('payload', {}).get('headers', [])
    return {
        'threadId': message.get('threadId', ''),
        'messageIdHeader': get_header(headers, 'Message-ID'),
        'references': get_header(headers, 'References'),
    }


def outbound_email_hold_enabled():
    try:
        return bool(load_state().get('externalEmailHold', False))
    except Exception:
        return True


EMAIL_ADDRESS_RE = re.compile(r'([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})', re.I)


def extract_recipient_addresses(*values):
    recipients = []
    for value in values:
        recipients.extend(addr.strip().lower() for addr in EMAIL_ADDRESS_RE.findall(value or ''))
    return recipients


def configured_do_not_contact_emails():
    blocked = set(HARDCODED_DO_NOT_CONTACT_EMAILS)
    try:
        state = load_state()
    except Exception:
        state = {}
    for key in ('doNotContactEmails', 'blockedRecipients', 'neverSendEmails'):
        value = state.get(key) if isinstance(state, dict) else None
        if isinstance(value, str):
            blocked.update(extract_recipient_addresses(value))
        elif isinstance(value, list):
            for item in value:
                if isinstance(item, str):
                    blocked.update(extract_recipient_addresses(item))
                elif isinstance(item, dict):
                    blocked.update(extract_recipient_addresses(item.get('email') or item.get('address') or ''))
    return blocked


def recipient_is_do_not_contact(email):
    return (email or '').strip().lower() in configured_do_not_contact_emails()


def assert_recipient_not_do_not_contact(to='', cc=''):
    blocked = sorted(set(extract_recipient_addresses(to, cc)) & configured_do_not_contact_emails())
    if blocked:
        log({'status': 'send_blocked_do_not_contact', 'recipients': blocked})
        raise RuntimeError(f'PlanHubGuy do-not-contact recipient blocked: {", ".join(blocked)}')


def is_internal_recipient(email):
    email = (email or '').strip().lower()
    return email.endswith('@drs-engineering.net')


def assert_external_email_allowed(to='', cc=''):
    assert_recipient_not_do_not_contact(to, cc)
    if not outbound_email_hold_enabled():
        return
    recipients = extract_recipient_addresses(to, cc)
    external = [addr for addr in recipients if not is_internal_recipient(addr)]
    if external:
        raise RuntimeError(f'External email blocked by Dave hold: {", ".join(sorted(set(external)))}')


def internal_delivery_identity(to, account, send_from):
    recipient = (to or '').strip().lower()
    active_account = (account or '').strip().lower()
    active_from = (send_from or '').strip().lower()
    if LEGACY_DRS_OUTBOUND_ACCOUNT and recipient == INTERNAL_DRS_RECIPIENT and active_account == SEND_ACCOUNT.lower() and active_from == SEND_AS.lower():
        log({'status': 'internal_drs_reroute', 'to': to, 'from': send_from, 'account': account, 'reroutedAccount': LEGACY_DRS_OUTBOUND_ACCOUNT, 'reroutedFrom': INTERNAL_DRS_SEND_AS})
        return LEGACY_DRS_OUTBOUND_ACCOUNT, INTERNAL_DRS_SEND_AS
    return account, send_from


def gmail_send_raw(to, subject, *, html_body='', plain_body='', send_from=SEND_AS, reply_to_message_id='', attachments=None, account=SEND_ACCOUNT, cc=''):
    assert_external_email_allowed(to, cc)
    attachments = attachments or []
    # Only consider internal reroute for brand-new outbound messages; keep
    # original account/from for in-thread replies to preserve message context
    if not reply_to_message_id:
        account, send_from = internal_delivery_identity(to, account, send_from)
    msg = EmailMessage()
    msg['To'] = to
    msg['From'] = send_from
    msg['Subject'] = subject
    cc = (cc or '').strip()
    if cc:
        msg['Cc'] = cc
    thread_id = ''
    if reply_to_message_id:
        ctx = gmail_message_context(reply_to_message_id, account=account)
        thread_id = ctx.get('threadId', '')
        message_id_header = ctx.get('messageIdHeader', '')
        references = ctx.get('references', '')
        if message_id_header:
            msg['In-Reply-To'] = message_id_header
            msg['References'] = f"{references} {message_id_header}".strip() if references else message_id_header
    body_part = EmailMessage()
    body_part.set_content(plain_body or html_to_plain_text(html_body) or ' ')
    if html_body:
        body_part.add_alternative(html_body, subtype='html')

    # Gmail renders inline CID images most reliably when the MIME layout is:
    # multipart/mixed
    #   multipart/related
    #     multipart/alternative
    #       text/plain
    #       text/html
    #     image/jpeg; Content-ID=<...>; Content-Disposition=inline
    #   normal attachments, if any
    sig_path = signature_logo_path() if html_body and f'cid:{SIGNATURE_CID}' in (html_body or '') else None
    if sig_path is not None:
        related_part = EmailMessage()
        related_part.set_type('multipart/related')
        related_part.attach(body_part)
        try:
            sig_bytes = sig_path.read_bytes()
            subtype = 'jpeg' if sig_path.suffix.lower() in {'.jpg', '.jpeg'} else 'png'
            image_part = EmailMessage()
            image_part.set_content(sig_bytes, maintype='image', subtype=subtype, cid=f'<{SIGNATURE_CID}>', disposition='inline')
            # No filename: avoids Gmail presenting the signature as a user-facing attachment.
            related_part.attach(image_part)
            body_container = related_part
        except Exception:
            body_container = body_part
    else:
        body_container = body_part

    if attachments:
        msg.make_mixed()
        msg.attach(body_container)
        for attachment in attachments:
            path = Path(attachment)
            if not path.exists():
                continue
            mime = 'application/pdf'
            if path.suffix.lower() in {'.jpg', '.jpeg'}:
                mime = 'image/jpeg'
            elif path.suffix.lower() == '.png':
                mime = 'image/png'
            maintype, subtype = mime.split('/', 1)
            msg.add_attachment(path.read_bytes(), maintype=maintype, subtype=subtype, filename=path.name)
    else:
        for key, value in list(msg.items()):
            body_container[key] = value
        msg = body_container
    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode('ascii')
    payload = {'raw': raw}
    if thread_id:
        payload['threadId'] = thread_id
    token = gmail_access_token(account)
    req = urllib.request.Request(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
        data=json.dumps(payload).encode('utf-8'),
        headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'},
        method='POST',
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode('utf-8'))


def render_email_html(body_text):
    # The DRS signature block already supplies the closing identity. Strip common
    # sign-offs so emails do not show both "Best regards" and the signature.
    body_text = re.sub(r'(?is)\n\s*(best regards|regards|thanks|thank you)\s*,?\s*$', '', body_text.strip())
    paragraphs = [p.strip() for p in re.split(r'\n\s*\n', body_text.strip()) if p.strip()]
    rendered = []
    for paragraph in paragraphs:
        lines = [html.escape(line.strip()) for line in paragraph.splitlines() if line.strip()]
        rendered.append(f"<p style=\"margin:0 0 16px 0; line-height:1.6;\">{'<br>'.join(lines)}</p>")
    inner = ''.join(rendered) if rendered else '<p style="margin:0; line-height:1.6;"></p>'
    return f'<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;max-width:640px;">{inner}{render_signature_html()}</div>'


def append_test_log(mode, action, intended, actual, subject, projects, template, notes):
    row = [[dt.datetime.now().isoformat(), mode, action, intended, actual, subject, projects, template, notes]]
    sheet_append('Test Log!A:I', row)


def make_outbound_linkage_note(base_note, subject, email):
    subject_key = normalize_subject(subject)
    email_key = (email or '').strip().lower()
    linkage = f' | linkage:subject={subject_key};email={email_key}'
    return f'{base_note}{linkage}' if base_note else f'linkage:subject={subject_key};email={email_key}'


def deliver_email(state, to, subject, html_body, template_name, projects, note):
    test_sample_sent = int(state.get('testSampleSent', 0) or 0)
    first_live_copy_mode = False
    if state['mode'] == 'test':
        sample_subject = f'TEST PlanHubGuy sample → originally to: {to}'
        sample_banner = (
            '<div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#7a5a00;background:#fff4cc;'
            'border:1px solid #f0d36a;padding:12px 14px;margin:0 0 16px 0;border-radius:10px;">'
            f'<strong>PlanHubGuy test sample.</strong><br>Original intended recipient: {to}<br>'
            f'Template: {template_name}<br>Projects: {projects or "(none)"}'
            '</div>'
        )
        if test_sample_sent < TEST_EMAIL_SAMPLE_LIMIT:
            enforce_send_capacity(state, required=1)
            raw = gmail_send_raw(NOTIFY_TO, sample_subject, html_body=sample_banner + html_body, send_from=SEND_AS, account=SEND_ACCOUNT)
            state['testSampleSent'] = test_sample_sent + 1
            record_send(state, 1)
            append_test_log('test', 'sample_sent_internal', to, NOTIFY_TO, sample_subject, projects, template_name, note)
            log({'status': 'test_sample_sent_internal', 'to': to, 'subject': sample_subject, 'template': template_name})
            return {'messageId': raw.get('id', ''), 'threadId': raw.get('threadId', '')}
        append_test_log('test', 'would_send', to, NOTIFY_TO, subject, projects, template_name, note)
        log({'status': 'test_would_send', 'to': to, 'subject': subject, 'template': template_name})
        return {'messageId': '', 'threadId': ''}
    required_capacity = 2 if first_live_copy_mode else 1
    enforce_send_capacity(state, required=required_capacity)
    assert_live_sender_account_matches_from()
    raw = gmail_send_raw(to, subject, html_body=html_body, send_from=SEND_AS, account=SEND_ACCOUNT)
    record_send(state, 1)
    message_ctx = {}
    if raw.get('id'):
        try:
            message_ctx = gmail_message_context(raw.get('id', ''), account=SEND_ACCOUNT)
        except Exception as exc:
            # The email has already been accepted by Gmail at this point. Do not
            # crash the whole run because a follow-up read of the sent message
            # hit a transient Gmail/gog failure; that causes duplicate-risk on
            # the next run. Log it and preserve the raw Gmail ids instead.
            log({'status': 'sent_message_context_lookup_failed', 'to': to, 'subject': subject, 'messageId': raw.get('id', ''), 'threadId': raw.get('threadId', ''), 'error': str(exc)})
    assert_no_legacy_drs_send_leak(message_ctx.get('messageIdHeader', ''), to)
    log({'status': 'live_send', 'to': to, 'subject': subject, 'template': template_name})
    if first_live_copy_mode:
        copy_subject = f'PlanHubGuy first live send copy → {to} | {subject}'
        copy_banner = (
            '<div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#7a5a00;background:#fff4cc;'
            'border:1px solid #f0d36a;padding:12px 14px;margin:0 0 16px 0;border-radius:10px;">'
            f'<strong>First live PlanHubGuy outbound copy.</strong><br>Original recipient: {to}<br>'
            f'Template: {template_name}<br>Projects: {projects or "(none)"}'
            '</div>'
        )
        gmail_send_raw(NOTIFY_TO, copy_subject, html_body=copy_banner + html_body, send_from=SEND_AS, account=SEND_ACCOUNT)
        record_send(state, 1)
        log({'status': 'first_live_copy_sent', 'to': to, 'copiedTo': NOTIFY_TO, 'subject': subject, 'template': template_name})
    return {'messageId': raw.get('id', ''), 'threadId': raw.get('threadId', '')}


def send_explicit_sample(state, unique_map, templates, sample_email, sample_template):
    info = unique_map.get(sample_email.lower())
    if not info:
        raise ValueError(f'Sample email not found in unique map: {sample_email}')
    projects = info.projects
    if not projects:
        raise ValueError(f'No projects found for sample email: {sample_email}')
    template = templates.get(sample_template, templates['template1'])
    greeting = info.first_name.strip()
    project_phrase = format_project_phrase(projects)
    subject = f'PLANHUBGUY EXPLICIT SAMPLE → {sample_email}'
    body = apply_project_pluralization(apply_greeting(template['body'], greeting), len(projects)).replace('[Project Name]', project_phrase)
    html_body = render_email_html(body)
    banner = (
        '<div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#7a5a00;background:#fff4cc;'
        'border:1px solid #f0d36a;padding:12px 14px;margin:0 0 16px 0;border-radius:10px;">'
        f'<strong>PlanHubGuy explicit sample.</strong><br>Original intended recipient: {sample_email}<br>'
        f'Template: {sample_template}<br>Projects: {project_phrase}'
        '</div>'
    )
    enforce_send_capacity(state, required=1)
    raw = gmail_send_raw(NOTIFY_TO, subject, html_body=banner + html_body, send_from=SEND_AS, account=SEND_ACCOUNT)
    record_send(state, 1)
    samples = state.get('trackedSampleThreads', []) or []
    samples.append({'email': sample_email, 'threadId': raw.get('threadId', ''), 'projects': project_phrase})
    state['trackedSampleThreads'] = samples[-100:]
    save_state(state)
    append_test_log('test', 'explicit_sample_sent', sample_email, NOTIFY_TO, subject, project_phrase, sample_template, 'Manual explicit sample generator')
    log({'status': 'explicit_sample_sent', 'email': sample_email, 'template': sample_template, 'threadId': raw.get('threadId', '')})
    return raw


def build_balanced_test_group(unique_map, excavation_confidence, per_level=3):
    buckets = {'High': [], 'Medium': [], 'Low': []}
    for email, info in unique_map.items():
        levels = {excavation_confidence.get(project, 'Low') for project in info.projects}
        for level in ['High', 'Medium', 'Low']:
            if level in levels:
                buckets[level].append({
                    'email': email,
                    'confidence': level,
                    'project': next((p for p in info.projects if excavation_confidence.get(p, 'Low') == level), info.projects[0] if info.projects else ''),
                })
                break
    chosen = []
    for level in ['High', 'Medium', 'Low']:
        pool = buckets[level]
        if pool:
            chosen.extend(random.sample(pool, min(per_level, len(pool))))
    return chosen


def generate_test_group(state, unique_map, count, excavation_confidence, balanced=False):
    if balanced:
        group = build_balanced_test_group(unique_map, excavation_confidence, max(1, count // 3))
    else:
        pool = sorted(unique_map.keys())
        emails = random.sample(pool, min(count, len(pool))) if pool else []
        group = [{'email': email, 'confidence': '', 'project': ''} for email in emails]
    state['testGroupEmails'] = [item['email'] for item in group]
    state['testGroupDetails'] = group
    state['testGroupGeneratedAt'] = dt.datetime.now().isoformat()
    save_state(state)
    log({'status': 'test_group_generated', 'count': len(group), 'balanced': balanced})
    return group


def run_test_group(state, unique_map, templates):
    details = state.get('testGroupDetails', []) or []
    if not details:
        log({'status': 'test_group_run_skipped', 'reason': 'no_test_group_generated'})
        return []
    sent = []
    for item in details:
        email = str(item.get('email', '')).strip().lower()
        source_email = str(item.get('sourceEmail', email)).strip().lower()
        info = unique_map.get(email) or unique_map.get(source_email)
        if not info:
            log({'status': 'test_group_skipped_missing_info', 'email': email, 'sourceEmail': source_email})
            continue
        projects = info.projects
        if not projects:
            log({'status': 'test_group_skipped_no_projects', 'email': email, 'sourceEmail': source_email})
            continue
        greeting = info.first_name.strip()
        project_phrase = format_project_phrase(projects)
        subject = f'PLANHUBGUY TEST GROUP SAMPLE → {email}'
        body = apply_project_pluralization(apply_greeting(templates['template1']['body'], greeting), len(projects)).replace('[Project Name]', project_phrase)
        html_body = render_email_html(body)
        banner = (
            '<div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#7a5a00;background:#fff4cc;'
            'border:1px solid #f0d36a;padding:12px 14px;margin:0 0 16px 0;border-radius:10px;">'
            f'<strong>PlanHubGuy test-group sample.</strong><br>Original intended recipient: {email}<br>'
            f'Projects: {project_phrase}'
            '</div>'
        )
        enforce_send_capacity(state, required=1)
        gmail_send_raw(NOTIFY_TO, subject, html_body=banner + html_body, send_from=SEND_AS, account=SEND_ACCOUNT)
        record_send(state, 1)
        append_test_log('test', 'test_group_sample_sent', email, NOTIFY_TO, subject, project_phrase, 'template1', 'Balanced test group run')
        sent.append(email)
    state['lastTestGroupRunAt'] = dt.datetime.now().isoformat()
    save_state(state)
    log({'status': 'test_group_run_complete', 'count': len(sent)})
    return sent


def classify_inbound(info):
    from_text = (info.get('from') or '').lower()
    subject_text = (info.get('subject') or '').lower()
    snippet_text = (info.get('snippet') or '').lower()
    body_text = (info.get('bodyText') or '').lower()
    sender_email = extract_email(info.get('from', ''))
    blob = ' '.join([from_text, subject_text, snippet_text, body_text])
    auto_submitted = (info.get('autoSubmitted') or '').lower()
    if auto_submitted in {'auto-replied', 'auto-generated'}:
        if any(marker in blob for marker in BOUNCE_MARKERS) or 'delivery status notification' in blob or 'undeliverable' in blob:
            return 'bounce'
        return 'auto'
    if sender_email in INTERNAL_SENDERS:
        return 'internal'
    if any(marker in blob for marker in BOUNCE_MARKERS):
        return 'bounce'
    if any(marker in blob for marker in AUTO_REPLY_MARKERS):
        return 'auto'
    if 'noreply' in from_text or 'no-reply' in from_text:
        return 'system'
    if looks_like_possible_work(info):
        return 'possible_work'
    return 'valid'


def decode_message_body_data(data: str) -> str:
    if not data:
        return ''
    try:
        pad = '=' * ((4 - len(data) % 4) % 4)
        raw = base64.urlsafe_b64decode((data + pad).encode('ascii'))
        for enc in ('utf-8', 'latin-1'):
            try:
                return raw.decode(enc)
            except Exception:
                continue
        return raw.decode('utf-8', errors='replace')
    except Exception:
        return ''


def message_plain_text(message: dict) -> str:
    payload = message.get('payload') or {}
    found_plain = []
    found_html = []

    def walk(part):
        mime = (part.get('mimeType') or '').lower()
        data = ((part.get('body') or {}).get('data') or '')
        if data:
            decoded = decode_message_body_data(data)
            if mime == 'text/plain':
                found_plain.append(decoded)
            elif mime == 'text/html':
                found_html.append(html_to_plain_text(decoded))
        for child in part.get('parts') or []:
            walk(child)

    walk(payload)
    if found_plain:
        return '\n\n'.join(x.strip() for x in found_plain if x.strip()).strip()
    if found_html:
        return '\n\n'.join(x.strip() for x in found_html if x.strip()).strip()
    data = ((payload.get('body') or {}).get('data') or '')
    return html_to_plain_text(decode_message_body_data(data)) if data else (message.get('snippet', '') or '')


def looks_like_possible_work(info):
    subject_text = (info.get('subject') or '').lower()
    snippet_text = (info.get('snippet') or '').lower()
    blob = ' '.join([subject_text, snippet_text])
    if not blob.strip():
        return False
    if any(marker in blob for marker in NO_WORK_MARKERS):
        return False
    score = 0
    for marker in POSSIBLE_WORK_MARKERS:
        if marker in blob:
            score += 1
    # Direct outreach to Dave about a construction/engineering topic should be
    # treated as possible work even if it is not part of a PlanHub thread.
    if 'dave@drs-engineering.net' in (info.get('to') or '').lower() and any(term in blob for term in ['project', 'shoring', 'retaining', 'foundation', 'proposal', 'quote', 'estimate', 'rfp', 'rfq']):
        score += 1
    return score >= 1


_THREAD_CACHE = {}


def clear_thread_cache(thread_id=''):
    thread_id = str(thread_id or '').strip()
    if thread_id:
        _THREAD_CACHE.pop(thread_id, None)
    else:
        _THREAD_CACHE.clear()


def thread_details(thread_id, use_cache=True):
    thread_id = str(thread_id or '').strip()
    if not thread_id:
        return {}
    if use_cache and thread_id in _THREAD_CACHE:
        return _THREAD_CACHE[thread_id]
    try:
        payload = json.loads(run('gog', 'gmail', 'thread', 'get', thread_id, '-a', INBOUND_ACCOUNT, '-j'))
        thread = payload.get('thread', {})
        _THREAD_CACHE[thread_id] = thread
        return thread
    except Exception as exc:
        log({'status': 'thread_get_failed', 'threadId': thread_id, 'error': str(exc)})
        return {}


def participant_emails(info):
    values = [info.get('from', ''), info.get('to', ''), info.get('cc', '')]
    found = []
    for value in values:
        found.extend(re.findall(r'([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})', value or '', re.I))
    return sorted({item.strip().lower() for item in found if item})


def find_best_match(info, unique_map, outreach_records):
    sender = extract_email(info.get('from', ''))
    if sender in unique_map:
        return sender
    participants = participant_emails(info)
    for email in participants:
        if email in unique_map:
            return email
    subject = normalize_subject(info.get('subject', ''))
    for rec in outreach_records:
        if rec.email and any(p.strip() and normalize_project_name(p) in subject for p in rec.project_list()):
            return rec.email
    return ''


def sent_subject_fallback(subject):
    subject = normalize_subject(subject)
    if not subject:
        return {'email': '', 'projects': ''}
    safe_subject = subject.replace(chr(34), '')
    queries = [
        f'newer_than:30d in:sent subject:"{safe_subject}"',
        f'newer_than:30d "{safe_subject}"',
    ]
    accounts = [INBOUND_ACCOUNT, SEND_ACCOUNT]
    for account in accounts:
        for query in queries:
            try:
                payload = json.loads(run('gog', 'gmail', 'messages', 'search', query, '-a', account, '-j', '--all', '--max', '10'))
            except Exception as exc:
                log({'status': 'sent_subject_fallback_failed', 'subject': subject, 'account': account, 'query': query, 'error': str(exc)})
                continue
            for msg in payload.get('messages', []):
                headers = []
                if account == INBOUND_ACCOUNT:
                    thread = thread_details(msg.get('threadId', ''))
                    for item in thread.get('messages', []):
                        if item.get('id') == msg.get('id'):
                            headers = item.get('payload', {}).get('headers', [])
                            break
                else:
                    try:
                        thread = json.loads(run('gog', 'gmail', 'thread', 'get', msg.get('threadId', ''), '-a', account, '-j')).get('thread', {})
                        for item in thread.get('messages', []):
                            if item.get('id') == msg.get('id'):
                                headers = item.get('payload', {}).get('headers', [])
                                break
                    except Exception:
                        headers = []
                from_email = extract_email(get_header(headers, 'From'))
                to_email = extract_email(get_header(headers, 'To'))
                subj = normalize_subject(get_header(headers, 'Subject'))
                candidate_email = to_email
                if account == SEND_ACCOUNT and to_email == SEND_AS.lower():
                    candidate_email = from_email
                if account == SEND_ACCOUNT and from_email == SEND_ACCOUNT.lower():
                    candidate_email = to_email
                if candidate_email and candidate_email != INBOUND_ACCOUNT.lower() and candidate_email != SEND_AS.lower() and subj == subject:
                    return {'email': candidate_email, 'projects': subject.title()}
    return {'email': '', 'projects': ''}


def resolve_inbound_match(info, unique_map, outreach_records, indexes=None):
    indexes = indexes or build_outreach_indexes(outreach_records)
    thread_id = str(info.get('threadId', '')).strip()
    if thread_id and thread_id in indexes['by_thread']:
        result = dict(indexes['by_thread'][thread_id])
        result['matchConfidence'] = 'high'
        return result
    subject = normalize_subject(info.get('subject', ''))
    sender = extract_email(info.get('from', ''))
    if subject and sender and (subject, sender) in indexes.get('by_linkage', {}):
        result = dict(indexes['by_linkage'][(subject, sender)])
        result['matchConfidence'] = 'high'
        return result
    if sender and sender in indexes['by_email']:
        sender_rows = indexes['by_email'][sender]
        if len(sender_rows) == 1:
            result = dict(sender_rows[0])
            result['matchConfidence'] = 'high'
            return result
    if subject and subject in indexes['by_subject']:
        candidates = indexes['by_subject'][subject]
        participant_set = set(participant_emails(info))
        if sender:
            for item in candidates:
                if item['email'] == sender:
                    result = dict(item)
                    result['matchConfidence'] = 'high'
                    return result
        if participant_set:
            for item in candidates:
                if item['email'] in participant_set:
                    result = dict(item)
                    result['matchConfidence'] = 'medium'
                    return result
        if len(candidates) == 1:
            result = dict(candidates[0])
            result['matchConfidence'] = 'medium'
            return result
    matched_email = find_best_match(info, unique_map, outreach_records)
    if matched_email and matched_email in indexes['by_email']:
        rows = indexes['by_email'][matched_email]
        if rows:
            result = dict(rows[0])
            result['matchConfidence'] = 'medium'
            return result
        return {'email': matched_email, 'projects': ' | '.join(unique_map.get(matched_email).projects), 'threadId': thread_id, 'rowIndex': None, 'subject': subject, 'matchConfidence': 'medium'}
    if not matched_email:
        fallback = sent_subject_fallback(subject)
        fallback_email = fallback.get('email', '').strip().lower()
        if fallback_email:
            if sender and fallback_email != sender:
                sender_domain = sender.split('@', 1)[1] if '@' in sender else ''
                fallback_domain = fallback_email.split('@', 1)[1] if '@' in fallback_email else ''
                if sender_domain and fallback_domain and sender_domain != fallback_domain:
                    fallback_email = sender
            return {'email': fallback_email, 'projects': fallback.get('projects', ''), 'threadId': thread_id, 'rowIndex': None, 'subject': subject, 'matchConfidence': 'low'}
        if DEDICATED_RESPONSE_MAILBOX and sender and sender not in INTERNAL_SENDERS:
            return {
                'email': sender,
                'projects': subject.title() if subject else '',
                'threadId': thread_id,
                'rowIndex': None,
                'subject': subject,
                'matchConfidence': 'low',
            }
    return {'email': matched_email, 'projects': ' | '.join(unique_map.get(matched_email).projects) if matched_email and matched_email in unique_map else '', 'threadId': thread_id, 'rowIndex': None, 'subject': subject, 'matchConfidence': 'low'}


def append_response_log(match_email, info, response_type, projects):
    sender_text = info.get('from', '')
    sender_email = extract_email(sender_text)
    thread_id = str(info.get('threadId', '')).strip()
    subject = str(info.get('subject', '')).strip()
    response_type = str(response_type).strip().lower()
    canonical_email = sender_email.strip().lower() if response_type == 'valid' and sender_email else (match_email or sender_email).strip().lower()
    log({'status': 'append_response_log_attempt', 'email': canonical_email, 'threadId': thread_id, 'subject': subject, 'responseType': response_type})
    try:
        existing = load_response_rows()
    except Exception:
        existing = [[]]
    fallback_keys = {
        (canonical_email, thread_id, subject, response_type),
        ('', thread_id, subject, response_type),
        (sender_email.strip().lower(), thread_id, subject, response_type),
    }
    for row in existing[1:]:
        candidate = (
            (row[RESPONSE_EMAIL] if len(row) > RESPONSE_EMAIL else '').strip().lower(),
            (row[RESPONSE_THREAD_ID] if len(row) > RESPONSE_THREAD_ID else '').strip(),
            (row[RESPONSE_SUBJECT] if len(row) > RESPONSE_SUBJECT else '').strip(),
            (row[RESPONSE_TYPE] if len(row) > RESPONSE_TYPE else '').strip().lower(),
        )
        if candidate in fallback_keys:
            log({'status': 'append_response_log_skipped_duplicate', 'email': canonical_email, 'threadId': thread_id, 'subject': subject, 'responseType': response_type})
            return
    row = [[canonical_email, dt.date.today().isoformat(), response_type, thread_id, sender_text, subject, info.get('snippet', ''), projects, 'PlanHubGuy inbound monitor']]
    sheet_append('Response Log!A:I', row)
    log({'status': 'append_response_log_complete', 'email': canonical_email, 'threadId': thread_id, 'subject': subject, 'responseType': response_type})


def message_date_timestamp(message):
    headers = (message.get('payload') or {}).get('headers', [])
    date_value = get_header(headers, 'Date')
    if not date_value:
        return None
    try:
        parsed = parsedate_to_datetime(date_value)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=dt.timezone.utc)
        return parsed.timestamp()
    except Exception:
        return None


def thread_has_internal_message_relative_to(thread, source_message_id, *, before=False, after=False):
    source_message_id = str(source_message_id or '').strip()
    messages = thread.get('messages', []) or []
    source = next((msg for msg in messages if str(msg.get('id', '')).strip() == source_message_id), None)
    source_ts = message_date_timestamp(source or {})
    if source_ts is None:
        return False
    for msg in messages:
        mid = str(msg.get('id', '')).strip()
        if not mid or mid == source_message_id:
            continue
        labels = set(msg.get('labelIds', []) or [])
        headers = (msg.get('payload') or {}).get('headers', [])
        sender = extract_email(get_header(headers, 'From'))
        if sender not in INTERNAL_SENDERS and 'SENT' not in labels:
            continue
        msg_ts = message_date_timestamp(msg)
        if msg_ts is None:
            continue
        if after and msg_ts > source_ts:
            return True
        if before and msg_ts < source_ts:
            return True
    return False


def thread_has_internal_reply_after(thread, source_message_id):
    return thread_has_internal_message_relative_to(thread, source_message_id, after=True)


def thread_has_internal_reply_before(thread, source_message_id):
    return thread_has_internal_message_relative_to(thread, source_message_id, before=True)


def apply_response_label(message_id, response_type, thread_id=''):
    message_id = str(message_id or '').strip()
    response_type = str(response_type or '').strip().lower()
    thread_id = str(thread_id or '').strip()
    if not message_id:
        return
    add_label, remove_labels = response_type_to_label_and_removals(response_type)
    if not add_label:
        return
    try:
        if thread_id:
            thread = thread_details(thread_id)
            if response_type == 'valid' and thread_has_internal_reply_after(thread, message_id):
                add_label = LABEL_RESPONDED
                remove_labels = [LABEL_FOLLOW_UP, LABEL_AUTOMATIC_REPLY, LABEL_BAD_EMAIL, LABEL_POSSIBLE_WORK]
            for msg in thread.get('messages', []) or []:
                mid = str(msg.get('id', '')).strip()
                if not mid:
                    continue
                args = ['gog', 'gmail', 'batch', 'modify', mid, '-a', INBOUND_ACCOUNT]
                if mid == message_id:
                    args.extend(['--add', add_label])
                for label in remove_labels:
                    args.extend(['--remove', label])
                args.append('-y')
                run(*args)
        else:
            args = ['gog', 'gmail', 'batch', 'modify', message_id, '-a', INBOUND_ACCOUNT, '--add', add_label]
            for label in remove_labels:
                args.extend(['--remove', label])
            args.append('-y')
            run(*args)
        log({'status': 'gmail_response_label_applied', 'messageId': message_id, 'threadId': thread_id, 'responseType': response_type, 'added': add_label, 'removed': remove_labels})
    except Exception as exc:
        log({'status': 'gmail_response_label_failed', 'messageId': message_id, 'threadId': thread_id, 'responseType': response_type, 'error': str(exc)})


def update_response_in_log(match_email, response_date, response_email, status, outreach_records, match_confidence='low'):
    desired = 'Possible Work' if status == 'possible_work' else ('Replied' if status == 'valid' else 'Bounced')
    updated = 0
    if match_confidence not in {'high', 'medium'}:
        return 0
    for idx, rec in enumerate(outreach_records, start=2):
        if rec.email != match_email:
            continue
        if rec.response_date and rec.campaign_status in {'Replied', 'Responded', 'Possible Work', 'Bounced', 'Closed', 'Do Not Contact'}:
            continue
        sheet_update(f'Outreach Log!F{idx}:I{idx}', [[response_date, response_email, f'PlanHubGuy inbound {status}', desired]])
        updated += 1
    return updated


def notify_valid_response(state, info, matched_email, projects):
    log({'status': 'response_notification_disabled', 'email': matched_email, 'threadId': info.get('threadId', ''), 'reason': 'manual_review_in_dave_mailbox'})
    return


def notify_possible_work_response(state, info, matched_email, projects):
    msg_id = (info.get('messageId') or '').strip()
    thread_id = (info.get('threadId') or '').strip()
    subject = info.get('subject', '') or '(no subject)'
    # Dave reviews Possible Work directly in Mission Control. Do not forward
    # these notifications to DRS@DRS-Engineering.net; Gmail labels and the
    # Mission Control queue are the source of truth.
    log({'status': 'possible_work_notification_disabled', 'messageId': msg_id, 'threadId': thread_id, 'subject': subject, 'reason': 'mission_control_review_only'})
    return False


def process_inbound_messages(state, unique_map, outreach_records, messages, indexes=None, ignore_seen=False):
    indexes = indexes or build_outreach_indexes(outreach_records)
    seen_messages = set(state.get('seenInboundMessageIds', []))
    newly_seen = set(seen_messages)
    processed = 0
    for msg in messages:
        msg_id = msg.get('id', '')
        if not msg_id or (msg_id in seen_messages and not ignore_seen):
            continue
        headers = msg.get('payload', {}).get('headers', [])
        if len((msg.get('payload') or {}).get('headers', [])) == 0:
            thread = thread_details(msg.get('threadId', ''))
            full = next((m for m in thread.get('messages', []) if m.get('id', '') == msg.get('id', '')), msg)
            msg = full
            headers = msg.get('payload', {}).get('headers', [])
        info = {
            'messageId': msg_id,
            'threadId': msg.get('threadId', ''),
            'from': get_header(headers, 'From'),
            'to': get_header(headers, 'To'),
            'cc': get_header(headers, 'Cc'),
            'subject': get_header(headers, 'Subject'),
            'date': get_header(headers, 'Date'),
            'snippet': msg.get('snippet', ''),
            'bodyText': message_plain_text(msg),
            'labels': msg.get('labelIds', []),
            'autoSubmitted': get_header(headers, 'Auto-Submitted'),
            'inReplyTo': get_header(headers, 'In-Reply-To'),
            'references': get_header(headers, 'References'),
        }
        match = resolve_inbound_match(info, unique_map, outreach_records, indexes=indexes)
        matched_email = (match.get('email') or '').strip().lower()
        projects = match.get('projects', '')
        match_confidence = match.get('matchConfidence', 'low')
        sender_email = extract_email(info.get('from', ''))
        response_type = classify_inbound(info)
        log({'status': 'inbound_message_evaluated', 'messageId': msg_id, 'threadId': info.get('threadId', ''), 'from': info.get('from', ''), 'subject': info.get('subject', ''), 'classification': response_type, 'matchedEmail': matched_email, 'projects': projects, 'matchConfidence': match_confidence})
        if response_type == 'internal':
            log({'status': 'inbound_ignored_internal_sender', 'threadId': info.get('threadId', ''), 'from': info.get('from', ''), 'subject': info.get('subject', ''), 'mode': state['mode']})
            newly_seen.add(msg_id)
            continue
        apply_response_label(msg_id, response_type, info.get('threadId', ''))
        append_response_log(matched_email, info, response_type, projects)
        if response_type in {'valid', 'possible_work'}:
            if matched_email:
                updates = update_response_in_log(matched_email, dt.date.today().isoformat(), sender_email, response_type, outreach_records, match_confidence=match_confidence)
                if response_type == 'possible_work':
                    notify_possible_work_response(state, info, matched_email, projects)
                else:
                    notify_valid_response(state, info, matched_email, projects)
                if match_confidence not in {'high', 'medium'}:
                    set_stage(state, 'Monitoring replies', f'Ambiguous reply captured from {info.get("from", "unknown sender")} for {projects or info.get("subject", "unknown subject")}. Review attribution.')
                    log({'status': 'inbound_valid_ambiguous', 'email': matched_email, 'threadId': info.get('threadId', ''), 'from': info.get('from', ''), 'subject': info.get('subject', ''), 'projects': projects, 'matchConfidence': match_confidence, 'mode': state['mode']})
                log({'status': 'inbound_valid_response', 'email': matched_email, 'threadId': info.get('threadId', ''), 'classification': response_type, 'updates': updates, 'mode': state['mode']})
            else:
                if response_type == 'possible_work':
                    notify_possible_work_response(state, info, matched_email, projects)
                log({'status': 'inbound_valid_unmatched', 'threadId': info.get('threadId', ''), 'from': info.get('from', ''), 'subject': info.get('subject', ''), 'classification': response_type, 'mode': state['mode']})
        elif response_type == 'bounce':
            updates = 0
            if matched_email:
                updates = update_response_in_log(matched_email, dt.date.today().isoformat(), sender_email, 'bounce', outreach_records, match_confidence=match_confidence)
            log({'status': 'inbound_bounce', 'email': matched_email, 'threadId': info.get('threadId', ''), 'updates': updates, 'mode': state['mode']})
        else:
            log({'status': 'inbound_ignored', 'threadId': info.get('threadId', ''), 'classification': response_type, 'from': info.get('from', ''), 'mode': state['mode']})
        newly_seen.add(msg_id)
        processed += 1
    state['seenInboundMessageIds'] = sorted(newly_seen)[-5000:]
    save_state(state)
    return processed


def fetch_message_by_search(query, account=INBOUND_ACCOUNT, max_results=50):
    try:
        payload = json.loads(run('gog', 'gmail', 'messages', 'search', query, '-a', account, '-j', '--all', '--max', str(max_results)))
    except Exception as exc:
        log({'status': 'gmail_search_failed', 'query': query, 'account': account, 'error': str(exc)})
        return []
    messages = []
    for hit in payload.get('messages', []):
        thread_id = hit.get('threadId', '')
        msg_id = hit.get('id', '')
        if not thread_id or not msg_id:
            continue
        thread = thread_details(thread_id)
        full = next((m for m in thread.get('messages', []) if m.get('id', '') == msg_id), None)
        if full:
            messages.append(full)
    return messages


def fetch_message_by_sender_subject(sender, subject, max_results=10):
    sender = (sender or '').strip().lower()
    subject = (subject or '').strip()
    if not sender or not subject:
        return []
    safe_subject = subject.replace('"', '')
    queries = [
        f'newer_than:30d in:anywhere from:{sender} subject:"{safe_subject}"',
        f'newer_than:30d in:spam from:{sender} subject:"{safe_subject}"',
    ]
    messages = []
    seen = set()
    for query in queries:
        for msg in fetch_message_by_search(query, account=INBOUND_ACCOUNT, max_results=max_results):
            msg_id = msg.get('id', '')
            if msg_id and msg_id not in seen:
                seen.add(msg_id)
                messages.append(msg)
    return messages


# Inbound architecture note:
# The supported pattern is bounded Gmail search queries plus targeted thread hydration.
# Avoid broad mailbox/thread sweeps. They proved too expensive and brittle in live use.
# `PLANHUBGUY_TARGETED_QUERIES` is the operator-safe recovery/control surface for known replies.
# General monitoring should stay within the bounded query model built here.
def build_inbound_queries(outreach_records, target_subjects=None):
    queries = [
        'newer_than:14d in:anywhere from:(mailer-daemon@googlemail.com OR postmaster OR mailer-daemon)',
        'newer_than:14d in:anywhere (subject:"Delivery Status Notification" OR subject:"Undeliverable:" OR subject:"Returned mail")',
        'newer_than:14d in:anywhere (subject:"Re: Regarding" OR subject:"RE: Regarding" OR subject:"Fw: Regarding" OR subject:"Fwd: Regarding")',
        'newer_than:30d in:spam (subject:"Re: Regarding" OR subject:"RE: Regarding" OR subject:"Fw: Regarding" OR subject:"Fwd: Regarding")',
        'newer_than:14d in:anywhere subject:"Regarding"',
        'newer_than:30d in:spam subject:"Regarding"',
        'newer_than:7d in:inbox to:Dave@DRS-Engineering.net (proposal OR quote OR estimate OR "fee proposal" OR RFP OR RFQ OR project OR shoring OR retaining OR foundation OR "earth retention")',
        'newer_than:7d in:inbox to:Dave@DRS-Engineering.net ("can you help" OR "would like to discuss" OR "schedule a call" OR "new project" OR "upcoming project" OR "are you available")',
    ]
    if target_subjects:
        targeted_subjects = [normalize_subject(s) for s in target_subjects if s]
    else:
        tracked_subjects = []
        for rec in outreach_records:
            raw_subject = rec.title or ''
            if not raw_subject and rec.projects_referenced:
                first_project = rec.project_list()[0] if rec.project_list() else ''
                if first_project:
                    raw_subject = f'Regarding {first_project}'
            subject = normalize_subject(raw_subject)
            if subject.startswith('regarding '):
                tracked_subjects.append(subject)
        targeted_subjects = sorted(set(tracked_subjects))[:150]
    for subject in targeted_subjects:
        raw_subject = subject.replace('"', '')
        queries.append(f'newer_than:30d in:anywhere subject:"{raw_subject}"')
        queries.append(f'newer_than:30d in:spam subject:"{raw_subject}"')
    deduped = []
    seen = set()
    for query in queries:
        if query not in seen:
            seen.add(query)
            deduped.append(query)
    return deduped


def dedupe_messages(messages):
    deduped = []
    seen = set()
    for msg in messages:
        msg_id = msg.get('id', '')
        if msg_id and msg_id not in seen:
            seen.add(msg_id)
            deduped.append(msg)
    return deduped


def collect_messages_for_queries(query_lines, max_results=50):
    messages = []
    for query in query_lines:
        messages.extend(fetch_message_by_search(query, account=INBOUND_ACCOUNT, max_results=max_results))
    return dedupe_messages(messages)


def collect_messages_for_sender_subject_lines(sender_subject_lines, max_results=10):
    messages = []
    for line in sender_subject_lines:
        sender_part, subject_part = line.split(' | subject=', 1)
        sender = sender_part.replace('sender=', '', 1).strip().lower()
        subject = subject_part.strip()
        messages.extend(fetch_message_by_sender_subject(sender, subject, max_results=max_results))
    return dedupe_messages(messages)


def search_recent_inbound_messages(target_subjects=None):
    outreach_records = []
    try:
        _, outreach_records = load_outreach_records()
    except Exception:
        outreach_records = []
    queries = build_inbound_queries(outreach_records, target_subjects=target_subjects)
    return collect_messages_for_queries(queries, max_results=25)


def run_inbound_processing(state, unique_map_all, outreach_records, messages, *, ignore_seen=False, log_status=None):
    indexes = build_outreach_indexes(outreach_records)
    before = set(state.get('seenInboundMessageIds', []))
    processed = process_inbound_messages(state, unique_map_all, outreach_records, messages, indexes=indexes, ignore_seen=ignore_seen)
    after = set(state.get('seenInboundMessageIds', []))
    if log_status:
        log({
            'status': log_status,
            'rows': processed,
            'messages': len(messages),
            'newSeen': len(after - before),
            'ignoreSeen': ignore_seen,
        })
    return processed


def monitor_inbound(state, unique_map_all, outreach_records):
    messages = search_recent_inbound_messages()
    log({'status': 'monitor_inbound_candidates', 'count': len(messages)})
    return run_inbound_processing(state, unique_map_all, outreach_records, messages, ignore_seen=False, log_status='monitor_inbound_completed')


def backfill_inbound_from_outreach(state, unique_map_all, outreach_records):
    messages = search_recent_inbound_messages()
    force_reprocess = os.getenv('PLANHUBGUY_IGNORE_SEEN_INBOUND', '').strip() == '1'
    processed = run_inbound_processing(state, unique_map_all, outreach_records, messages, ignore_seen=force_reprocess, log_status='inbound_backfill_completed')
    return processed, 0


def targeted_recovery_lines(raw_text):
    lines = [q.strip() for q in (raw_text or '').split('\n') if q.strip()]
    query_lines = []
    sender_subject_lines = []
    for line in lines:
        if line.startswith('sender=') and ' | subject=' in line:
            sender_subject_lines.append(line)
        else:
            query_lines.append(line)
    return query_lines, sender_subject_lines


def targeted_inbound_recovery(state, unique_map_all, outreach_records):
    # Bounded, operator-specified inbound recovery path for known replies.
    # Supports either raw Gmail queries or sender|subject pairs.
    queries_raw = os.getenv('PLANHUBGUY_TARGETED_QUERIES', '').strip()
    if not queries_raw:
        return 0
    query_lines, sender_subject_lines = targeted_recovery_lines(queries_raw)
    messages = dedupe_messages(
        collect_messages_for_queries(query_lines, max_results=50)
        + collect_messages_for_sender_subject_lines(sender_subject_lines, max_results=10)
    )
    force_reprocess = os.getenv('PLANHUBGUY_IGNORE_SEEN_INBOUND', '').strip() == '1'
    processed = run_inbound_processing(state, unique_map_all, outreach_records, messages, ignore_seen=force_reprocess)
    log({'status': 'targeted_inbound_recovery_complete', 'queryLines': len(query_lines), 'senderSubjectLines': len(sender_subject_lines), 'messages': len(messages), 'processed': processed, 'ignoreSeen': force_reprocess})
    return processed


def write_unique_email_tabs(unique_map_all):
    rows = [['email', 'contactTitle', 'projectCount', 'projectName1', 'projectName2', 'projectName3', 'projectName4', 'projectName5', 'projectName6', 'projectName7', 'projectName8', 'projectName9']]
    for email in sorted(unique_map_all.keys()):
        info = unique_map_all[email]
        rows.append([email, info.title, str(len(info.projects)), *info.projects[:9]])
    tabs = ['Unique Emails', 'Unique Emails 2', 'Unique Emails 3']
    chunk_size = 1000
    width = 12
    written = 0
    for i, tab in enumerate(tabs):
        start = i * chunk_size
        end = start + chunk_size
        body = rows[start + 1:end + 1]
        chunk = [rows[0], *body]
        if len(chunk) < 2:
            chunk.append([''] * width)
        normalized = [row + [''] * (width - len(row)) for row in chunk]
        end_row = len(normalized)
        sheet_update(f'{tab}!A1:L{end_row}', normalized)
        written += max(0, len(normalized) - 1)
    log({'status': 'unique_email_tabs_written', 'rows': written})
    return rows


def build_process_context(state):
    now = dt.datetime.now()
    templates = load_templates()
    contact_profiles = load_contact_profiles()
    excavation_confidence = load_excavation_confidence()
    excavation_confidence = sync_excavation_review_from_planhub_leads(excavation_confidence)
    allowed_confidence = set(state.get('confidenceLevels', ['High', 'Medium', 'Low']))
    unique_map_all = build_unique_email_projects_from_planhub_leads(contact_profiles, excavation_confidence, {'High', 'Medium', 'Low'})
    unique_map_allowed = build_unique_email_projects_from_planhub_leads(contact_profiles, excavation_confidence, allowed_confidence)
    outreach_rows, outreach_records = load_outreach_records()
    return ProcessContext(state, now, templates, contact_profiles, excavation_confidence, unique_map_all, unique_map_allowed, outreach_rows, outreach_records)


def should_skip_initial_send(state, manual_run, scheduled_send, now):
    return now.hour < 15 and not (manual_run or scheduled_send)


def select_unsent_projects(contact: ContactProjects, sent_history: Dict[str, Set[str]], response_history: Optional[Dict[str, Set[str]]] = None) -> List[str]:
    already_sent = sent_history.get(contact.email, set())
    already_responded = (response_history or {}).get(contact.email, set())
    unsent = []
    for project in contact.projects:
        project_key = normalize_project_key(project)
        if project_key in already_sent:
            continue
        if project_key in already_responded:
            log({'status': 'duplicate_initial_suppressed_by_response_log', 'email': contact.email, 'project': project})
            continue
        if project_seen_in_sent_mailbox(contact.email, project):
            continue
        unsent.append(project)
    return unsent


def append_outreach_records(records: List[OutreachRecord]):
    if not records:
        return
    rows = [rec.to_row() for rec in records]
    sheet_append('Outreach Log!A:L', rows)
    log({'status': 'outreach_log_appended', 'rows': len(rows), 'firstEmail': rows[0][0], 'lastEmail': rows[-1][0]})


def append_outreach_record(record: OutreachRecord):
    append_outreach_records([record])


def run_initial_outreach(ctx: ProcessContext, manual_run: bool, validation_only: bool = False):
    state = ctx.state
    sent_hist = build_outreach_history(ctx.outreach_records)
    response_hist = build_response_history(load_response_rows())
    subject_tpl = ctx.templates['template1']['subject']
    body_tpl = ctx.templates['template1']['body']
    planned = []
    processed = 0
    limit = candidate_limit(state)
    for email, contact in sorted(ctx.unique_map_allowed.items()):
        if processed >= limit:
            break
        if recipient_is_do_not_contact(email):
            log({'status': 'initial_outreach_suppressed_do_not_contact', 'email': email})
            continue
        unsent_projects = select_unsent_projects(contact, sent_hist, response_hist)
        if not unsent_projects:
            continue
        planned.append({'email': email, 'projects': unsent_projects, 'reason': 'eligible_unsent_projects'})
        if validation_only:
            processed += 1
            continue
        project_text = format_project_phrase(unsent_projects)
        greeting = contact.first_name.strip()
        subject = subject_tpl.replace('[Project Name]', unsent_projects[0])
        body = apply_project_pluralization(apply_greeting(body_tpl, greeting), len(unsent_projects)).replace('[Project Name]', project_text)
        html_body = render_email_html(body)
        meta = deliver_email(state, email, subject, html_body, 'template1', ' | '.join(unsent_projects), 'PlanHubGuy initial outreach')
        record = OutreachRecord(
            email=email,
            title=contact.title,
            date_sent=ctx.now.date().isoformat(),
            template_used='template1',
            projects_referenced=' | '.join(unsent_projects),
            notes=make_outbound_linkage_note(f'PlanHubGuy initial outreach ({state["mode"]})', subject, email),
            campaign_status='Active',
            follow_up_stage='Initial',
            message_id=meta.get('messageId', ''),
            thread_id=meta.get('threadId', ''),
        )
        append_outreach_record(record)
        for project in unsent_projects:
            sent_hist[email].add(normalize_project_key(project))
        processed += 1
        log({'status': 'sent', 'email': email, 'projects': unsent_projects, 'mode': state['mode']})
    if validation_only:
        log({'status': 'validation_initial_candidates', 'count': len(planned), 'mode': state['mode']})
        return {'planned': planned, 'processed': len(planned)}
    return {'planned': planned, 'processed': processed}


def run_followups(ctx: ProcessContext, validation_only: bool = False):
    state = ctx.state
    now = ctx.now
    processed = 0
    limit = candidate_limit(state)
    planned = []
    planned_keys = set()
    followup_history = build_followup_history(ctx.outreach_records)
    for idx, rec in enumerate(ctx.outreach_records, start=2):
        if processed >= limit:
            break
        if recipient_is_do_not_contact(rec.email):
            log({'status': 'followup_suppressed_do_not_contact', 'email': rec.email, 'row': idx})
            continue
        if not rec.email or not rec.date_sent or rec.response_date or rec.campaign_status in {'Replied', 'Responded', 'Bounced', 'Closed', 'Do Not Contact'}:
            continue
        try:
            sent_dt = dt.date.fromisoformat(rec.date_sent)
        except Exception:
            continue
        age = (now.date() - sent_dt).days
        stage = rec.follow_up_stage or 'Initial'
        project_list = rec.project_list()
        if not project_list:
            continue
        project_key = project_tuple_key(project_list)
        if stage == 'Initial' and age >= 14:
            followup_key = ((rec.email or '').strip().lower(), project_key, 'FollowUp1')
            if followup_key in planned_keys:
                log({'status': 'duplicate_followup_suppressed_in_run', 'email': rec.email, 'projects': rec.projects_referenced, 'stage': 'FollowUp1', 'row': idx})
                continue
            if followup_key in followup_history:
                log({'status': 'duplicate_followup_suppressed_by_outreach_log', 'email': rec.email, 'projects': rec.projects_referenced, 'stage': 'FollowUp1', 'row': idx})
                continue
            subject = ctx.templates['template2']['subject'].replace('[Project Name]', project_list[0])
            if followup_seen_in_sent_mailbox(rec.email, subject):
                continue
            planned_keys.add(followup_key)
            planned.append({'row': idx, 'email': rec.email, 'stage': 'FollowUp1', 'projects': project_list})
            if validation_only:
                processed += 1
                continue
            body = apply_project_pluralization(apply_greeting(ctx.templates['template2']['body'], ctx.unique_map_all.get(rec.email, ContactProjects(rec.email,'','','','',[])).first_name), len(project_list)).replace('[Project Name]', format_project_phrase(project_list))
            html_body = render_email_html(body)
            meta = deliver_email(state, rec.email, subject, html_body, 'template2', rec.projects_referenced, 'PlanHubGuy follow-up 1')
            sheet_update(f'Outreach Log!C{idx}:L{idx}', [[now.date().isoformat(), 'template2', rec.projects_referenced, '', '', make_outbound_linkage_note(f'PlanHubGuy follow-up 1 ({state["mode"]})', subject, rec.email), 'Active', 'FollowUp1', meta.get('messageId', ''), meta.get('threadId', '')]])
            followup_history.add(followup_key)
            processed += 1
            log({'status': 'followup1_sent', 'email': rec.email, 'mode': state['mode']})
        elif stage in {'Initial', 'FollowUp1'} and age >= 28:
            followup_key = ((rec.email or '').strip().lower(), project_key, 'FinalFollowUp')
            if followup_key in planned_keys:
                log({'status': 'duplicate_followup_suppressed_in_run', 'email': rec.email, 'projects': rec.projects_referenced, 'stage': 'FinalFollowUp', 'row': idx})
                continue
            if followup_key in followup_history:
                log({'status': 'duplicate_followup_suppressed_by_outreach_log', 'email': rec.email, 'projects': rec.projects_referenced, 'stage': 'FinalFollowUp', 'row': idx})
                continue
            subject = ctx.templates['template3']['subject'].replace('[Project Name]', project_list[0])
            if followup_seen_in_sent_mailbox(rec.email, subject):
                continue
            planned_keys.add(followup_key)
            planned.append({'row': idx, 'email': rec.email, 'stage': 'FinalFollowUp', 'projects': project_list})
            if validation_only:
                processed += 1
                continue
            body = apply_project_pluralization(apply_greeting(ctx.templates['template3']['body'], ctx.unique_map_all.get(rec.email, ContactProjects(rec.email,'','','','',[])).first_name), len(project_list)).replace('[Project Name]', format_project_phrase(project_list))
            html_body = render_email_html(body)
            meta = deliver_email(state, rec.email, subject, html_body, 'template3', rec.projects_referenced, 'PlanHubGuy final follow-up')
            sheet_update(f'Outreach Log!C{idx}:L{idx}', [[now.date().isoformat(), 'template3', rec.projects_referenced, '', '', make_outbound_linkage_note(f'PlanHubGuy final follow-up ({state["mode"]})', subject, rec.email), 'Closed', 'FinalFollowUp', meta.get('messageId', ''), meta.get('threadId', '')]])
            followup_history.add(followup_key)
            processed += 1
            log({'status': 'followup_final_sent', 'email': rec.email, 'mode': state['mode']})
    if validation_only:
        log({'status': 'validation_followup_candidates', 'count': len(planned), 'mode': state['mode']})
    return {'planned': planned, 'processed': processed}


def write_candidate_report(summary, report_name='planhubguy-candidate-report.json'):
    report = {
        'generatedAt': dt.datetime.now().isoformat(),
        'mode': summary.get('mode'),
        'confidenceLevels': summary.get('confidenceLevels', []),
        'initialCount': summary.get('initialCount', 0),
        'followupCount': summary.get('followupCount', 0),
        'sampleInitialCandidates': summary.get('initialCandidates', [])[:25],
        'sampleFollowupCandidates': summary.get('followupCandidates', [])[:25],
    }
    report_path = Path('/home/davesalter/.openclaw/workspace/mission-control/scripts/tmp') / report_name
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    log({'status': 'candidate_report_written', 'path': str(report_path), 'initialCount': report['initialCount'], 'followupCount': report['followupCount']})
    return report_path


def run_validation(ctx: ProcessContext):
    initial = run_initial_outreach(ctx, manual_run=True, validation_only=True)
    followups = run_followups(ctx, validation_only=True)
    summary = {
        'initialCandidates': initial['planned'],
        'initialCount': initial['processed'],
        'followupCandidates': followups['planned'],
        'followupCount': followups['processed'],
        'mode': ctx.state['mode'],
        'confidenceLevels': ctx.state.get('confidenceLevels', ['High', 'Medium', 'Low']),
    }
    report_path = write_candidate_report(summary)
    log({'status': 'validation_summary', 'initialCount': summary['initialCount'], 'followupCount': summary['followupCount'], 'mode': ctx.state['mode'], 'reportPath': str(report_path)})
    print(json.dumps(summary, indent=2))
    return summary


def produce_current_candidate_report(ctx: ProcessContext):
    initial = run_initial_outreach(ctx, manual_run=True, validation_only=True)
    followups = run_followups(ctx, validation_only=True)
    summary = {
        'initialCandidates': initial['planned'],
        'initialCount': initial['processed'],
        'followupCandidates': followups['planned'],
        'followupCount': followups['processed'],
        'mode': ctx.state['mode'],
        'confidenceLevels': ctx.state.get('confidenceLevels', ['High', 'Medium', 'Low']),
    }
    report_path = write_candidate_report(summary, report_name='planhubguy-candidate-report-current.json')
    log({'status': 'candidate_report_current_written', 'path': str(report_path), 'initialCount': summary['initialCount'], 'followupCount': summary['followupCount']})
    return summary, report_path


def runtime_flags():
    generate_group = os.environ.get('PLANHUBGUY_GENERATE_TEST_GROUP', '').strip()
    run_test_group_flag = os.environ.get('PLANHUBGUY_RUN_TEST_GROUP') == '1'
    sample_email = os.environ.get('PLANHUBGUY_SAMPLE_EMAIL', '').strip()
    return {
        'generate_group': generate_group,
        'run_test_group_flag': run_test_group_flag,
        'sample_email': sample_email,
        'sample_template': os.environ.get('PLANHUBGUY_SAMPLE_TEMPLATE', 'template1').strip() or 'template1',
        'validate_only': os.environ.get('PLANHUBGUY_VALIDATE_ONLY') == '1',
        'report_only': os.environ.get('PLANHUBGUY_REPORT_ONLY') == '1',
        'inbound_only': os.environ.get('PLANHUBGUY_INBOUND_ONLY') == '1',
        'targeted_queries': os.environ.get('PLANHUBGUY_TARGETED_QUERIES', '').strip(),
        'backfill_inbound': os.environ.get('PLANHUBGUY_BACKFILL_INBOUND') == '1',
        'manual_run': os.environ.get('PLANHUBGUY_MANUAL') == '1',
        'scheduled_send': os.environ.get('PLANHUBGUY_SCHEDULED_SEND') == '1',
        'skip_inbound_monitor': os.environ.get('PLANHUBGUY_SKIP_INBOUND_MONITOR') == '1',
        'balanced_test_group': os.environ.get('PLANHUBGUY_BALANCED_TEST_GROUP') == '1',
        'disable_followups': os.environ.get('PLANHUBGUY_DISABLE_FOLLOWUPS') == '1',
    }


def main():
    state = load_state()
    flags = runtime_flags()
    # Non-mutating verification of label presence
    try:
        verify_labels_exist(sys.modules[__name__], INBOUND_ACCOUNT)
    except Exception:
        pass
    internal_test_request = any([flags['generate_group'], flags['run_test_group_flag'], flags['sample_email'], flags['validate_only'], flags['report_only']])
    internal_inbound_request = any([flags['inbound_only'], bool(flags['targeted_queries']), flags['backfill_inbound']])
    if not state.get('enabled', False) and not internal_test_request and not internal_inbound_request:
        log({'status': 'skipped', 'reason': 'disabled'})
        return

    state.setdefault('firstLiveCopyMode', True)

    if flags['sample_email']:
        ctx = build_process_context(state)
        set_stage(state, 'Sending explicit sample', f"Sending internal sample for {flags['sample_email']}")
        send_explicit_sample(state, ctx.unique_map_allowed, ctx.templates, flags['sample_email'], flags['sample_template'])
        return

    ctx = build_process_context(state)
    write_unique_email_tabs(ctx.unique_map_all)

    if flags['generate_group']:
        set_stage(state, 'Generating test group', 'Preparing internal balanced sample group')
        generate_test_group(state, ctx.unique_map_all, int(flags['generate_group'] or '10'), ctx.excavation_confidence, balanced=flags['balanced_test_group'])
        set_stage(state, 'Paused', 'Test group generated. No client emails sent')
        return

    if flags['run_test_group_flag']:
        set_stage(state, 'Running test group', 'Sending internal test-group samples')
        run_test_group(state, ctx.unique_map_allowed, ctx.templates)
        set_stage(state, 'Paused', 'Test group run complete. Internal-only samples sent')
        return

    if flags['report_only']:
        set_stage(state, 'Reporting', 'Generating current candidate report without sending emails')
        produce_current_candidate_report(ctx)
        set_stage(state, 'Paused', 'Candidate report generated. No client emails sent')
        return

    if flags['targeted_queries']:
        set_stage(state, 'Recovering targeted replies', 'Processing a bounded set of known inbound replies only')
        targeted_inbound_recovery(state, ctx.unique_map_all, ctx.outreach_records)
        ctx = build_process_context(state)
        if flags['inbound_only']:
            set_stage(state, 'Paused', 'Targeted inbound-only recovery complete. No outbound emails sent')
            log({'status': 'inbound_only_complete', 'mode': state['mode'], 'reason': 'targeted_recovery_only'})
            return

    if flags['backfill_inbound']:
        set_stage(state, 'Backfilling replies', 'Recovering missed inbound replies and bounces from tracked threads')
        backfill_inbound_from_outreach(state, ctx.unique_map_all, ctx.outreach_records)
        ctx = build_process_context(state)
        if flags['inbound_only']:
            set_stage(state, 'Paused', 'Inbound-only backfill complete. No outbound emails sent')
            log({'status': 'inbound_only_complete', 'mode': state['mode'], 'reason': 'backfill_only'})
            return

    if flags['validate_only']:
        set_stage(state, 'Validating', 'Reviewing eligibility and suppression without client sends')
        run_validation(ctx)
        set_stage(state, 'Paused', 'Validation complete. No client emails sent')
        return

    if flags['skip_inbound_monitor']:
        log({'status': 'inbound_monitor_skipped', 'reason': 'disabled_by_env', 'mode': state['mode']})
    elif (not flags['manual_run'] and not flags['scheduled_send']) or flags['inbound_only']:
        set_stage(state, 'Monitoring replies', 'Checking inbound replies, bounces, and auto-replies')
        monitor_inbound(state, ctx.unique_map_all, ctx.outreach_records)
        ctx = build_process_context(state)
        if flags['inbound_only']:
            set_stage(state, 'Paused', 'Inbound-only monitoring complete. No outbound emails sent')
            log({'status': 'inbound_only_complete', 'mode': state['mode'], 'reason': 'monitor_only'})
            return
    else:
        log({'status': 'inbound_monitor_skipped', 'reason': 'manual_run_default', 'mode': state['mode']})

    if should_skip_initial_send(state, flags['manual_run'], flags['scheduled_send'], ctx.now):
        set_stage(state, 'Waiting for send window', 'Inbound monitoring only before 3pm unless manually run')
        log({'status': 'partial', 'reason': 'before_3pm_inbound_only', 'mode': state['mode']})
        return

    set_stage(state, 'Sending initial emails', 'Processing eligible first-contact outreach')
    initial_result = run_initial_outreach(ctx, flags['manual_run'], validation_only=False)

    if flags['disable_followups']:
        log({'status': 'followups_skipped', 'reason': 'disabled_by_env', 'mode': state['mode']})
        set_stage(state, 'Idle', f'Run complete. Initial emails: {initial_result["processed"]}, follow-ups skipped')
        return

    ctx = build_process_context(state)
    set_stage(state, 'Checking follow-ups', 'Reviewing prior outreach for follow-up timing')
    followup_result = run_followups(ctx, validation_only=False)
    set_stage(state, 'Idle', f'Run complete. Initial emails: {initial_result["processed"]}, follow-ups: {followup_result["processed"]}')


if __name__ == '__main__':
    main()
