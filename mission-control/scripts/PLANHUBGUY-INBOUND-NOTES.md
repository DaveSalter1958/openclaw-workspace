# PlanHubGuy inbound notes

## Supported inbound model

Use bounded Gmail queries plus targeted thread hydration.

Do not rely on broad mailbox-wide recovery sweeps. They proved too expensive and brittle in practice.

## Safe targeted recovery

Use:

```bash
./mission-control/scripts/planhubguy-inbound-recovery.sh \
  'from:john@knightbuildingsystems.com newer_than:30d' \
  'in:spam from:brian@holloway.co newer_than:30d'
```

This runs the runner with:
- `PLANHUBGUY_MANUAL=1`
- `PLANHUBGUY_INBOUND_ONLY=1`
- `PLANHUBGUY_TARGETED_QUERIES` set from the provided Gmail search strings

## Important facts learned

- Real replies are landing in `Dave@DRS-Engineering.net`, not just `drs@drs-engineering.net`
- Some valid human replies land in Spam and must be considered inbound candidates
- Valid response capture must not fail just because the internal notification email fails
- Gmail thread IDs are not reliable enough to be the only linkage key
- Outreach linkage can be missing or weak, so subject/sender fallback logic is still necessary

## Current caveat

Capture is proven working for real valid replies, including Spam-folder replies.
Attribution/matching is materially improved, but should still be refactored further at send-time and inbound-time to reduce guesswork.
