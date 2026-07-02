#!/usr/bin/env python3
import argparse
import datetime as dt
import sys
import base64
import html
import importlib.util
import json
import os
import re
import sys
import time
from pathlib import Path

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

RUNNER_PATH = SCRIPT_DIR / 'planhubguy-runner.py'
spec = importlib.util.spec_from_file_location('planhubguy_runner', RUNNER_PATH)
if spec is None or spec.loader is None:
    raise RuntimeError(f'Unable to load runner module from {RUNNER_PATH}')
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)  # type: ignore[attr-defined]

DEFAULT_QUEUE_LIMIT = 50
SOQ_CANDIDATE_PATHS = [
    # Stable uploaded copy Dave provided for PlanHubGuy on 2026-05-06.
    Path('/home/davesalter/.openclaw/workspace/mission-control/data/planhubguy/DRS_Statement_of_Qualifications.pdf'),
    # Older asset locations kept as fallbacks for existing installs.
    Path('/home/davesalter/.openclaw/workspace/mission-control/assets/DRS-Statement-of-Qualifications.pdf'),
    Path('/home/davesalter/.openclaw/workspace/mission-control/assets/DRS Statement of Qualifications.pdf'),
]
LABEL_NAME_CACHE = {}


def decode_body_data(data: str) -> str:
    if not data:
        return ''
    pad = '=' * ((4 - len(data) % 4) % 4)
    raw = base64.urlsafe_b64decode((data + pad).encode('ascii'))
    for enc in ('utf-8', 'latin-1'):
        try:
            return raw.decode(enc)
        except Exception:
            continue
    return raw.decode('utf-8', errors='replace')


def strip_html(value: str) -> str:
    text = re.sub(r'<br\s*/?>', '\n', value or '', flags=re.I)
    text = re.sub(r'</p\s*>', '\n\n', text, flags=re.I)
    text = re.sub(r'<[^>]+>', '', text)
    text = html.unescape(text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


def collect_parts(part: dict):
    found = {'plain': [], 'html': []}
    mime = (part.get('mimeType') or '').lower()
    body = part.get('body') or {}
    data = body.get('data') or ''
    if mime == 'text/plain' and data:
        found['plain'].append(decode_body_data(data))
    elif mime == 'text/html' and data:
        found['html'].append(decode_body_data(data))
    for child in part.get('parts') or []:
        nested = collect_parts(child)
        found['plain'].extend(nested['plain'])
        found['html'].extend(nested['html'])
    return found


def suppress_quoted_original(text: str) -> str:
    value = (text or '').replace('\r\n', '\n').replace('\r', '\n').strip()
    if not value:
        return value

    patterns = [
        r'\nFrom:\s*.*(?:dave@drs-engineering\.net|Dave@drs-engineering\.net|DRS@DRS-Engineering\.net|DRS@drs-engineering\.net).*',
        r'\nSent:\s*.*\nTo:\s*.*\nSubject:\s*(?:Re:\s*)?Regarding .*',
        r'\nOn .+?wrote:\s*.*',
        r'\n[- ]*Original Message[- ]*\n.*',
        r'\nSubject:\s*(?:\[External\]\s*)?(?:Re:\s*)?Regarding .*',
        r'\nYou don\'t often get email from .*',
    ]
    for pattern in patterns:
        trimmed = re.split(pattern, value, maxsplit=1, flags=re.I | re.S)[0].strip()
        if trimmed and trimmed != value:
            value = trimmed
            break

    value = re.sub(r'\n{3,}', '\n\n', value).strip()
    return value


def message_text(message: dict) -> str:
    payload = message.get('payload') or {}
    parts = collect_parts(payload)
    if parts['plain']:
        return '\n\n'.join(p.strip() for p in parts['plain'] if p.strip()).strip()
    if parts['html']:
        return '\n\n'.join(strip_html(p) for p in parts['html'] if p.strip()).strip()
    body = payload.get('body') or {}
    data = body.get('data') or ''
    if data:
        return strip_html(decode_body_data(data))
    return message.get('snippet', '') or ''


def header_map(message: dict) -> dict:
    headers = (message.get('payload') or {}).get('headers') or []
    return { (h.get('name') or '').lower(): h.get('value') or '' for h in headers }


def classify_labels(labels):
    labels = labels or []
    return {
        'isFollowUp': 'Follow up' in labels,
        'isAutomatic': 'Automatic Reply' in labels,
        'isPossibleWork': 'Possible Work' in labels,
        'isResponded': 'Responded' in labels,
        'isUnread': 'UNREAD' in labels,
        'isSpam': 'SPAM' in labels,
        'isInbox': 'INBOX' in labels,
    }


def label_name_map():
    global LABEL_NAME_CACHE
    if LABEL_NAME_CACHE:
        return LABEL_NAME_CACHE
    payload = json.loads(runner.run('gog', 'gmail', 'labels', 'list', '-a', runner.INBOUND_ACCOUNT, '-j'))
    LABEL_NAME_CACHE = {item.get('id', ''): item.get('name', '') for item in payload.get('labels', []) if item.get('id')}
    return LABEL_NAME_CACHE


def display_labels(message: dict, fallback=None):
    raw_labels = fallback if fallback is not None else message.get('labelIds', [])
    names = []
    mapping = label_name_map()
    for item in raw_labels or []:
        names.append(mapping.get(item, item))
    return names


ACKNOWLEDGMENT_PATTERNS = [
    r'\breacted to your message\b',
    r'^\s*(thank you|thanks|thx)[\s,!.]*(dave|david)?[\s,!.]*$',
    r'^\s*(you are|you\'re)\s+(very\s+)?welcome[\s,!.]*',
    r'^\s*not a problem[\s,!.]*',
    r'^\s*no problem[\s,!.]*',
    r'^\s*my pleasure[\s,!.]*',
    r'^\s*sounds good[\s,!.]*',
    r'^\s*got it[\s,!.]*',
    r'^\s*received[\s,!.]*',
]

AUTO_REPLY_PATTERNS = [
    r'\bout of (the )?office\b',
    r'\bautomatic reply\b',
    r'\bauto[- ]?reply\b',
    r'\baway from the office\b',
    r'\bcurrently away\b',
    r'\bcurrently unavailable\b',
    r'\bwill be out\b',
    r'\breturn to the office\b',
    r'\breturning to the office\b',
    r'\bduring my absence\b',
    r'\bin my absence\b',
    r'\blimited (access to )?email\b',
    r'\bwill return on\b',
]


def is_auto_reply_text(text: str) -> bool:
    value = (text or '').lower()
    return any(re.search(pattern, value, flags=re.I) for pattern in AUTO_REPLY_PATTERNS)


def is_closing_acknowledgment(text: str) -> bool:
    value = suppress_quoted_original(text or '').strip()
    if not value:
        return False
    first_lines = [line.strip() for line in value.splitlines() if line.strip()]
    lead = '\n'.join(first_lines[:3]).strip()
    lead_lower = lead.lower()
    first_line_lower = first_lines[0].lower() if first_lines else ''
    if any(re.search(pattern, first_line_lower, flags=re.I) for pattern in ACKNOWLEDGMENT_PATTERNS):
        return True
    if re.search(r'\b(you are|you\'re)\s+(very\s+)?welcome\b', lead_lower, flags=re.I):
        return True
    # Conservative fallback for very short acknowledgement-only messages before signatures.
    words = re.findall(r'[A-Za-z]+', first_line_lower)
    if len(words) <= 8 and any(word in {'thanks', 'thank', 'welcome', 'problem'} for word in words):
        return True
    return False


def is_response_to_internal_followup(thread_id: str, message_id: str) -> bool:
    if not thread_id or not message_id:
        return False
    thread = runner.thread_details(thread_id, use_cache=False)
    return runner.thread_has_internal_reply_before(thread, message_id)


def fetch_queue(label: str, include_responded: bool, max_results: int):
    query_parts = [f'label:"{label}"', 'in:anywhere']
    if not include_responded:
        query_parts.append('-label:"Responded"')
    query = ' '.join(query_parts)
    payload = json.loads(runner.run('gog', 'gmail', 'messages', 'search', query, '-a', runner.INBOUND_ACCOUNT, '-j', '--all', '--max', str(max_results)))
    items = []
    for hit in (payload.get('messages', []) or [])[:max_results]:
        msg_id = hit.get('id', '')
        thread_id = hit.get('threadId', '')
        if not msg_id or not thread_id:
            continue
        thread = runner.thread_details(thread_id)
        normalized = False
        for thread_message in thread.get('messages', []) or []:
            headers_for_normalize = header_map(thread_message)
            labels_for_normalize = display_labels(thread_message)
            if normalize_message_labels({
                'id': thread_message.get('id', ''),
                'from': headers_for_normalize.get('from', ''),
                'labels': labels_for_normalize,
            }):
                normalized = True
        if normalized:
            thread = runner.thread_details(thread_id)
        message = next((m for m in thread.get('messages', []) if m.get('id') == msg_id), None)
        if not message:
            continue
        headers = header_map(message)
        # Use the freshly fetched message labels, not the original search-hit
        # fallback. Gmail search results can lag after a label mutation; using
        # stale hit labels here made closed/responded contacts appear to remain
        # in the Follow up queue even after the message labels were fixed.
        labels = display_labels(message)
        label_flags = classify_labels(labels)
        if label_flags.get('isResponded') and not include_responded:
            continue
        from_value = headers.get('from', '')
        sender_email = runner.extract_email(from_value)
        if sender_email in runner.INTERNAL_SENDERS:
            continue
        text = message_text(message)
        if sender_email and sender_email not in runner.INTERNAL_SENDERS:
            text = suppress_quoted_original(text)
        response_to_followup = False
        closing_acknowledgment = False
        if label == LABEL_FOLLOW_UP and sender_email and sender_email not in runner.INTERNAL_SENDERS:
            response_to_followup = runner.thread_has_internal_reply_before(thread, msg_id)
            closing_acknowledgment = response_to_followup and is_closing_acknowledgment(text)
        items.append({
            'id': msg_id,
            'threadId': thread_id,
            'date': headers.get('date', ''),
            'from': from_value,
            'fromEmail': sender_email,
            'subject': headers.get('subject', ''),
            'snippet': message.get('snippet', ''),
            'bodyPreview': text[:600],
            'labels': labels,
            'responseToFollowUp': response_to_followup,
            'closingAcknowledgment': closing_acknowledgment,
            **label_flags,
        })
    return {'items': items, 'query': query}


def thread_view(thread_id: str, selected_message_id: str = ''):
    runner.clear_thread_cache(thread_id)
    thread = runner.thread_details(thread_id, use_cache=False)
    normalized = False
    for thread_message in thread.get('messages', []) or []:
        headers_for_normalize = header_map(thread_message)
        labels_for_normalize = display_labels(thread_message)
        if normalize_message_labels({
            'id': thread_message.get('id', ''),
            'from': headers_for_normalize.get('from', ''),
            'labels': labels_for_normalize,
        }):
            normalized = True
    if normalized:
        runner.clear_thread_cache(thread_id)
        thread = runner.thread_details(thread_id, use_cache=False)
    messages = []
    for message in thread.get('messages', []):
        headers = header_map(message)
        labels = display_labels(message)
        text = message_text(message)
        if runner.extract_email(headers.get('from', '')) not in runner.INTERNAL_SENDERS:
            text = suppress_quoted_original(text)
        response_to_followup = runner.thread_has_internal_reply_before(thread, message.get('id', '')) if runner.extract_email(headers.get('from', '')) not in runner.INTERNAL_SENDERS else False
        closing_acknowledgment = response_to_followup and is_closing_acknowledgment(text)
        messages.append({
            'id': message.get('id', ''),
            'threadId': thread_id,
            'from': headers.get('from', ''),
            'fromEmail': runner.extract_email(headers.get('from', '')),
            'to': headers.get('to', ''),
            'subject': headers.get('subject', ''),
            'date': headers.get('date', ''),
            'messageIdHeader': headers.get('message-id', ''),
            'labels': labels,
            'snippet': message.get('snippet', ''),
            'bodyText': text,
            'responseToFollowUp': response_to_followup,
            'closingAcknowledgment': closing_acknowledgment,
            **classify_labels(labels),
        })
    selected = next((m for m in messages if m['id'] == selected_message_id), None) or (messages[-1] if messages else None)
    return {
        'threadId': thread_id,
        'messages': messages,
        'selected': selected,
        'soqAttachmentAvailable': bool(find_soq_attachment()),
    }


def detect_name(from_value: str) -> str:
    text = (from_value or '').strip()
    if '<' in text:
        text = text.split('<', 1)[0].strip().strip('"')
    if not text or '@' in text:
        return ''
    first = re.split(r'[\s,]+', text)[0].strip()
    return first.title() if first else ''


def project_title_from_subject(subject: str) -> str:
    value = re.sub(r'^\s*(re|fw|fwd):\s*', '', subject or '', flags=re.I).strip()
    value = re.sub(r'^\s*\[external\]\s*', '', value, flags=re.I).strip()
    value = re.sub(r'^\s*regarding\s+', '', value, flags=re.I).strip()
    return value


def first_sentence(text: str, limit: int = 180) -> str:
    cleaned = re.sub(r'\s+', ' ', text or '').strip()
    if not cleaned:
        return ''
    match = re.search(r'(.+?[.!?])\s+', cleaned)
    sentence = (match.group(1) if match else cleaned).strip()
    if len(sentence) > limit:
        sentence = sentence[:limit].rsplit(' ', 1)[0].rstrip(',;:') + '…'
    return sentence


def extract_forward_contact(body: str) -> str:
    # Common wording: "I have cc'd Jane Doe", "I've copied John", etc.
    patterns = [
        r"(?:cc'?d|copied|included)\s+(?:the\s+)?(?:project\s+manager\s+)?([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){0,3})",
        r"(?:pass|forward|send)\s+(?:your|our)\s+information\s+(?:on\s+)?to\s+(?:our\s+)?(?:chief\s+)?(?:civil\s+)?(?:engineer\s+)?([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){0,3})",
        r"(?:pass|forward|send)\s+(?:your|our)\s+information\s+(?:on\s+)?to\s+(?:our\s+)?(?:chief\s+)?(?:civil\s+)?(?:engineer|manager|director)\s*,\s*([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){0,3})",
        r"(?:project\s+manager|owner|developer|engineer)\s+(?:is|will be)\s+([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){0,3})",
    ]
    for pattern in patterns:
        match = re.search(pattern, body or '')
        if match:
            name = match.group(1).strip().rstrip('.,;:')
            if name.lower() not in {'in', 'on', 'for', 'this', 'case', 'there'}:
                return name
    return ''


def extract_redirect_target(body: str) -> str:
    # "Please reach out to Elevate", "contact Yasser", "talk to the GC", etc.
    # Keep this conservative: only return short names/orgs, not whole sentences.
    patterns = [
        r"(?:reach out to|contact|follow up with|talk to|connect with)\s+([A-Z][A-Za-z0-9&.'\-/ ]{1,60})",
        r"(?:please use|submit through|go through)\s+([A-Z][A-Za-z0-9&.'\-/ ]{1,60})",
    ]
    stop_words = {'the', 'our', 'their', 'project', 'team', 'website', 'portal', 'procurement'}
    for pattern in patterns:
        match = re.search(pattern, body or '')
        if not match:
            continue
        target = match.group(1).strip().rstrip('.,;:')
        target = re.split(r'\s+(?:for|about|regarding|and|or|if|when)\b', target, maxsplit=1, flags=re.I)[0].strip().rstrip('.,;:')
        if target and target.lower() not in stop_words and len(target.split()) <= 5:
            return target
    return ''


def possible_work_reply_detail(body: str, subject: str) -> str:
    body_lower = (body or '').lower()
    lead_sentence = first_sentence(body)
    forwarded_name = extract_forward_contact(body)
    redirect_target = extract_redirect_target(body)

    # Start with negative / wrong-contact signals. These must not fall through to
    # the generic "we would be glad to help" language, which is exactly what made
    # several suggested replies feel tone-deaf.
    if any(phrase in body_lower for phrase in [
        'not involved', 'not invloved', 'not our project', 'not my project',
        'did not get that project', 'didn’t get that project', "don't think we are the one",
        'not the one you want', 'wrong person', 'incorrect contact', 'not associated',
        'not associated with this project', 'nothing to do with this project',
        'we are the electrical engineers', 'electrical engineers on this project',
        'we are electrical', 'not the architect', 'not the owner', 'not the gc',
    ]):
        return (
            'Thank you for the update, and apologies for bothering you. '
            'It looks like our information must be incorrect.'
        )

    if any(phrase in body_lower for phrase in ['cd phase', 'construction document', 'construction documents', 'not yet started', 'has not yet started', 'not started', 'not under contract', 'no current projects']) and any(phrase in body_lower for phrase in ['contact info', 'contact information', 'on file', 'keep your information', 'keep you in mind', 'keep you in mind if a need arises']):
        return (
            'Thank you for the update, and for keeping our information on file. '
            'Please feel free to reach out when the project moves further into design or if earth-retention, shoring, underpinning, or specialty-foundation support would be useful.'
        )

    if any(phrase in body_lower for phrase in ["cc'd", 'cc’d', 'copied', 'included']) and any(phrase in body_lower for phrase in ['project manager', 'overseeing', 'manager overseeing']):
        target = f' {forwarded_name}' if forwarded_name else ' the project manager'
        return (
            f'Thank you for copying{target} on this. '
            'That is exactly the right person for us to connect with. '
            'If earth retention, shoring, underpinning, or specialty foundation design becomes useful as the project develops, we would be glad to help.'
        )

    if any(phrase in body_lower for phrase in ['retain your information', 'retain you information', 'keep your information', 'keep you in mind', 'keep this on file']):
        context = ''
        if any(phrase in body_lower for phrase in ['funding', 'uncertain', 'potential construction', 'closer to construction']):
            context = ' I understand the timing/funding is still developing.'
        return (
            f'Thank you for the update.{context} '
            'I appreciate you keeping DRS in mind, and we would be happy to review the earth-retention or specialty-foundation scope when the project moves closer to design or construction.'
        )

    if any(phrase in body_lower for phrase in ['pass along', 'passed along', 'passed this along', 'pass this along', 'pass your information', 'pass our information', 'forward', 'forwarded', 'share this', 'shared this']):
        if forwarded_name:
            return f'Thank you for passing our information on to {forwarded_name}.'
        return (
            'Thank you for passing on our information.'
        )

    # Portal/procurement guidance should stay short. Do not add another sales pitch.
    if any(phrase in body_lower for phrase in ['planetbids', 'bidnet', 'bid portal', 'procurement', 'website', 'vendor portal', 'bidsync', 'public purchase', 'ebidboard']):
        return (
            'Thank you for the procurement guidance.'
        )

    if any(phrase in body_lower for phrase in ['reach out to', 'connect with', 'best one to contact', 'contact the', 'contact ', 'general contractor', 'gc', 'contractor', 'construction manager', 'project manager']):
        if redirect_target:
            return (
                f'Thank you for pointing me in the right direction. I will follow up with {redirect_target}.'
            )
        return (
            'Thank you for pointing me in the right direction. '
            'I will follow up with the appropriate project/contact team.'
        )

    if any(phrase in body_lower for phrase in ['awarded', 'award', 'selected for the project', 'got the project']):
        return (
            'Thank you for the update. Congratulations on the award — we look forward to the opportunity to support the team where DRS can be useful.'
        )

    if any(phrase in body_lower for phrase in ['not needed', 'not at this time', 'already selected', 'already awarded', 'no need']):
        return (
            'Understood, and thank you for clarifying the status. '
            'If the scope changes or another project needs earth-retention, shoring, underpinning, or specialty-foundation support, please feel free to keep DRS in mind.'
        )

    if lead_sentence:
        return (
            'Thank you for getting back to me. I appreciate the update. '
            'Please keep DRS in mind if earth-retention, shoring, underpinning, or specialty-foundation support would be useful in the future.'
        )

    return (
        'Thank you for getting back to me. I appreciate the update. '
        'Please keep DRS in mind if earth-retention, shoring, underpinning, or specialty-foundation support would be useful in the future.'
    )


def possible_work_should_attach_soq(body: str) -> bool:
    body_lower = (body or '').lower()
    positive_file_or_timing = [
        'contact info', 'contact information', 'on file', 'retain your information',
        'retain you information', 'keep your information', 'keep you in mind',
        'keep this on file', 'cd phase', 'construction document', 'construction documents',
        'not yet started', 'has not yet started', 'potential construction', 'closer to construction',
    ]
    forwarded_to_team = ["cc'd", 'cc’d', 'copied', 'included', 'pass along', 'passed along', 'passed this along', 'pass this along', 'forward', 'forwarded', 'share this', 'shared this']
    portal_only = ['planetbids', 'bidnet', 'bid portal', 'procurement', 'vendor portal', 'bidsync']
    decline = ['not needed', 'not at this time', 'already selected', 'already awarded', 'not involved', 'no need']
    wrong_contact = [
        'not invloved', 'not our project', 'not my project', 'did not get that project',
        'didn’t get that project', "don't think we are the one", 'not the one you want',
        'wrong person', 'incorrect contact', 'not associated', 'electrical engineers on this project',
    ]
    if any(phrase in body_lower for phrase in wrong_contact):
        return False
    if any(phrase in body_lower for phrase in decline):
        return False
    if any(phrase in body_lower for phrase in positive_file_or_timing):
        return True
    if any(phrase in body_lower for phrase in forwarded_to_team):
        return True
    if any(phrase in body_lower for phrase in portal_only):
        return False
    return False


SOQ_SENTENCE = 'Please find attached our Statement of Qualifications for your information. Please feel free to share it as you see fit.'


def ensure_soq_sentence_before_signoff(body: str) -> str:
    value = (body or '').replace('\r\n', '\n').replace('\r', '\n').strip()
    if not value or re.search(r'statement of qualifications|\bSOQ\b', value, flags=re.I):
        return value
    match = re.search(r'\n\s*(thanks|thank you|regards|best regards)\s*,?\s*$', value, flags=re.I)
    if match:
        return f'{value[:match.start()].rstrip()}\n\n{SOQ_SENTENCE}\n\n{value[match.start():].lstrip()}'.strip()
    return f'{value}\n\n{SOQ_SENTENCE}'.strip()


def find_soq_attachment() -> str:
    env_path = os.environ.get('PLANHUBGUY_SOQ_PATH', '').strip()
    candidates = [Path(env_path)] if env_path else []
    candidates.extend(SOQ_CANDIDATE_PATHS)
    for path in candidates:
        if path and path.exists() and path.is_file():
            return str(path)
    return ''


def suggest_reply(message: dict):
    from_value = message.get('from', '')
    subject = message.get('subject', '')
    body = (message.get('bodyText') or message.get('snippet') or '').strip()
    body_lower = body.lower()
    labels = [str(x) for x in (message.get('labels') or [])]
    label_names = {l.strip().lower() for l in labels}
    name = detect_name(from_value)
    greeting = f'{name},' if name else 'Hello,'

    response_to_followup = bool(message.get('responseToFollowUp'))
    closing_acknowledgment = bool(message.get('closingAcknowledgment'))

    # Always analyze the actual inbound text. Previously ordinary Follow up
    # replies, especially replies to our follow-up emails, fell back to a generic
    # response even when the contact had given specific instructions or context.
    detail = possible_work_reply_detail(body, subject)

    configured_soq_path = find_soq_attachment()

    if is_auto_reply_text(body):
        return {
            'body': 'No reply recommended. This appears to be an automatic/out-of-office reply. Mark it Automatic Reply, not Follow up.',
            'soqAttachmentPath': '',
            'attachmentAvailable': False,
            'attachmentConfigured': bool(configured_soq_path),
            'shouldAttachSoq': False,
            'attachmentReason': 'No reply recommended for automatic/out-of-office text.',
            'noReplyRecommended': True,
        }

    if closing_acknowledgment:
        return {
            'body': 'No reply recommended. This appears to be a brief acknowledgement or reaction to our previous follow-up. Mark it Responded / close it unless you want to add a personal note.',
            'soqAttachmentPath': '',
            'attachmentAvailable': False,
            'attachmentConfigured': bool(configured_soq_path),
            'shouldAttachSoq': False,
            'attachmentReason': 'No reply recommended for a closing acknowledgement.',
            'noReplyRecommended': True,
        }

    if any(phrase in body_lower for phrase in ['wrong person', 'no longer with', 'moved on', 'retired', 'out of date', 'incorrect']):
        detail = 'It looks like our contact information may have been out of date. Thank you for letting us know. If there is a better project contact, I would appreciate being pointed in the right direction; otherwise please keep DRS in mind where earth-retention or specialty-foundation support may be useful.'

    lines = [greeting, '', detail]

    # Attach SOQ when the reply context calls for it. For Possible Work replies,
    # Dave wants the SOQ included for context-positive "keep info on file" / timing
    # responses even if the message is technically a response to earlier outreach.
    soq_path = ''
    attach_soq = (
        possible_work_should_attach_soq(body)
        or ((not response_to_followup) and any(l.strip().lower() in {'follow up', 'retained info'} for l in labels))
    )
    attachment_reason = ''
    if attach_soq:
        soq_path = configured_soq_path
        if soq_path:
            lines.extend(['', SOQ_SENTENCE])
            attachment_reason = 'SOQ will be attached to this reply.'
        else:
            attachment_reason = 'SOQ should be attached, but no configured SOQ file was found on this machine.'
    elif response_to_followup:
        attachment_reason = 'SOQ is configured, but this response does not call for attaching it.'
    else:
        attachment_reason = 'SOQ is configured, but this reply type does not call for an attachment.'

    lines.extend(['', 'Thanks'])
    return {
        'body': '\n'.join(lines).strip(),
        'soqAttachmentPath': soq_path,
        'attachmentAvailable': bool(soq_path),
        'attachmentConfigured': bool(configured_soq_path),
        'shouldAttachSoq': bool(attach_soq),
        'attachmentReason': attachment_reason,
    }


def classify_message(message_id: str, label: str):
    label = (label or '').strip()
    # Supported labels per current workflow
    if label not in {LABEL_FOLLOW_UP, LABEL_AUTOMATIC_REPLY, LABEL_BAD_EMAIL, LABEL_RESPONDED, LABEL_POSSIBLE_WORK}:
        raise RuntimeError('Unsupported label')
    if label == LABEL_FOLLOW_UP:
        remove_labels = [LABEL_AUTOMATIC_REPLY, LABEL_BAD_EMAIL, LABEL_RESPONDED, LABEL_POSSIBLE_WORK]
    elif label == LABEL_AUTOMATIC_REPLY:
        remove_labels = [LABEL_FOLLOW_UP, LABEL_BAD_EMAIL, LABEL_RESPONDED, LABEL_POSSIBLE_WORK]
    elif label == LABEL_BAD_EMAIL:
        remove_labels = [LABEL_FOLLOW_UP, LABEL_AUTOMATIC_REPLY, LABEL_RESPONDED, LABEL_POSSIBLE_WORK]
    elif label == LABEL_POSSIBLE_WORK:
        remove_labels = [LABEL_FOLLOW_UP, LABEL_AUTOMATIC_REPLY, LABEL_BAD_EMAIL, LABEL_RESPONDED]
    else:  # Responded
        remove_labels = [LABEL_FOLLOW_UP, LABEL_AUTOMATIC_REPLY, LABEL_BAD_EMAIL, LABEL_POSSIBLE_WORK]
    args = ['gog', 'gmail', 'batch', 'modify', message_id, '-a', runner.INBOUND_ACCOUNT, '--add', label]
    for remove_label in remove_labels:
        args.extend(['--remove', remove_label])
    args.append('-y')
    runner.run(*args)
    return {'ok': True, 'messageId': message_id, 'label': label}


def normalize_message_labels(message: dict):
    message_id = message.get('id', '')
    if not message_id:
        return False
    labels = message.get('labels', []) or []
    from_email = runner.extract_email(message.get('from', ''))
    changed = False
    if LABEL_RESPONDED in labels and LABEL_FOLLOW_UP in labels:
        runner.run('gog', 'gmail', 'batch', 'modify', message_id, '-a', runner.INBOUND_ACCOUNT, '--remove', 'Follow up', '-y')
        changed = True
    if LABEL_RESPONDED in labels and LABEL_AUTOMATIC_REPLY in labels:
        runner.run('gog', 'gmail', 'batch', 'modify', message_id, '-a', runner.INBOUND_ACCOUNT, '--remove', 'Automatic Reply', '-y')
        changed = True
    if LABEL_RESPONDED in labels and LABEL_BAD_EMAIL in labels:
        runner.run('gog', 'gmail', 'batch', 'modify', message_id, '-a', runner.INBOUND_ACCOUNT, '--remove', 'Bad Email', '-y')
        changed = True
    if from_email in runner.INTERNAL_SENDERS and LABEL_FOLLOW_UP in labels:
        runner.run('gog', 'gmail', 'batch', 'modify', message_id, '-a', runner.INBOUND_ACCOUNT, '--remove', 'Follow up', '-y')
        changed = True
    return changed


def normalize_thread_labels(thread_id: str):
    view = thread_view(thread_id)
    changed_ids = []
    messages = view.get('messages', [])
    for message in messages:
        if normalize_message_labels(message):
            changed_ids.append(message.get('id', ''))
    return list(dict.fromkeys(changed_ids))


def mark_thread_responded(thread_id: str, message_id: str):
    view = thread_view(thread_id, message_id)
    updated_ids = []
    for message in view.get('messages', []):
        runner.run('gog', 'gmail', 'batch', 'modify', message.get('id', ''), '-a', runner.INBOUND_ACCOUNT, '--remove', LABEL_FOLLOW_UP, '--remove', LABEL_AUTOMATIC_REPLY, '--remove', LABEL_BAD_EMAIL, '--remove', LABEL_POSSIBLE_WORK, '-y')
        updated_ids.append(message.get('id', ''))
    for message in view.get('messages', []):
        runner.run('gog', 'gmail', 'batch', 'modify', message.get('id', ''), '-a', runner.INBOUND_ACCOUNT, '--add', 'Responded', '-y')

    for attempt in range(5):
        refreshed = thread_view(thread_id, message_id)
        selected = refreshed.get('selected') or {}
        selected_labels = selected.get('labels', []) or []
        if LABEL_RESPONDED in selected_labels and LABEL_FOLLOW_UP not in selected_labels and LABEL_AUTOMATIC_REPLY not in selected_labels and LABEL_BAD_EMAIL not in selected_labels and LABEL_POSSIBLE_WORK not in selected_labels:
            return updated_ids
        time.sleep(1.0)

    raise RuntimeError('Reply was sent, but the original follow-up message did not move cleanly to Responded')


def send_reply(thread_id: str, message_id: str, body: str, cc: str = '', force_soq: bool = False):
    view = thread_view(thread_id, message_id)
    selected = view.get('selected')
    if not selected:
        raise RuntimeError('Message not found in thread')
    to_email = runner.extract_email(selected.get('from', ''))
    if not to_email:
        raise RuntimeError('Could not determine reply recipient')
    subject = selected.get('subject', '')
    attachments = []
    draft = suggest_reply(selected)
    if draft.get('attachmentAvailable') and draft.get('soqAttachmentPath'):
        attachments.append(draft['soqAttachmentPath'])
    elif force_soq:
        soq_path = find_soq_attachment()
        if not soq_path:
            raise RuntimeError('SOQ attachment requested, but no configured SOQ file was found')
        attachments.append(soq_path)
    if attachments:
        body = ensure_soq_sentence_before_signoff(body)
    html_body = runner.render_email_html(body)
    raw = runner.gmail_send_raw(
        to_email,
        subject,
        html_body=html_body,
        send_from=runner.SEND_AS,
        reply_to_message_id=message_id,
        attachments=attachments,
        account=runner.SEND_ACCOUNT,
        cc=cc,
    )
    # Log manual reply in Outreach Log (outside automated campaign)
    try:
        note = runner.make_outbound_linkage_note('Manual reply (outside campaign)', subject, to_email)
        row = [[
            to_email.strip().lower(),  # email
            '',                        # title
            dt.date.today().isoformat(),  # date_sent
            'manual-reply',            # template_used
            '',                        # projects_referenced
            '',                        # response_date
            '',                        # response_email
            note,                      # notes
            'Closed',                  # campaign_status (avoid follow-up logic)
            'ManualReply',             # follow_up_stage
            raw.get('id', ''),         # message_id
            raw.get('threadId', ''),   # thread_id
        ]]
        runner.sheet_append('Outreach Log!A:L', row)
    except Exception as exc:
        runner.log({'status': 'manual_reply_outreach_log_append_failed', 'error': str(exc), 'to': to_email, 'threadId': raw.get('threadId', '')})
    updated_ids = mark_thread_responded(thread_id, message_id)
    return {
        'ok': True,
        'threadId': raw.get('threadId', ''),
        'messageId': raw.get('id', ''),
        'attachmentIncluded': bool(attachments),
        'respondedMessageIds': updated_ids,
        'respondedSourceMessageId': message_id,
    }


def main():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest='cmd', required=True)

    list_p = sub.add_parser('list')
    list_p.add_argument('--label', default='Follow up')
    list_p.add_argument('--include-responded', action='store_true')
    list_p.add_argument('--max', type=int, default=DEFAULT_QUEUE_LIMIT)

    thread_p = sub.add_parser('thread')
    thread_p.add_argument('--thread-id', required=True)
    thread_p.add_argument('--message-id', default='')

    draft_p = sub.add_parser('draft')
    draft_p.add_argument('--thread-id', required=True)
    draft_p.add_argument('--message-id', required=True)

    send_p = sub.add_parser('send')
    send_p.add_argument('--thread-id', required=True)
    send_p.add_argument('--message-id', required=True)
    send_p.add_argument('--body-file', required=True)
    send_p.add_argument('--cc', default=os.environ.get('PLANHUBGUY_CC', ''))
    send_p.add_argument('--force-soq', action='store_true')

    close_p = sub.add_parser('close')
    close_p.add_argument('--thread-id', required=True)
    close_p.add_argument('--message-id', required=True)

    classify_p = sub.add_parser('classify')
    classify_p.add_argument('--message-id', required=True)
    classify_p.add_argument('--label', required=True)

    args = parser.parse_args()

    if args.cmd == 'list':
        print(json.dumps(fetch_queue(args.label, args.include_responded, args.max)))
        return
    if args.cmd == 'thread':
        print(json.dumps(thread_view(args.thread_id, args.message_id)))
        return
    if args.cmd == 'draft':
        view = thread_view(args.thread_id, args.message_id)
        selected = view.get('selected')
        if not selected:
            raise RuntimeError('Message not found in thread')
        print(json.dumps(suggest_reply(selected)))
        return
    if args.cmd == 'send':
        body = Path(args.body_file).read_text(encoding='utf-8')
        print(json.dumps(send_reply(args.thread_id, args.message_id, body, cc=args.cc, force_soq=args.force_soq)))
        return
    if args.cmd == 'close':
        updated_ids = mark_thread_responded(args.thread_id, args.message_id)
        print(json.dumps({'ok': True, 'threadId': args.thread_id, 'messageId': args.message_id, 'respondedMessageIds': updated_ids}))
        return
    if args.cmd == 'classify':
        print(json.dumps(classify_message(args.message_id, args.label)))
        return


if __name__ == '__main__':
    main()
