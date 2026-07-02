# PlanHubGuy Memory

Split from `MEMORY.md` on 2026-07-02.

## Safety

- PlanHubGuy must never send more than one initial template email to the same contact for the same project; suppression should not rely on Outreach Log alone.
- Scheduled/live runs must have strict send caps. Do not allow inflated state limits such as `liveBatchLimit=100000`.
- Inbound email routine should label automatic/bounce/out-of-office style replies as `Automatic Reply` and real human-written responses as `Follow up`.

## Reply Goals

- Dave's goal: PlanHubGuy should read emails carefully, generate very polite context-appropriate replies, learn from Dave's edits, and eventually send safe replies without Dave reviewing every one.
- Suggested replies must be context-relevant and should not force generic templates.
- Do not quote, summarize, or repeat the recipient's email back with phrases like "your email said" or "your note said"; respond naturally.
- Procurement/portal guidance replies should usually be short: thank them for the procurement guidance, without adding an extra DRS services pitch unless Dave explicitly wants one.

## SOQ And Signature

- For future reply drafts/sends, include the company logo in the signature.
- Use the user-provided signature image by itself after the body text; do not build a separate text signature around it.
- When PlanHubGuy will attach the SOQ, show the SOQ sentence in the suggested reply and place it before "Thanks" / signature.
- Final sends should also enforce the SOQ sentence placement if an SOQ is attached.

## Learned Reply Patterns

- If an email says the project has not yet started CD phase and they will keep DRS contact info on file, thank them for the update and for keeping DRS information on file, and attach the SOQ.
- Wrong-contact/not-involved replies should apologize for bothering them and say DRS information must be incorrect, e.g. "Thank you for the update, and apologies for bothering you. It looks like our information must be incorrect."

## Learning From Dave

- Future reply drafts should learn from Dave's edits where possible.
- When Dave edits a suggested reply before sending, capture the original suggestion and final sent text as a learning example.
