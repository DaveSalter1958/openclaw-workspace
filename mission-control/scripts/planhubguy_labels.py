#!/usr/bin/env python3
"""
Centralized label+classification helpers for PlanHubGuy.

Single source of truth for the four Gmail labels and effective label priority.
"""

LABEL_FOLLOW_UP = 'Follow up'
LABEL_AUTOMATIC_REPLY = 'Automatic Reply'
LABEL_BAD_EMAIL = 'Bad Email'
LABEL_RESPONDED = 'Responded'
LABEL_POSSIBLE_WORK = 'Possible Work'

ALL_LABELS = {LABEL_FOLLOW_UP, LABEL_AUTOMATIC_REPLY, LABEL_BAD_EMAIL, LABEL_RESPONDED, LABEL_POSSIBLE_WORK}

# Display/effective priority when multiple labels appear on a thread
EFFECTIVE_PRIORITY = [LABEL_POSSIBLE_WORK, LABEL_RESPONDED, LABEL_FOLLOW_UP, LABEL_AUTOMATIC_REPLY, LABEL_BAD_EMAIL]


def effective_label(label_names):
    """Return the single effective label name from an iterable of label names."""
    s = {str(x) for x in (label_names or [])}
    for name in EFFECTIVE_PRIORITY:
        if name in s:
            return name
    return ''


def response_type_to_label_and_removals(response_type: str):
    """Map internal response_type to (add_label, remove_labels)."""
    rt = (response_type or '').strip().lower()
    if rt == 'possible_work':
        return LABEL_POSSIBLE_WORK, [LABEL_FOLLOW_UP, LABEL_AUTOMATIC_REPLY, LABEL_BAD_EMAIL, LABEL_RESPONDED]
    if rt == 'valid':
        return LABEL_FOLLOW_UP, [LABEL_AUTOMATIC_REPLY, LABEL_BAD_EMAIL, LABEL_RESPONDED, LABEL_POSSIBLE_WORK]
    if rt in {'auto', 'system'}:
        return LABEL_AUTOMATIC_REPLY, [LABEL_FOLLOW_UP, LABEL_BAD_EMAIL, LABEL_RESPONDED, LABEL_POSSIBLE_WORK]
    if rt == 'bounce':
        return LABEL_BAD_EMAIL, [LABEL_FOLLOW_UP, LABEL_AUTOMATIC_REPLY, LABEL_RESPONDED, LABEL_POSSIBLE_WORK]
    return '', []


def verify_labels_exist(runner_module, account: str):
    """
    Verify the four labels exist in the Gmail account. Non-mutating: logs findings.
    """
    try:
        payload = __import__('json').loads(runner_module.run('gog', 'gmail', 'labels', 'list', '-a', account, '-j'))
    except Exception as exc:
        runner_module.log({'status': 'label_verify_failed', 'error': str(exc)})
        return {'ok': False, 'error': str(exc)}
    names = {item.get('name', '') for item in payload.get('labels', [])}
    missing = sorted([lab for lab in ALL_LABELS if lab not in names])
    result = {'ok': True, 'missing': missing, 'present': sorted(names & ALL_LABELS)}
    runner_module.log({'status': 'label_verify', **result})
    return result
