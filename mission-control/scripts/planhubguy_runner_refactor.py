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
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Set

WORKBOOK_ID = '1AJ5p4YHb3T1PtfFW8CFulVK1cHcDZT7cqrTxoo3An7s'
ACCOUNT = 'drs@drs-engineering.net'
SEND_AS = 'Dave@DRS-Engineering.net'
NOTIFY_TO = 'DRS@DRS-Engineering.net'
STATE_FILE = Path('/home/davesalter/.openclaw/workspace/memory/planhubguy-state.json')
LOG_FILE = Path('/home/davesalter/.openclaw/workspace/memory/planhubguy-log.jsonl')
TEMPLATES_FILE = Path('/home/davesalter/.openclaw/workspace/mission-control/data/planhubguy-templates.json')
SIGNATURE_LOGO_FILE = Path('/home/davesalter/.openclaw/media/inbound/file_16---2ddf24fa-b1aa-4851-bcde-b1fed9a74a9e.jpg')
TEST_BATCH_LIMIT = 10
TEST_EMAIL_SAMPLE_LIMIT = 5
LIVE_BATCH_LIMIT = 25
OUTREACH_RANGE = 'Outreach Log!A1:L4000'
RESPONSE_RANGE = 'Response Log!A1:I4000'
PLANHUB_RANGE = 'PlanHub Leads!A1:U7000'
EXCAVATION_RANGE = 'Excavation Review!A1:F7000'

BOUNCE_MARKERS = [
    'mailer-daemon', 'postmaster', 'delivery status notification', 'delivery failure',
    'undeliverable', 'returned mail', 'delivery incomplete', 'failure notice', 'address not found',
    'message blocked', 'recipient address rejected'
]
AUTO_REPLY_MARKERS = ['out of office', 'automatic reply', 'auto reply', 'autoreply', 'vacation', 'away from the office']

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
    proc = subprocess.run(list(args), text=True, capture_output=True)
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
            return json.loads(run('gog', 'sheets', 'get', WORKBOOK_ID, rng, '-a', ACCOUNT, '-j', '--results-only'))
        except Exception as exc:
            last_error = exc
            if attempt < retries - 1:
                time.sleep(2 * (attempt + 1))
            else:
                raise last_error


def sheet_update(rng, values, mode='RAW'):
    payload = json.dumps(values)
    run('gog', 'sheets', 'update', WORKBOOK_ID, rng, '-a', ACCOUNT, '--input', mode, f'--values-json={payload}')


def sheet_append(rng, values, mode='RAW'):
    chunk_size = 100
    for i in range(0, len(values), chunk_size):
        payload = json.dumps(values[i:i + chunk_size])
        run('gog', 'sheets', 'append', WORKBOOK_ID, rng, '-a', ACCOUNT, '--input', mode, f'--values-json={payload}')


def load_state():
    try:
        state = json.loads(STATE_FILE.read_text())
    except Exception:
        state = {'enabled': False, 'mode': 'test'}
    state.setdefault('seenInboundThreads', [])
    state['mode'] = 'live' if state.get('mode') == 'live' else 'test'
    return state


def save_state(state):
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(state, indent=2) + '\n', encoding='utf-8')


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


def normalize_subject(subject):
    value = (subject or '').strip().lower()
    value = re.sub(r'^(re|fw|fwd):\s*', '', value)
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
                hist[rec.email].add(normalize_project_name(project))
    return hist


def build_outreach_indexes(records: List[OutreachRecord]):
    by_thread = {}
    by_subject = collections.defaultdict(list)
    by_email = collections.defaultdict(list)
    for idx, rec in enumerate(records, start=2):
        subject = normalize_subject(f"Regarding {rec.project_list()[0]}") if rec.project_list() else ''
        record = {
            'rowIndex': idx,
            'email': rec.email,
            'projects': rec.projects_referenced,
            'threadId': rec.thread_id,
            'subject': subject,
        }
        if rec.thread_id:
            by_thread[rec.thread_id] = record
        if subject:
            by_subject[subject].append(record)
        if rec.email:
            by_email[rec.email].append(record)
    return {'by_thread': by_thread, 'by_subject': by_subject, 'by_email': by_email}


def candidate_limit(state):
    return TEST_BATCH_LIMIT if state['mode'] == 'test' else LIVE_BATCH_LIMIT


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


def render_signature_html():
    logo = image_data_uri(SIGNATURE_LOGO_FILE)
    logo_html = f'<img src="{logo}" alt="DRS Engineering logo" style="display:block; max-width:140px; height:auto; margin:10px 0 12px 0;">' if logo else ''
    return (
        '<div style="font-family:Arial,Helvetica,sans-serif; font-size:14px; color:#111; max-width:640px; margin-top:8px;">'
        '<p style="margin:0 0 10px 0; line-height:1.55;">'
        'Thanks<br>'
        '<strong><em>Dave Salter&nbsp; BSc. PhD PE</em></strong><br>'
        '<strong><em>Founder and Principal</em></strong>'
        '</p>'
        f'{logo_html}'
        '<p style="margin:0 0 14px 0; line-height:1.55;">'
        'DRS@DRS-Engineering.net<br>'
        'Office:&nbsp;&nbsp; (818) 402-3962<br>'
        'Cell:&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; (310) 699-1274'
        '</p>'
        '<p style="margin:0; line-height:1.55;"><strong>Los Angeles, Santa Barbara, San Luis Obispo,<br>Vancouver, Grand Rapids</strong></p>'
        '</div>'
    )


def render_email_html(body_text):
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


def deliver_email(state, to, subject, html_body, template_name, projects, note):
    test_sample_sent = int(state.get('testSampleSent', 0) or 0)
    first_live_copy_mode = bool(state.get('firstLiveCopyMode'))
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
            raw = run('gog', 'gmail', 'send', '-a', ACCOUNT, '--from', SEND_AS, '--to', NOTIFY_TO, '--subject', sample_subject, '--body-html', sample_banner + html_body, '-j')
            state['testSampleSent'] = test_sample_sent + 1
            save_state(state)
            append_test_log('test', 'sample_sent_internal', to, NOTIFY_TO, sample_subject, projects, template_name, note)
            log({'status': 'test_sample_sent_internal', 'to': to, 'subject': sample_subject, 'template': template_name})
            return json.loads(raw)
        append_test_log('test', 'would_send', to, NOTIFY_TO, subject, projects, template_name, note)
        log({'status': 'test_would_send', 'to': to, 'subject': subject, 'template': template_name})
        return {'messageId': '', 'threadId': ''}
    raw = run('gog', 'gmail', 'send', '-a', ACCOUNT, '--from', SEND_AS, '--to', to, '--subject', subject, '--body-html', html_body, '-j')
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
        run('gog', 'gmail', 'send', '-a', ACCOUNT, '--from', SEND_AS, '--to', NOTIFY_TO, '--subject', copy_subject, '--body-html', copy_banner + html_body, '-j')
        log({'status': 'first_live_copy_sent', 'to': to, 'copiedTo': NOTIFY_TO, 'subject': subject, 'template': template_name})
    return json.loads(raw)


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
    raw = json.loads(run('gog', 'gmail', 'send', '-a', ACCOUNT, '--from', SEND_AS, '--to', NOTIFY_TO, '--subject', subject, '--body-html', banner + html_body, '-j'))
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
    save_state(state)
    log({'status': 'test_group_generated', 'count': len(group), 'balanced': balanced})
    return group


def run_test_group(state, unique_map, templates):
    details = state.get('testGroupDetails', []) or []
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
        run('gog', 'gmail', 'send', '-a', ACCOUNT, '--from', SEND_AS, '--to', NOTIFY_TO, '--subject', subject, '--body-html', banner + html_body, '-j')
        append_test_log('test', 'test_group_sample_sent', email, NOTIFY_TO, subject, project_phrase, 'template1', 'Balanced test group run')
        sent.append(email)
    log({'status': 'test_group_run_complete', 'count': len(sent)})
    return sent


def classify_inbound(info):
    blob = ' '.join([(info.get('from') or '').lower(), (info.get('subject') or '').lower(), (info.get('snippet') or '').lower()])
    labels = set(info.get('labels', []))
    auto_submitted = (info.get('autoSubmitted') or '').lower()
    if 'SPAM' in labels:
        return 'system'
    if auto_submitted in {'auto-replied', 'auto-generated'}:
        if any(marker in blob for marker in BOUNCE_MARKERS) or 'delivery status notification' in blob or 'undeliverable' in blob:
            return 'bounce'
        return 'auto'
    if any(marker in blob for marker in BOUNCE_MARKERS):
        return 'bounce'
    if any(marker in blob for marker in AUTO_REPLY_MARKERS):
        return 'auto'
    if 'noreply' in blob or 'no-reply' in blob:
        return 'system'
    return 'valid'


def thread_details(thread_id):
    try:
        payload = json.loads(run('gog', 'gmail', 'thread', 'get', thread_id, '-a', ACCOUNT, '-j'))
        return payload.get('thread', {})
    except Exception as exc:
        log({'status': 'thread_get_failed', 'threadId': thread_id, 'error': str(exc)})
        return {}


def find_best_match(info, unique_map, outreach_records):
    sender = extract_email(info.get('from', ''))
    if sender in unique_map:
        return sender
    subject = (info.get('subject') or '').lower()
    for rec in outreach_records:
        if rec.email and any(p.strip() and p.strip().lower() in subject for p in rec.project_list()):
            return rec.email
    return ''


def resolve_inbound_match(info, unique_map, outreach_records, indexes=None):
    indexes = indexes or build_outreach_indexes(outreach_records)
    thread_id = str(info.get('threadId', '')).strip()
    if thread_id and thread_id in indexes['by_thread']:
        return indexes['by_thread'][thread_id]
    subject = normalize_subject(info.get('subject', ''))
    sender = extract_email(info.get('from', ''))
    if sender and sender in indexes['by_email']:
        sender_rows = indexes['by_email'][sender]
        if len(sender_rows) == 1:
            return sender_rows[0]
    if subject and subject in indexes['by_subject']:
        candidates = indexes['by_subject'][subject]
        if sender:
            for item in candidates:
                if item['email'] == sender:
                    return item
        if len(candidates) == 1:
            return candidates[0]
    matched_email = find_best_match(info, unique_map, outreach_records)
    if matched_email and matched_email in indexes['by_email']:
        rows = indexes['by_email'][matched_email]
        return rows[0] if rows else {'email': matched_email, 'projects': ' | '.join(unique_map.get(matched_email).projects), 'threadId': thread_id, 'rowIndex': None, 'subject': subject}
    return {'email': matched_email, 'projects': ' | '.join(unique_map.get(matched_email).projects) if matched_email and matched_email in unique_map else '', 'threadId': thread_id, 'rowIndex': None, 'subject': subject}


def append_response_log(match_email, info, response_type, projects):
    sender_text = info.get('from', '')
    sender_email = extract_email(sender_text)
    thread_id = str(info.get('threadId', '')).strip()
    subject = str(info.get('subject', '')).strip()
    response_type = str(response_type).strip().lower()
    canonical_email = (match_email or sender_email).strip().lower()
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
            return
    row = [[canonical_email, dt.date.today().isoformat(), response_type, thread_id, sender_text, subject, info.get('snippet', ''), projects, 'PlanHubGuy inbound monitor']]
    sheet_append('Response Log!A:I', row)


def update_response_in_log(match_email, response_date, response_email, status, outreach_records):
    desired = 'Replied' if status == 'valid' else 'Bounced'
    updated = 0
    for idx, rec in enumerate(outreach_records, start=2):
        if rec.email != match_email:
            continue
        if rec.response_date and rec.campaign_status in {'Replied', 'Bounced', 'Closed', 'Do Not Contact'}:
            continue
        sheet_update(f'Outreach Log!F{idx}:I{idx}', [[response_date, response_email, f'PlanHubGuy inbound {status}', desired]])
        updated += 1
    return updated


def notify_valid_response(state, info, matched_email, projects):
    if not matched_email:
        log({'status': 'response_notification_skipped', 'reason': 'no_matched_email', 'threadId': info.get('threadId', '')})
        return
    body = (
        '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;max-width:680px;">'
        '<p><strong>PlanHub valid response received.</strong></p>'
        f'<p><strong>From:</strong> {info.get("from", "")}<br>'
        f'<strong>Matched email:</strong> {matched_email}<br>'
        f'<strong>Subject:</strong> {info.get("subject", "")}<br>'
        f'<strong>Projects:</strong> {projects or "(not recorded)"}<br>'
        f'<strong>Thread ID:</strong> {info.get("threadId", "")}</p>'
        f'<p><strong>Snippet:</strong><br>{info.get("snippet", "")}</p>'
        '</div>'
    )
    if state['mode'] == 'test':
        append_test_log('test', 'would_notify', matched_email, NOTIFY_TO, f'PlanHub Response: {matched_email}', projects, 'notification', 'Valid inbound response detected')
        log({'status': 'test_would_notify', 'email': matched_email, 'threadId': info.get('threadId', '')})
        return
    run('gog', 'gmail', 'send', '-a', ACCOUNT, '--from', SEND_AS, '--to', NOTIFY_TO, '--subject', f'PlanHub Response: {matched_email}', '--body-html', body, '-j')
    log({'status': 'response_notification_sent', 'email': matched_email, 'threadId': info.get('threadId', '')})


def process_inbound_messages(state, unique_map, outreach_records, messages, indexes=None):
    indexes = indexes or build_outreach_indexes(outreach_records)
    seen_messages = set(state.get('seenInboundMessageIds', []))
    newly_seen = set(seen_messages)
    processed = 0
    for msg in messages:
        msg_id = msg.get('id', '')
        if not msg_id or msg_id in seen_messages:
            continue
        headers = msg.get('payload', {}).get('headers', [])
        if len((msg.get('payload') or {}).get('headers', [])) == 0:
            thread = thread_details(msg.get('threadId', ''))
            full = next((m for m in thread.get('messages', []) if m.get('id', '') == msg.get('id', '')), msg)
            msg = full
            headers = msg.get('payload', {}).get('headers', [])
        info = {
            'threadId': msg.get('threadId', ''),
            'from': get_header(headers, 'From'),
            'subject': get_header(headers, 'Subject'),
            'date': get_header(headers, 'Date'),
            'snippet': msg.get('snippet', ''),
            'labels': msg.get('labelIds', []),
            'autoSubmitted': get_header(headers, 'Auto-Submitted'),
        }
        match = resolve_inbound_match(info, unique_map, outreach_records, indexes=indexes)
        matched_email = (match.get('email') or '').strip().lower()
        projects = match.get('projects', '')
        sender_email = extract_email(info.get('from', ''))
        response_type = classify_inbound(info)
        append_response_log(matched_email, info, response_type, projects)
        if response_type == 'valid':
            if matched_email:
                updates = update_response_in_log(matched_email, dt.date.today().isoformat(), sender_email, 'valid', outreach_records)
                notify_valid_response(state, info, matched_email, projects)
                log({'status': 'inbound_valid_response', 'email': matched_email, 'threadId': info.get('threadId', ''), 'updates': updates, 'mode': state['mode']})
            else:
                log({'status': 'inbound_valid_unmatched', 'threadId': info.get('threadId', ''), 'from': info.get('from', ''), 'subject': info.get('subject', ''), 'mode': state['mode']})
        elif response_type == 'bounce':
            updates = 0
            if matched_email:
                updates = update_response_in_log(matched_email, dt.date.today().isoformat(), sender_email, 'bounce', outreach_records)
            log({'status': 'inbound_bounce', 'email': matched_email, 'threadId': info.get('threadId', ''), 'updates': updates, 'mode': state['mode']})
        else:
            log({'status': 'inbound_ignored', 'threadId': info.get('threadId', ''), 'classification': response_type, 'from': info.get('from', ''), 'mode': state['mode']})
        newly_seen.add(msg_id)
        processed += 1
    state['seenInboundMessageIds'] = sorted(newly_seen)[-5000:]
    save_state(state)
    return processed


def search_recent_inbound_messages():
    queries = [
        'newer_than:7d in:anywhere (subject:"Undeliverable: Regarding" OR subject:"Delivery Status Notification" OR subject:"Re: Regarding" OR subject:"RE: Regarding")',
    ]
    messages = []
    seen = set()
    thread_cache = {}
    for query in queries:
        try:
            payload = json.loads(run('gog', 'gmail', 'messages', 'search', query, '-a', ACCOUNT, '-j', '--all', '--max', '500'))
        except Exception as exc:
            log({'status': 'gmail_search_failed', 'query': query, 'error': str(exc)})
            continue
        for hit in payload.get('messages', []):
            msg_id = hit.get('id', '')
            thread_id = hit.get('threadId', '')
            if not msg_id or msg_id in seen or not thread_id:
                continue
            seen.add(msg_id)
            if thread_id not in thread_cache:
                thread_cache[thread_id] = thread_details(thread_id).get('messages', [])
            full_message = next((m for m in thread_cache[thread_id] if m.get('id', '') == msg_id), None)
            if full_message:
                messages.append(full_message)
    return messages


def monitor_inbound(state, unique_map_all, outreach_records):
    messages = search_recent_inbound_messages()
    indexes = build_outreach_indexes(outreach_records)
    log({'status': 'monitor_inbound_candidates', 'count': len(messages)})
    process_inbound_messages(state, unique_map_all, outreach_records, messages, indexes=indexes)


def backfill_inbound_from_outreach(state, unique_map_all, outreach_records):
    messages = search_recent_inbound_messages()
    indexes = build_outreach_indexes(outreach_records)
    before = set(state.get('seenInboundMessageIds', []))
    processed = process_inbound_messages(state, unique_map_all, outreach_records, messages, indexes=indexes)
    after = set(state.get('seenInboundMessageIds', []))
    log({'status': 'inbound_backfill_completed', 'rows': processed, 'newSeen': len(after - before)})
    return processed, 0


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


def should_skip_initial_send(state, manual_run, now):
    return now.hour < 15 and not manual_run


def select_unsent_projects(contact: ContactProjects, sent_history: Dict[str, Set[str]]) -> List[str]:
    already_sent = sent_history.get(contact.email, set())
    return [project for project in contact.projects if normalize_project_name(project) not in already_sent]


def append_outreach_records(records: List[OutreachRecord]):
    if not records:
        return
    rows = [rec.to_row() for rec in records]
    sheet_append('Outreach Log!A:L', rows)
    log({'status': 'outreach_log_appended', 'rows': len(rows), 'firstEmail': rows[0][0], 'lastEmail': rows[-1][0]})


def run_initial_outreach(ctx: ProcessContext, manual_run: bool, validation_only: bool = False):
    state = ctx.state
    sent_hist = build_outreach_history(ctx.outreach_records)
    subject_tpl = ctx.templates['template1']['subject']
    body_tpl = ctx.templates['template1']['body']
    planned = []
    sent_records = []
    processed = 0
    limit = candidate_limit(state)
    for email, contact in sorted(ctx.unique_map_allowed.items()):
        if processed >= limit:
            break
        unsent_projects = select_unsent_projects(contact, sent_hist)
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
        sent_records.append(OutreachRecord(
            email=email,
            title=contact.title,
            date_sent=ctx.now.date().isoformat(),
            template_used='template1',
            projects_referenced=' | '.join(unsent_projects),
            notes=f'PlanHubGuy initial outreach ({state["mode"]})',
            campaign_status='Active',
            follow_up_stage='Initial',
            message_id=meta.get('messageId', ''),
            thread_id=meta.get('threadId', ''),
        ))
        processed += 1
        log({'status': 'sent', 'email': email, 'projects': unsent_projects, 'mode': state['mode']})
    if validation_only:
        log({'status': 'validation_initial_candidates', 'count': len(planned), 'mode': state['mode']})
        return {'planned': planned, 'processed': len(planned)}
    append_outreach_records(sent_records)
    return {'planned': planned, 'processed': processed}


def run_followups(ctx: ProcessContext, validation_only: bool = False):
    state = ctx.state
    now = ctx.now
    processed = 0
    limit = candidate_limit(state)
    planned = []
    for idx, rec in enumerate(ctx.outreach_records, start=2):
        if processed >= limit:
            break
        if not rec.email or not rec.date_sent or rec.response_date or rec.campaign_status in {'Replied', 'Bounced', 'Closed', 'Do Not Contact'}:
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
        if stage == 'Initial' and age >= 14:
            planned.append({'row': idx, 'email': rec.email, 'stage': 'FollowUp1', 'projects': project_list})
            if validation_only:
                processed += 1
                continue
            subject = ctx.templates['template2']['subject'].replace('[Project Name]', project_list[0])
            body = apply_project_pluralization(apply_greeting(ctx.templates['template2']['body'], ctx.unique_map_all.get(rec.email, ContactProjects(rec.email,'','','','',[])).first_name), len(project_list)).replace('[Project Name]', format_project_phrase(project_list))
            html_body = render_email_html(body)
            meta = deliver_email(state, rec.email, subject, html_body, 'template2', rec.projects_referenced, 'PlanHubGuy follow-up 1')
            sheet_update(f'Outreach Log!C{idx}:L{idx}', [[now.date().isoformat(), 'template2', rec.projects_referenced, '', '', f'PlanHubGuy follow-up 1 ({state["mode"]})', 'Active', 'FollowUp1', meta.get('messageId', ''), meta.get('threadId', '')]])
            processed += 1
            log({'status': 'followup1_sent', 'email': rec.email, 'mode': state['mode']})
        elif stage in {'Initial', 'FollowUp1'} and age >= 28:
            planned.append({'row': idx, 'email': rec.email, 'stage': 'FinalFollowUp', 'projects': project_list})
            if validation_only:
                processed += 1
                continue
            subject = ctx.templates['template3']['subject'].replace('[Project Name]', project_list[0])
            body = apply_project_pluralization(apply_greeting(ctx.templates['template3']['body'], ctx.unique_map_all.get(rec.email, ContactProjects(rec.email,'','','','',[])).first_name), len(project_list)).replace('[Project Name]', format_project_phrase(project_list))
            html_body = render_email_html(body)
            meta = deliver_email(state, rec.email, subject, html_body, 'template3', rec.projects_referenced, 'PlanHubGuy final follow-up')
            sheet_update(f'Outreach Log!C{idx}:L{idx}', [[now.date().isoformat(), 'template3', rec.projects_referenced, '', '', f'PlanHubGuy final follow-up ({state["mode"]})', 'Closed', 'FinalFollowUp', meta.get('messageId', ''), meta.get('threadId', '')]])
            processed += 1
            log({'status': 'followup_final_sent', 'email': rec.email, 'mode': state['mode']})
    if validation_only:
        log({'status': 'validation_followup_candidates', 'count': len(planned), 'mode': state['mode']})
    return {'planned': planned, 'processed': processed}


def write_candidate_report(summary):
    report = {
        'generatedAt': dt.datetime.now().isoformat(),
        'mode': summary.get('mode'),
        'confidenceLevels': summary.get('confidenceLevels', []),
        'initialCount': summary.get('initialCount', 0),
        'followupCount': summary.get('followupCount', 0),
        'sampleInitialCandidates': summary.get('initialCandidates', [])[:25],
        'sampleFollowupCandidates': summary.get('followupCandidates', [])[:25],
    }
    report_path = Path('/home/davesalter/.openclaw/workspace/mission-control/scripts/tmp/planhubguy-candidate-report.json')
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


def main():
    state = load_state()
    generate_group = os.environ.get('PLANHUBGUY_GENERATE_TEST_GROUP', '').strip()
    run_test_group_flag = os.environ.get('PLANHUBGUY_RUN_TEST_GROUP') == '1'
    sample_email = os.environ.get('PLANHUBGUY_SAMPLE_EMAIL', '').strip()
    sample_template = os.environ.get('PLANHUBGUY_SAMPLE_TEMPLATE', 'template1').strip() or 'template1'
    validate_only = os.environ.get('PLANHUBGUY_VALIDATE_ONLY') == '1'
    internal_test_request = any([generate_group, run_test_group_flag, sample_email, validate_only])
    if not state.get('enabled', False) and not internal_test_request:
        log({'status': 'skipped', 'reason': 'disabled'})
        return

    state.setdefault('firstLiveCopyMode', True)
    manual_run = os.environ.get('PLANHUBGUY_MANUAL') == '1'
    skip_inbound_monitor = os.environ.get('PLANHUBGUY_SKIP_INBOUND_MONITOR') == '1'

    if sample_email:
        ctx = build_process_context(state)
        set_stage(state, 'Sending explicit sample', f'Sending internal sample for {sample_email}')
        send_explicit_sample(state, ctx.unique_map_allowed, ctx.templates, sample_email, sample_template)
        return

    ctx = build_process_context(state)
    write_unique_email_tabs(ctx.unique_map_all)

    if os.environ.get('PLANHUBGUY_BACKFILL_INBOUND') == '1':
        set_stage(state, 'Backfilling replies', 'Recovering missed inbound replies and bounces from tracked threads')
        backfill_inbound_from_outreach(state, ctx.unique_map_all, ctx.outreach_records)
        ctx = build_process_context(state)

    if validate_only:
        set_stage(state, 'Validating', 'Reviewing eligibility and suppression without client sends')
        run_validation(ctx)
        set_stage(state, 'Paused', 'Validation complete. No client emails sent')
        return

    if skip_inbound_monitor:
        log({'status': 'inbound_monitor_skipped', 'reason': 'disabled_by_env', 'mode': state['mode']})
    elif not manual_run:
        set_stage(state, 'Monitoring replies', 'Checking inbound replies, bounces, and auto-replies')
        monitor_inbound(state, ctx.unique_map_all, ctx.outreach_records)
        ctx = build_process_context(state)
    else:
        log({'status': 'inbound_monitor_skipped', 'reason': 'manual_run_default', 'mode': state['mode']})

    if generate_group:
        set_stage(state, 'Generating test group', 'Preparing internal balanced sample group')
        balanced = os.environ.get('PLANHUBGUY_BALANCED_TEST_GROUP') == '1'
        generate_test_group(state, ctx.unique_map_all, int(generate_group or '10'), ctx.excavation_confidence, balanced=balanced)
        return

    if run_test_group_flag:
        set_stage(state, 'Running test group', 'Sending internal test-group samples')
        run_test_group(state, ctx.unique_map_allowed, ctx.templates)
        return

    if should_skip_initial_send(state, manual_run, ctx.now):
        set_stage(state, 'Waiting for send window', 'Inbound monitoring only before 3pm unless manually run')
        log({'status': 'partial', 'reason': 'before_3pm_inbound_only', 'mode': state['mode']})
        return

    set_stage(state, 'Sending initial emails', 'Processing eligible first-contact outreach')
    initial_result = run_initial_outreach(ctx, manual_run, validation_only=False)

    if os.environ.get('PLANHUBGUY_DISABLE_FOLLOWUPS') == '1':
        log({'status': 'followups_skipped', 'reason': 'disabled_by_env', 'mode': state['mode']})
        set_stage(state, 'Idle', f'Run complete. Initial emails: {initial_result["processed"]}, follow-ups skipped')
        return

    ctx = build_process_context(state)
    set_stage(state, 'Checking follow-ups', 'Reviewing prior outreach for follow-up timing')
    followup_result = run_followups(ctx, validation_only=False)
    set_stage(state, 'Idle', f'Run complete. Initial emails: {initial_result["processed"]}, follow-ups: {followup_result["processed"]}')


if __name__ == '__main__':
    main()
