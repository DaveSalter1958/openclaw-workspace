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
from pathlib import Path

WORKBOOK_ID = '1AJ5p4YHb3T1PtfFW8CFulVK1cHcDZT7cqrTxoo3An7s'
ACCOUNT = 'drs@drs-engineering.net'
SEND_AS = 'Dave@DRS-Engineering.net'
NOTIFY_TO = 'DRS@DRS-Engineering.net'
STATE_FILE = Path('/home/davesalter/.openclaw/workspace/memory/planhubguy-state.json')
LOG_FILE = Path('/home/davesalter/.openclaw/workspace/memory/planhubguy-log.jsonl')
TEST_BATCH_LIMIT = 10
TEST_EMAIL_SAMPLE_LIMIT = 5
LIVE_BATCH_LIMIT = 25
TEMPLATES_FILE = Path('/home/davesalter/.openclaw/workspace/mission-control/data/planhubguy-templates.json')
SIGNATURE_LOGO_FILE = Path('/home/davesalter/.openclaw/media/inbound/file_16---2ddf24fa-b1aa-4851-bcde-b1fed9a74a9e.jpg')
BOUNCE_MARKERS = [
    'mailer-daemon', 'postmaster', 'delivery status notification', 'delivery failure',
    'undeliverable', 'returned mail', 'delivery incomplete', 'failure notice', 'address not found',
    'message blocked', 'recipient address rejected'
]
AUTO_REPLY_MARKERS = ['out of office', 'automatic reply', 'auto reply', 'autoreply', 'vacation', 'away from the office']


def run(*args):
    return subprocess.check_output(list(args), text=True)


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
    payload = json.dumps(values)
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


def log(event):
    LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    with LOG_FILE.open('a', encoding='utf-8') as f:
        f.write(json.dumps({'at': dt.datetime.now().isoformat(), **event}) + '\n')


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


def thread_details(thread_id):
    try:
        payload = json.loads(run('gog', 'gmail', 'thread', 'get', thread_id, '-a', ACCOUNT, '-j'))
        return payload.get('thread', {})
    except Exception:
        return {}


def latest_message_info(thread_id):
    thread = thread_details(thread_id)
    messages = thread.get('messages', [])
    if not messages:
        return {}
    msg = messages[-1]
    headers = msg.get('payload', {}).get('headers', [])
    labels = set(msg.get('labelIds', []))
    return {
        'from': get_header(headers, 'From'),
        'subject': get_header(headers, 'Subject'),
        'deliveredTo': get_header(headers, 'Delivered-To'),
        'date': get_header(headers, 'Date'),
        'snippet': msg.get('snippet', ''),
        'labels': list(labels),
        'internalDate': msg.get('internalDate', ''),
        'threadId': thread_id,
    }


def load_templates():
    return json.loads(TEMPLATES_FILE.read_text(encoding='utf-8'))


def load_excavation_confidence():
    result = {}
    try:
        vals = sheet_get('Excavation Review!A1:F6000')
    except Exception:
        return result
    for row in vals[1:]:
        project = (row[0] if len(row) > 0 else '').strip()
        confidence = (row[3] if len(row) > 3 else '').strip()
        if project and confidence and project not in result:
            result[project] = confidence
    return result


def build_balanced_test_group(unique_map, excavation_confidence, per_level=3):
    buckets = {'High': [], 'Medium': [], 'Low': []}
    for email, info in unique_map.items():
        levels = {excavation_confidence.get(project, 'Low') for project in info.get('projects', [])}
        for level in ['High', 'Medium', 'Low']:
            if level in levels:
                buckets[level].append({
                    'email': email,
                    'confidence': level,
                    'project': next((p for p in info.get('projects', []) if excavation_confidence.get(p, 'Low') == level), info.get('projects', [''])[0]),
                })
                break
    chosen = []
    for level in ['High', 'Medium', 'Low']:
        pool = buckets[level]
        if pool:
            chosen.extend(random.sample(pool, min(per_level, len(pool))))
    return chosen


def load_contact_profiles():
    result = {}
    try:
        vals = sheet_get('PlanHub Leads!A1:U6000')
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
        elif first_name and not result[email].get('firstName'):
            result[email]['firstName'] = first_name
    return result


def unique_email_projects(contact_profiles, excavation_confidence, allowed_confidence):
    tabs = ['Unique Emails', 'Unique Emails 2', 'Unique Emails 3']
    result = {}
    for tab in tabs:
        try:
            vals = sheet_get(f'{tab}!A1:AZ1000')
        except Exception:
            continue
        for row in vals[1:]:
            if not row:
                continue
            email = (row[0] if len(row) > 0 else '').strip().lower()
            title = (row[1] if len(row) > 1 else '').strip()
            projects = [c.strip() for c in row[3:] if isinstance(c, str) and c.strip()]
            projects = [p for p in projects if excavation_confidence.get(p, 'Low') in allowed_confidence]
            if email and projects:
                profile = contact_profiles.get(email, {})
                result[email] = {
                    'title': title,
                    'projects': projects,
                    'firstName': profile.get('firstName', ''),
                    'lastName': profile.get('lastName', ''),
                    'companyName': profile.get('companyName', ''),
                }
    return result


def load_outreach_rows():
    try:
        return sheet_get('Outreach Log!A1:L4000')
    except Exception:
        return []


def outreach_history(rows):
    hist = collections.defaultdict(set)
    for row in rows[1:]:
        email = (row[0] if len(row) > 0 else '').strip().lower()
        projects = (row[4] if len(row) > 4 else '').strip()
        if email and projects:
            for p in [x.strip() for x in projects.split('|') if x.strip()]:
                hist[email].add(p)
    return hist


def append_outreach_log(entries):
    if entries:
        sheet_append('Outreach Log!A:L', entries)


def append_test_log(mode, action, intended, actual, subject, projects, template, notes):
    row = [[dt.datetime.now().isoformat(), mode, action, intended, actual, subject, projects, template, notes]]
    sheet_append('Test Log!A:I', row)


def deliver_email(state, to, subject, html_body, template_name, projects, note):
    test_sample_sent = int(state.get('testSampleSent', 0) or 0)
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
    return json.loads(raw)


def classify_inbound(info):
    blob = ' '.join([(info.get('from') or '').lower(), (info.get('subject') or '').lower(), (info.get('snippet') or '').lower()])
    labels = set(info.get('labels', []))
    if 'SPAM' in labels:
        return 'system'
    if any(marker in blob for marker in BOUNCE_MARKERS):
        return 'bounce'
    if any(marker in blob for marker in AUTO_REPLY_MARKERS):
        return 'auto'
    if 'noreply' in blob or 'no-reply' in blob:
        return 'system'
    return 'valid'


def is_internal_sender(sender_email):
    sender = (sender_email or '').lower()
    return sender.endswith('@drs-engineering.net') or sender.endswith('@sloperemediation.com')


def find_best_match(info, unique_map, outreach_rows):
    sender = extract_email(info.get('from', ''))
    if sender in unique_map:
        return sender
    subject = (info.get('subject') or '').lower()
    for row in outreach_rows[1:]:
        email = (row[0] if len(row) > 0 else '').strip().lower()
        projects = (row[4] if len(row) > 4 else '').strip().lower()
        if email and any(p.strip() and p.strip().lower() in subject for p in projects.split('|')):
            return email
    return ''


def notify_valid_response(state, info, matched_email, projects):
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
    run('gog', 'gmail', 'send', '-a', ACCOUNT, '--from', SEND_AS, '--to', NOTIFY_TO, '--subject', f'PlanHub Response: {matched_email or info.get("from", "")}', '--body-html', body, '-j')


def update_response_in_log(match_email, response_date, response_email, status):
    rows = load_outreach_rows()
    desired = 'Replied' if status == 'valid' else 'Bounced'
    for idx, row in enumerate(rows[1:], start=2):
        email = (row[0] if len(row) > 0 else '').strip().lower()
        existing_date = (row[7] if len(row) > 7 else '').strip()
        if email == match_email and not existing_date:
            sheet_update(f'Outreach Log!H{idx}:K{idx}', [[response_date, response_email, f'PlanHubGuy inbound {status}', desired]])


def append_response_log(match_email, info, response_type, projects):
    sender_text = info.get('from', '')
    sender_email = extract_email(sender_text)
    row = [[match_email or sender_email, dt.date.today().isoformat(), response_type, info.get('threadId', ''), sender_text, info.get('subject', ''), info.get('snippet', ''), projects, 'PlanHubGuy inbound monitor']]
    sheet_append('Response Log!A:I', row)


def monitor_inbound(state, unique_map, outreach_rows):
    seen_messages = set(state.get('seenInboundMessageIds', []))
    tracked_rows = []
    for row in outreach_rows[1:]:
        if not row:
            continue
        email = (row[0] if len(row) > 0 else '').strip().lower()
        thread_id = (row[6] if len(row) > 6 else '').strip()
        if email and thread_id:
            tracked_rows.append((email, thread_id, 'outreach'))
    for sample in state.get('trackedSampleThreads', []) or []:
        email = str(sample.get('email', '')).strip().lower()
        thread_id = str(sample.get('threadId', '')).strip()
        if email and thread_id:
            tracked_rows.append((email, thread_id, 'sample'))

    newly_seen = set(seen_messages)
    for matched_email, thread_id, source in tracked_rows:
        thread = thread_details(thread_id)
        messages = thread.get('messages', [])
        if len(messages) < 2:
            continue
        if source == 'sample':
            projects = next((str(s.get('projects', '')) for s in state.get('trackedSampleThreads', []) or [] if str(s.get('threadId', '')).strip() == thread_id), '')
        else:
            projects = ' | '.join(unique_map.get(matched_email, {}).get('projects', [])) if matched_email else ''
        for msg in messages[1:]:
            msg_id = msg.get('id', '')
            if not msg_id or msg_id in seen_messages:
                continue
            headers = msg.get('payload', {}).get('headers', [])
            info = {
                'threadId': thread_id,
                'from': get_header(headers, 'From'),
                'subject': get_header(headers, 'Subject'),
                'date': get_header(headers, 'Date'),
                'snippet': msg.get('snippet', ''),
                'labels': msg.get('labelIds', []),
            }
            sender_email = extract_email(info.get('from', ''))
            response_type = classify_inbound(info)
            if is_internal_sender(sender_email) and 'automatic reply' in (info.get('subject', '') or '').lower():
                response_type = 'auto'
            append_response_log(matched_email, info, response_type, projects)
            if response_type == 'valid':
                update_response_in_log(matched_email, dt.date.today().isoformat(), sender_email, 'valid')
                notify_valid_response(state, info, matched_email, projects)
                log({'status': 'inbound_valid_response', 'email': matched_email, 'threadId': thread_id, 'mode': state['mode']})
            elif response_type == 'bounce':
                update_response_in_log(matched_email, dt.date.today().isoformat(), sender_email, 'bounce')
                log({'status': 'inbound_bounce', 'email': matched_email, 'threadId': thread_id, 'mode': state['mode']})
            else:
                log({'status': 'inbound_ignored', 'threadId': thread_id, 'classification': response_type, 'from': info.get('from', ''), 'mode': state['mode']})
            newly_seen.add(msg_id)
    state['seenInboundMessageIds'] = sorted(newly_seen)[-1000:]
    save_state(state)


def candidate_limit(state):
    return TEST_BATCH_LIMIT if state['mode'] == 'test' else LIVE_BATCH_LIMIT


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
        info = unique_map.get(email.lower()) or unique_map.get(source_email)
        if not info:
            log({'status': 'test_group_skipped_missing_info', 'email': email, 'sourceEmail': source_email})
            continue
        projects = info.get('projects', [])
        if not projects:
            log({'status': 'test_group_skipped_no_projects', 'email': email, 'sourceEmail': source_email})
            continue
        greeting = info.get('firstName', '').strip()
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


def send_explicit_sample(state, unique_map, templates, sample_email, sample_template):
    info = unique_map.get(sample_email.lower())
    if not info:
        raise ValueError(f'Sample email not found in unique map: {sample_email}')
    projects = info.get('projects', [])
    if not projects:
        raise ValueError(f'No projects found for sample email: {sample_email}')
    template = templates.get(sample_template, templates['template1'])
    greeting = info.get('firstName', '').strip()
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


def apply_greeting(template_text, greeting_value):
    if greeting_value and greeting_value.lower() not in {'there', 'team'}:
        return template_text.replace('{{ contact.firstname }}', greeting_value)
    return re.sub(r'Dear\s+\{\{\s*contact\.firstname\s*\}\},', 'Hello,', template_text)


def apply_project_pluralization(template_text, project_count):
    if project_count > 1:
        text = template_text.replace('this project', 'these projects')
        text = text.replace('this or any other projects', 'these or any other projects')
        return text
    return template_text


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


def main():
    state = load_state()
    if not state.get('enabled', False):
        log({'status': 'skipped', 'reason': 'disabled'})
        return

    now = dt.datetime.now()
    rows = load_outreach_rows()
    allowed_confidence = set(state.get('confidenceLevels', ['High', 'Medium', 'Low']))
    contact_profiles = load_contact_profiles()
    excavation_confidence = load_excavation_confidence()
    unique_map_all = unique_email_projects(contact_profiles, excavation_confidence, {'High', 'Medium', 'Low'})
    unique_map = unique_email_projects(contact_profiles, excavation_confidence, allowed_confidence)
    monitor_inbound(state, unique_map_all, rows)

    templates = load_templates()
    generate_group = os.environ.get('PLANHUBGUY_GENERATE_TEST_GROUP', '').strip()
    if generate_group:
        balanced = os.environ.get('PLANHUBGUY_BALANCED_TEST_GROUP') == '1'
        generate_test_group(state, unique_map_all, int(generate_group or '10'), excavation_confidence, balanced=balanced)
        return
    if os.environ.get('PLANHUBGUY_RUN_TEST_GROUP') == '1':
        run_test_group(state, unique_map, templates)
        return
    sample_email = os.environ.get('PLANHUBGUY_SAMPLE_EMAIL', '').strip()
    sample_template = os.environ.get('PLANHUBGUY_SAMPLE_TEMPLATE', 'template1').strip() or 'template1'
    if sample_email:
        send_explicit_sample(state, unique_map, templates, sample_email, sample_template)
        return

    manual_run = os.environ.get('PLANHUBGUY_MANUAL') == '1'
    if now.hour < 15 and not manual_run:
        log({'status': 'partial', 'reason': 'before_3pm_inbound_only', 'mode': state['mode']})
        return

    subject_tpl = templates['template1']['subject']
    body_tpl = templates['template1']['body']
    sent_hist = outreach_history(rows)
    new_entries = []
    limit = candidate_limit(state)
    processed = 0

    for email, info in sorted(unique_map.items()):
        if processed >= limit:
            break
        projects = [p for p in info['projects'] if p not in sent_hist[email]]
        if not projects:
            continue
        project_text = format_project_phrase(projects)
        greeting = info.get('firstName', '').strip()
        subject = subject_tpl.replace('[Project Name]', projects[0])
        body = apply_project_pluralization(apply_greeting(body_tpl, greeting), len(projects)).replace('[Project Name]', project_text)
        html_body = render_email_html(body)
        try:
            meta = deliver_email(state, email, subject, html_body, 'template1', ' | '.join(projects), 'PlanHubGuy initial outreach')
            new_entries.append([email, info['title'], now.date().isoformat(), 'template1', ' | '.join(projects), meta.get('messageId', ''), meta.get('threadId', ''), '', '', f'PlanHubGuy initial outreach ({state["mode"]})', 'Active', 'Initial'])
            processed += 1
            log({'status': 'sent', 'email': email, 'projects': projects, 'mode': state['mode']})
        except Exception as exc:
            log({'status': 'send_failed', 'email': email, 'error': str(exc), 'mode': state['mode']})
    append_outreach_log(new_entries)
    if state['mode'] == 'test' and processed >= limit:
        append_test_log('test', 'batch_limited', '', '', f'Processed first {limit} candidates', '', '', 'Stopped intentionally to keep test runs small and safe')

    rows = load_outreach_rows()
    followup_processed = 0
    for idx, row in enumerate(rows[1:], start=2):
        if followup_processed >= limit:
            break
        email = (row[0] if len(row) > 0 else '').strip().lower()
        sent = (row[2] if len(row) > 2 else '').strip()
        projects = (row[4] if len(row) > 4 else '').strip()
        response_date = (row[7] if len(row) > 7 else '').strip()
        status = (row[10] if len(row) > 10 else '').strip() or 'Active'
        stage = (row[11] if len(row) > 11 else '').strip() or 'Initial'
        if not email or not sent or response_date or status in {'Replied', 'Bounced', 'Closed', 'Do Not Contact'}:
            continue
        try:
            sent_dt = dt.date.fromisoformat(sent)
        except Exception:
            continue
        age = (now.date() - sent_dt).days
        if stage == 'Initial' and age >= 14:
            project_list = [p.strip() for p in projects.split(' | ') if p.strip()]
            subject = templates['template2']['subject'].replace('[Project Name]', project_list[0] if project_list else 'Project')
            body = apply_project_pluralization(apply_greeting(templates['template2']['body'], unique_map.get(email, {}).get('firstName', '')), len(project_list)).replace('[Project Name]', format_project_phrase(project_list))
            html_body = render_email_html(body)
            try:
                meta = deliver_email(state, email, subject, html_body, 'template2', projects, 'PlanHubGuy follow-up 1')
                sheet_update(f'Outreach Log!C{idx}:L{idx}', [[now.date().isoformat(), 'template2', projects, meta.get('messageId', ''), meta.get('threadId', ''), '', '', f'PlanHubGuy follow-up 1 ({state["mode"]})', 'Active', 'FollowUp1']])
                followup_processed += 1
                log({'status': 'followup1_sent', 'email': email, 'mode': state['mode']})
            except Exception as exc:
                log({'status': 'followup1_failed', 'email': email, 'error': str(exc), 'mode': state['mode']})
        elif stage in {'Initial', 'FollowUp1'} and age >= 28:
            project_list = [p.strip() for p in projects.split(' | ') if p.strip()]
            subject = templates['template3']['subject'].replace('[Project Name]', project_list[0] if project_list else 'Project')
            body = apply_project_pluralization(apply_greeting(templates['template3']['body'], unique_map.get(email, {}).get('firstName', '')), len(project_list)).replace('[Project Name]', format_project_phrase(project_list))
            html_body = render_email_html(body)
            try:
                meta = deliver_email(state, email, subject, html_body, 'template3', projects, 'PlanHubGuy final follow-up')
                sheet_update(f'Outreach Log!C{idx}:L{idx}', [[now.date().isoformat(), 'template3', projects, meta.get('messageId', ''), meta.get('threadId', ''), '', '', f'PlanHubGuy final follow-up ({state["mode"]})', 'Closed', 'FinalFollowUp']])
                followup_processed += 1
                log({'status': 'followup_final_sent', 'email': email, 'mode': state['mode']})
            except Exception as exc:
                log({'status': 'followup_final_failed', 'email': email, 'error': str(exc), 'mode': state['mode']})


if __name__ == '__main__':
    main()
