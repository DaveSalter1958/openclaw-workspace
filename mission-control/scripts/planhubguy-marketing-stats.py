#!/usr/bin/env python3
"""Generate PlanHubGuy Marketing Statistics for Mission Control.

Read-only against Google Sheets. Writes local JSON for review; does not update the sheet.
"""
from __future__ import annotations

import collections
import datetime as dt
import importlib.util
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RUNNER_PATH = ROOT / 'scripts' / 'planhubguy-runner.py'
DATED_OUT_PATH = ROOT / 'scripts' / 'tmp' / f'planhubguy-marketing-stats-{dt.date.today():%Y%m%d}.json'
LATEST_OUT_PATH = ROOT / 'data' / 'planhubguy' / 'marketing-stats.json'

START = dt.date(2026, 4, 1)
END = dt.date.today()

# The live Outreach Log is mutable: older Initial rows can later be converted to
# FollowUp rows. For lifetime campaign send counts, use the immutable 2026-05-19
# analysis snapshot as a baseline, then add live rows after that date.
BASELINE_DATE = dt.date(2026, 5, 19)
BASELINE_SENT_ROWS = 3715
BASELINE_INITIAL_EMAILS = 2781
BASELINE_FOLLOWUP1_EMAILS = 751
BASELINE_UNIQUE_INITIAL_CONTACTS = 2523
BASELINE_BAD_EMAIL_ADDRESSES = 191
BASELINE_PUBLIC_CONTACTS = 256
BASELINE_HIGH_CATEGORY_ADDRESSES = 218
BASELINE_MEDIUM_CATEGORY_ADDRESSES = 166
BASELINE_LOW_CATEGORY_ADDRESSES = 2196
BASELINE_UNKNOWN_CATEGORY_ADDRESSES = 122


spec = importlib.util.spec_from_file_location('planhubguy_runner', RUNNER_PATH)
runner = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(runner)  # type: ignore[attr-defined]


def norm_email(value: str) -> str:
    value = (value or '').strip().lower()
    m = re.search(r'([a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,})', value, flags=re.I)
    return m.group(1).lower() if m else value


def parse_date(value: str):
    value = (value or '').strip()
    if not value:
        return None
    for fmt in ('%Y-%m-%d', '%m/%d/%Y', '%m/%d/%y'):
        try:
            return dt.datetime.strptime(value[:10], fmt).date()
        except Exception:
            pass
    try:
        return dt.date.fromisoformat(value[:10])
    except Exception:
        return None


def pct(count: int, denom: int) -> str:
    return '0.00%' if not denom else f'{(count / denom) * 100:.2f}%'


def split_projects(value: str):
    return [p.strip() for p in (value or '').split('|') if p.strip()]


def project_key(value: str) -> str:
    return re.sub(r'\s+', ' ', (value or '').strip().lower())


def highest_level(levels):
    order = {'High': 3, 'Medium': 2, 'Low': 1}
    best = 'Unknown'; best_score = 0
    for level in levels:
        clean = (level or '').strip().title()
        score = order.get(clean, 0)
        if score > best_score:
            best, best_score = clean, score
    return best


def text_blob(row):
    return ' '.join(str(x or '') for x in row).lower()


print('Reading Outreach Log...', flush=True)
outreach = runner.sheet_get('Outreach Log!A1:L12000')
print('Reading Response Log...', flush=True)
responses = runner.sheet_get('Response Log!A1:I12000')
print('Reading PlanHub Leads...', flush=True)
leads = runner.sheet_get('PlanHub Leads!A1:U7000')
print('Reading Excavation Review...', flush=True)
excavation = runner.sheet_get('Excavation Review!A1:F7000')

# Outreach Log has historically had no header row in the active range.
filtered = []
for row in outreach:
    row = list(row) + [''] * (12 - len(row))
    sent_date = parse_date(row[runner.OUTREACH_DATE_SENT])
    if not sent_date or not (START <= sent_date <= END):
        continue
    email = norm_email(row[runner.OUTREACH_EMAIL])
    if not email or '@' not in email:
        continue
    filtered.append({
        'email': email,
        'title': row[runner.OUTREACH_TITLE],
        'date': sent_date.isoformat(),
        'template': row[runner.OUTREACH_TEMPLATE],
        'projects': row[runner.OUTREACH_PROJECTS],
        'responseDate': row[runner.OUTREACH_RESPONSE_DATE],
        'responseEmail': norm_email(row[runner.OUTREACH_RESPONSE_EMAIL]),
        'notes': row[runner.OUTREACH_NOTES],
        'status': row[runner.OUTREACH_STATUS],
        'stage': row[runner.OUTREACH_STAGE],
        'messageId': row[runner.OUTREACH_MESSAGE_ID],
        'threadId': row[runner.OUTREACH_THREAD_ID],
    })

live_initial_rows = [r for r in filtered if (r['template'] or '').strip().lower() == 'template1' or (r['stage'] or '').strip().lower() == 'initial']
post_baseline_rows = [r for r in filtered if parse_date(r['date']) and parse_date(r['date']) > BASELINE_DATE]
post_baseline_initial_rows = [r for r in post_baseline_rows if (r['template'] or '').strip().lower() == 'template1' or (r['stage'] or '').strip().lower() == 'initial']
post_baseline_initial_emails = sorted({r['email'] for r in post_baseline_initial_rows})

# Corrected lifetime counts: 2026-05-19 immutable snapshot + live rows after that date.
# This avoids undercounting when old Outreach Log rows are mutated from Initial to FollowUp.
initial_rows = post_baseline_initial_rows
unique_initial_emails = post_baseline_initial_emails
denominator = BASELINE_UNIQUE_INITIAL_CONTACTS + len(post_baseline_initial_emails)
initial_emails = BASELINE_INITIAL_EMAILS + len(post_baseline_initial_rows)
followup1_emails = BASELINE_FOLLOWUP1_EMAILS + sum(1 for r in post_baseline_rows if (r['template'] or '').strip().lower() == 'template2' or (r['stage'] or '').strip().lower() == 'followup1')
final_followup_emails = sum(1 for r in post_baseline_rows if (r['template'] or '').strip().lower() == 'template3' or (r['stage'] or '').strip().lower() == 'finalfollowup')
auto_followups = followup1_emails + final_followup_emails

bad_statuses = {'bounced', 'bad email'}
post_bad_initial_addresses = sorted({r['email'] for r in post_baseline_initial_rows if (r['status'] or '').strip().lower() in bad_statuses or 'bounce' in (r['notes'] or '').lower() or 'bad email' in (r['notes'] or '').lower()})
bad_initial_address_count = BASELINE_BAD_EMAIL_ADDRESSES + len(post_bad_initial_addresses)

# Response Log classifications, deduped by thread when possible.
response_rows = []
for row in responses:
    row = list(row) + [''] * (9 - len(row))
    received = parse_date(row[1])
    if not received or not (START <= received <= END):
        continue
    response_rows.append(row)

bounce_auto_types = {'bounce', 'automatic', 'automatic reply', 'auto reply', 'out of office'}
wrong_patterns = [
    r'wrong (person|contact|email|department)', r'not (the )?(right|correct) (person|contact)',
    r'not involved', r'no longer involved', r'nothing to do with', r'do not handle',
    r'not our project', r'not associated', r'not part of', r'unsubscribe',
]
pass_patterns = [
    r'pass(ed)? (this|it|your|the information|along|on)', r'forward(ed)? (this|it|your|the information|along|on)',
    r'share(d)? (this|it|your|the information)', r'sent (this|it|your|the information) (to|over)',
    r'cop(y|ied|ying).{0,60}(team|manager|project|pm|owner|architect|contractor)',
    r'keep (you|drs|your information) (in mind|on file)', r'keep.*contact information.*file',
]
procurement_patterns = [
    r'planetbids', r'bidnet', r'public purchase', r'procurement', r'vendor portal', r'portal',
    r'register.{0,40}(vendor|supplier)', r'prequal', r'pre-qual', r'submit.{0,40}(through|via).{0,40}(portal|website)',
]

def dedup_count(patterns):
    seen = set(); examples = []
    for row in response_rows:
        rtype = (row[2] or '').strip().lower()
        if rtype in bounce_auto_types or 'bounce' in rtype or 'automatic' in rtype:
            continue
        blob = text_blob(row)
        if any(re.search(p, blob, re.I) for p in patterns):
            key = row[3] or '|'.join(row[:6])
            if key not in seen:
                seen.add(key)
                if len(examples) < 20:
                    examples.append({'date': row[1], 'type': row[2], 'threadId': row[3], 'sender': row[4], 'subject': row[5], 'snippet': row[6]})
    return len(seen), examples

wrong_count, wrong_examples = dedup_count(wrong_patterns)
pass_count, pass_examples = dedup_count(pass_patterns)
procurement_count, procurement_examples = dedup_count(procurement_patterns)

real_person_response_types = {'valid', 'possible_work'}
real_person_response_threads = set()
real_person_response_examples = []
for row in response_rows:
    rtype = (row[2] or '').strip().lower()
    if rtype not in real_person_response_types:
        continue
    key = row[3] or '|'.join(row[:6])
    if key in real_person_response_threads:
        continue
    real_person_response_threads.add(key)
    if len(real_person_response_examples) < 20:
        real_person_response_examples.append({'date': row[1], 'type': row[2], 'threadId': row[3], 'sender': row[4], 'subject': row[5], 'snippet': row[6]})
real_person_response_count = len(real_person_response_threads)

# PlanHub Leads lookup for public-agency classification.
lead_header = leads[0] if leads else []
lead_rows = leads[1:] if leads and any(h == 'projectName' for h in lead_header) else leads
email_to_leads = collections.defaultdict(list)
for row in lead_rows:
    row = list(row) + [''] * 21
    email = norm_email(row[20])
    if email:
        email_to_leads[email].append(row)

public_domain_re = re.compile(r'(\.gov$|\.edu$|\.k12\.ca\.us$|\.us$)')
public_name_re = re.compile(r'\b(city|county|state of|department of|dept\.? of|school district|unified school district|public works|water district|utility|utilities|authority|agency|municipal|metro|transportation authority|university of|college|community college|fire district|sanitation district|irrigation district)\b', re.I)
private_exclusions = re.compile(r'\b(architect|architecture|developer|development|contractor|builders?|construction|engineering|consultants?|realty|properties|homes|apartments|llc|inc\.?|corp\.?|company)\b', re.I)

def is_public_email(email):
    domain = email.split('@')[-1]
    if domain.endswith('.gov') or domain.endswith('.edu') or domain.endswith('.k12.ca.us'):
        return True
    return False


def is_public_contact(email):
    if is_public_email(email):
        return True
    for row in email_to_leads.get(email, []):
        company = row[11] if len(row) > 11 else ''
        ctype = row[12] if len(row) > 12 else ''
        text = f'{company} {ctype}'
        if public_name_re.search(text) and not private_exclusions.search(company):
            return True
    return False

post_public_initial_addresses = sorted({email for email in post_baseline_initial_emails if is_public_contact(email)})
public_initial_contact_count = BASELINE_PUBLIC_CONTACTS + len(post_public_initial_addresses)

# Excavation category lookup.
project_level = {}
for row in excavation:
    row = list(row) + [''] * 6
    name = project_key(row[0])
    if not name or name in {'projectname', 'yes also step 3'}:
        continue
    level = (row[3] or '').strip().title()
    if level in {'High', 'Medium', 'Low'}:
        project_level[name] = level

email_levels = collections.defaultdict(list)
row_primary_counts = collections.Counter()
row_primary_emails = collections.defaultdict(set)
for r in initial_rows:
    levels = []
    for project in split_projects(r['projects']):
        levels.append(project_level.get(project_key(project), 'Unknown'))
    primary = highest_level(levels)
    row_primary_counts[primary] += 1
    row_primary_emails[primary].add(r['email'])
    email_levels[r['email']].append(primary)

email_primary = {}
for email, levels in email_levels.items():
    email_primary[email] = highest_level(levels)

post_high_addresses = sorted([e for e, lvl in email_primary.items() if lvl == 'High'])
post_medium_addresses = sorted([e for e, lvl in email_primary.items() if lvl == 'Medium'])
post_low_addresses = sorted([e for e, lvl in email_primary.items() if lvl == 'Low'])
post_unknown_addresses = sorted([e for e, lvl in email_primary.items() if lvl == 'Unknown'])
high_address_count = BASELINE_HIGH_CATEGORY_ADDRESSES + len(post_high_addresses)
medium_address_count = BASELINE_MEDIUM_CATEGORY_ADDRESSES + len(post_medium_addresses)
low_address_count = BASELINE_LOW_CATEGORY_ADDRESSES + len(post_low_addresses)
unknown_address_count = BASELINE_UNKNOWN_CATEGORY_ADDRESSES + len(post_unknown_addresses)

stats = [
    {'metric': 'Estimated unique initial-outreach contacts', 'count': denominator, 'percent': '100.00%', 'note': 'Best available count: 2026-05-19 snapshot unique sent contacts plus new post-snapshot initial contacts; exact dedupe against the snapshot address list is unavailable.', 'emphasis': True},
    {'metric': 'Follow-up 1 emails sent', 'count': followup1_emails, 'percent': '—', 'note': 'Count only: rows sent with template2 or FollowUp1 stage.'},
    {'metric': 'Final follow-up emails sent', 'count': final_followup_emails, 'percent': '—', 'note': 'Count only: rows sent with template3 or FinalFollowUp stage.'},
    {'metric': 'Real person responses received', 'count': real_person_response_count, 'percent': pct(real_person_response_count, denominator), 'note': 'Unique Response Log threads classified as valid or possible_work; excludes bounces, automatic replies, and system rows.', 'emphasis': True},
    {'metric': 'Undeliverable / bad email addresses', 'count': bad_initial_address_count, 'percent': pct(bad_initial_address_count, denominator), 'note': '2026-05-19 snapshot bad-address count plus new post-snapshot initial addresses marked bounced or bad email.'},
    {'metric': 'Wrong contact / not involved replies', 'count': wrong_count, 'percent': pct(wrong_count, denominator), 'note': 'Conservative Response Log scan; deduped by thread/reply.'},
    {'metric': 'Contact will pass on DRS information', 'count': pass_count, 'percent': pct(pass_count, denominator), 'note': 'Contact indicated they forwarded, passed along, copied, shared, or kept DRS information on file.', 'emphasis': True},
    {'metric': 'Directed to project/procurement site', 'count': procurement_count, 'percent': pct(procurement_count, denominator), 'note': 'Examples include PlanetBids, BidNet, Public Purchase, and vendor/procurement portals.', 'emphasis': True},
    {'metric': 'Public agency / utility / city contacts', 'count': public_initial_contact_count, 'percent': pct(public_initial_contact_count, denominator), 'note': '2026-05-19 snapshot count plus new post-snapshot initial contacts; private firms on public projects excluded.'},
    {'metric': 'High category addresses', 'count': high_address_count, 'percent': pct(high_address_count, denominator), 'note': '2026-05-19 snapshot count plus new post-snapshot initial contacts tied to High-primary category rows.'},
    {'metric': 'Medium category addresses', 'count': medium_address_count, 'percent': pct(medium_address_count, denominator), 'note': '2026-05-19 snapshot count plus new post-snapshot initial contacts tied to Medium-primary category rows.'},
    {'metric': 'Low category addresses', 'count': low_address_count, 'percent': pct(low_address_count, denominator), 'note': '2026-05-19 snapshot count plus new post-snapshot initial contacts whose highest referenced project category is Low.'},
]

report = {
    'dateRange': {'start': START.isoformat(), 'end': END.isoformat()},
    'source': 'PlanHubGuy workbook Outreach Log, Response Log, PlanHub Leads, Excavation Review',
    'rows': {
        'outreachInRange': BASELINE_SENT_ROWS + len(post_baseline_rows),
        'initialRows': initial_emails,
        'template1InitialEmails': initial_emails,
        'followup1Emails': followup1_emails,
        'finalFollowupEmails': final_followup_emails,
        'autoFollowups': auto_followups,
        'realPersonResponseThreads': real_person_response_count,
        'responseRowsInRange': len(response_rows),
    },
    'summary': {
        'initialEmails': initial_emails,
        'uniqueInitialContacts': denominator,
        'autoFollowups': auto_followups,
        'followup1Emails': followup1_emails,
        'finalFollowupEmails': final_followup_emails,
        'realPersonResponses': real_person_response_count,
    },
    'stats': stats,
    'supportingCounts': {
        'statusCounts': collections.Counter(r['status'] or '[blank]' for r in filtered).most_common(),
        'stageCounts': collections.Counter(r['stage'] or '[blank]' for r in filtered).most_common(),
        'templateCounts': collections.Counter(r['template'] or '[blank]' for r in filtered).most_common(),
        'categoryPrimaryAddressCounts': {'High': high_address_count, 'Medium': medium_address_count, 'Low': low_address_count, 'Unknown': unknown_address_count},
        'categoryPrimaryRowCounts': dict(row_primary_counts),
    },
    'examples': {
        'wrongContact': wrong_examples,
        'passAlong': pass_examples,
        'procurement': procurement_examples,
        'realPersonResponses': real_person_response_examples,
        'badInitialAddressesSample': post_bad_initial_addresses[:50],
        'publicInitialAddressesSample': post_public_initial_addresses[:50],
    },
}
for out_path in (DATED_OUT_PATH, LATEST_OUT_PATH):
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(report, indent=2))
print(json.dumps({'summary': report['summary'], 'stats': stats, 'out': str(LATEST_OUT_PATH), 'datedOut': str(DATED_OUT_PATH)}, indent=2))
