# PlanHubGuy inbound recovery, practical method

Use this when Dave mailbox replies are visible but `Response Log` is missing valid responses.

## Best current method

Prefer **sender + subject** recovery entries over thread-only or Gmail-id assumptions.

Format:

```text
sender=person@example.com | subject=Re: Regarding Example Project
```

Why:
- Gmail thread ids are not stable enough across mailbox contexts.
- Sender + subject proved to be the most reliable recovery key in live repair work.

## Safe runner mode

Use inbound-only targeted recovery with seen-id bypass:

```bash
PLANHUBGUY_INBOUND_ONLY=1 \
PLANHUBGUY_IGNORE_SEEN_INBOUND=1 \
PLANHUBGUY_TARGETED_QUERIES="$(cat queries.txt)" \
python3 mission-control/scripts/planhubguy-runner.py
```

## Supported targeted formats

### 1. Preferred

```text
sender=person@example.com | subject=Re: Regarding Example Project
```

### 2. Still supported

Raw Gmail query lines, for example:

```text
newer_than:30d in:anywhere from:person@example.com subject:"Re: Regarding Example Project"
```

## Notes

- Keep PlanHubGuy disabled during repair work.
- Use `PLANHUBGUY_INBOUND_ONLY=1` for repair/backfill work.
- Use `PLANHUBGUY_IGNORE_SEEN_INBOUND=1` when historical replies were skipped because they were marked seen earlier.
- Reorganize `Response Log` after large backfills so valid replies remain surfaced at the top.
