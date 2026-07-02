# PlanHubGuy Workflow / State-Machine Spec

Date: 2026-05-06
Owner: Dave Salter / Guy
Status: Draft for implementation

## 1. Purpose

PlanHubGuy reviews PlanHub project/contact data, identifies likely DRS opportunities, queues approved contacts for outreach, sends template emails only after an explicit send gate, monitors replies, and prepares follow-up drafts for Dave's review.

The core implementation goals are:

1. Make contact/project state unambiguous.
2. Prevent duplicate initial outreach.
3. Require an explicit Dave-approved send gate before outbound email.
4. Classify inbound responses consistently.
5. Keep human follow-ups visible and manually controllable in Mission Control.

---

## 2. Primary Records

### 2.1 Contact-Project Candidate

A candidate is the normalized tuple:

```text
normalized_email + normalized_project_id_or_project_key
```

This tuple is the duplicate-suppression key for initial outreach.

Required fields:

- Contact email
- Contact name, if available
- Company, if available
- PlanHub project identifier or stable project key
- Project name
- Project location
- Project type / description
- Detected DRS-relevant signals
- Likelihood category: `Low`, `Medium`, or `High`
- Current workflow state
- Last state change date/time
- Source row / source sheet reference

### 2.2 Outreach Log

The Outreach Log is the authoritative business log for outbound outreach attempts and contact state.

Minimum fields:

- Date/time sent
- Sender address
- Recipient email
- Recipient name/company
- Project identifier/key
- Project name
- Template sent
- Workflow state after send
- Gmail message id / thread id, if available
- Suppression reason, if not sent
- Notes

### 2.3 Response Log

The Response Log records inbound replies and classifications.

Minimum fields:

- Date/time received
- Sender email
- Matched recipient/contact email
- Project identifier/key, if matched
- Gmail message id / thread id
- Response classification
- Resulting contact state
- Summary of response
- Follow-up draft id/status, if applicable

---

## 3. Contact States

Use one current state per contact-project candidate.

| State | Meaning | Email Allowed? |
|---|---|---:|
| `New Candidate` | Found in PlanHub data but not yet scored. | No |
| `Scored - Low` | Scored as low likelihood of needing DRS services. | Eligible if settings include Low |
| `Scored - Medium` | Scored as medium likelihood. | Eligible if settings include Medium |
| `Scored - High` | Scored as high likelihood. | Eligible if settings include High |
| `Suppressed - Duplicate` | Initial outreach already exists for this contact/project. | No |
| `Suppressed - Invalid Email` | Email is malformed, bounced, or known bad. | No |
| `Suppressed - Excluded` | Excluded by Dave/settings/rules. | No |
| `Queued for Outreach` | Included in the next proposed send group. | Not yet |
| `Approved for Send` | Dave approved this candidate in the send gate. | Yes |
| `Template 1 Sent` | Initial template email sent and logged. | No further initial email |
| `Automatic Reply` | Auto-reply/out-of-office/non-human response received. | No manual follow-up required by default |
| `Bad Email` | Bounce, delivery failure, invalid recipient, blocked mailbox. | No |
| `Follow Up` | Human-written response requiring Dave/Guy review. | Draft only; send after approval |
| `Response Drafted` | Follow-up response has been drafted for Dave. | Send only after approval |
| `Responded` | Dave/PlanHubGuy sent the follow-up response. | No further action unless reopened |
| `Closed - Not Interested` | Human replied that they are not interested or declined DRS services. | No |
| `Do Not Contact` | Explicitly excluded from future outreach. | No |

---

## 4. Workflow A — Daily PlanHub List Review

Schedule: daily at 1:00 PM.

### Steps

1. Read the PlanHub Google Sheet.
2. Normalize all email addresses.
3. Identify new unique emails and contact-project pairs.
4. Create or update `New Candidate` records.
5. Run duplicate suppression before scoring or queueing.
6. Score each unsuppressed candidate as `Low`, `Medium`, or `High`.
7. Save detected scoring reasons/signals.
8. Update candidate state:
   - `Scored - Low`
   - `Scored - Medium`
   - `Scored - High`
   - or a suppression state.

### Output

Mission Control should show:

- New candidates found
- New unique emails found
- High / Medium / Low counts
- Suppressed duplicate count
- Bad/invalid email count
- Candidates eligible for next send session

---

## 5. Workflow B — Duplicate Suppression

Duplicate suppression must run before any candidate can enter `Queued for Outreach` or `Approved for Send`.

### 5.1 Suppression Key

Primary key:

```text
normalized_email + normalized_project_id_or_project_key
```

If no reliable project id exists, generate a stable project key from:

```text
normalized_project_name + normalized_location + bid/date/source identifier if available
```

### 5.2 Evidence Sources

A candidate must be suppressed if the same contact-project key appears in any of these sources:

1. Outreach Log
2. Response Log
3. Gmail sent-mail history from `Dave@DRS-Engineering.net`
4. Existing Mission Control candidate records
5. Known suppression lists / `Do Not Contact` records

### 5.3 Suppression Outcomes

- Already sent initial template for same contact/project → `Suppressed - Duplicate`
- Bad or bounced email known → `Suppressed - Invalid Email` or `Bad Email`
- Explicit exclusion → `Suppressed - Excluded` or `Do Not Contact`

### 5.4 Hard Rule

A contact must never receive more than one initial template email for the same project.

This rule is stronger than the send settings. If settings say to send but duplicate evidence exists, suppression wins.

---

## 6. Workflow C — Send Group Preparation

### Inputs

Mission Control settings define which scored categories are eligible:

- Include High: yes/no
- Include Medium: yes/no
- Include Low: yes/no; Low should always be available for selection
- Optional max-send count
- Optional exclusions

### Steps

1. Read eligible scored candidates.
2. Apply duplicate suppression again.
3. Apply Dave/settings exclusions.
4. Build proposed send group.
5. Set candidates to `Queued for Outreach`.
6. Present send gate in Mission Control.

### Send Gate Display

Before sending, Mission Control must show:

- Total queued recipients
- Counts by likelihood: High / Medium / Low
- Count suppressed as duplicates
- Count excluded / invalid
- Template to be sent
- Sender address: `Dave@DRS-Engineering.net`
- Sample recipients/projects
- Full downloadable/reviewable queue

### Required Dave Action

No outbound email is sent until Dave explicitly chooses:

```text
Approve Send Session
```

After approval, candidates move from `Queued for Outreach` to `Approved for Send`.

---

## 7. Workflow D — Initial Template Send

### Preconditions

A candidate may be emailed only if all are true:

1. Current state is `Approved for Send`.
2. Email address is valid.
3. Candidate is not suppressed.
4. Duplicate suppression passes immediately before send.
5. Sender address is `Dave@DRS-Engineering.net`.
6. Template 1 is selected and available.

### Steps

1. Re-run duplicate suppression immediately before each send.
2. Send Template 1.
3. Record Gmail message id/thread id.
4. Append Outreach Log row.
5. Set state to `Template 1 Sent`.
6. If send fails:
   - delivery/bounce known immediately → `Bad Email`
   - transient error → keep in queue with error note, do not mark sent

### Postconditions

Every sent email must have:

- Outreach Log row
- Gmail sent-message evidence
- Candidate state `Template 1 Sent`

---

## 8. Workflow E — Incoming Response Monitoring

Mailbox: `Dave@DRS-Engineering.net`.

### Steps

1. Monitor incoming email.
2. Match each response to Outreach Log / sent Gmail thread / candidate record.
3. Record response date/time.
4. Classify the response.
5. Update Gmail label and candidate state.
6. Append/update Response Log.

---

## 9. Response Classification

### 9.1 Human Reply → `Follow Up`

Classify as `Follow Up` when the message appears human-written and relevant, including:

- Interest in DRS services
- Request for qualifications, pricing, availability, or scope
- Referral to another contact
- Request to call or discuss
- Any ambiguous but apparently human response

Classify as `Closed - Not Interested` when a human reply clearly declines, says they are not interested, asks not to proceed, or otherwise closes the opportunity without requesting further action.

Action:

- For actionable or ambiguous human replies: apply Gmail label `Follow Up`, set state to `Follow Up`, add to Mission Control follow-up queue, and prepare draft response for Dave to review.
- For clear human declines/no-interest replies: apply Gmail label `Closed - Not Interested`, set state to `Closed - Not Interested`, and log the response without adding it to the manual follow-up queue.

### 9.2 Automatic Reply → `Automatic Reply`

Classify as `Automatic Reply` when the message is non-human or automated, including:

- Out-of-office replies
- Vacation responders
- Auto acknowledgements
- Mailbox rules/auto-generated notifications
- System-generated confirmations that are not delivery failures

Action:

- Apply Gmail label `Automatic Reply`.
- Set state to `Automatic Reply`.
- Log response.
- If an out-of-office return date is detected, create a delayed reminder/follow-up task for after that return date.
- Do not create a manual follow-up draft unless the message contains a useful alternate contact or date-based follow-up instruction.

### 9.3 Bad Email → `Bad Email`

Classify as `Bad Email` when delivery failed or address is unusable, including:

- Bounce
- Undeliverable
- Invalid recipient
- Mailbox not found
- Domain failure
- Blocked/rejected recipient

Action:

- Apply Gmail label `Bad Email`.
- Set state to `Bad Email`.
- Mark email/contact as invalid for future outreach.
- Do not retry without Dave approval or corrected address.

### 9.4 Closed - Not Interested → `Closed - Not Interested`

`Closed - Not Interested` means a human reply clearly declined, expressed no interest, or closed the opportunity without requesting further action.

Action:

- Apply Gmail label `Closed - Not Interested`.
- Set state to `Closed - Not Interested`.
- Log response.
- Do not create a manual follow-up draft unless Dave later reopens it.

### 9.5 Responded → `Responded`

`Responded` means Dave/PlanHubGuy has sent the manual follow-up response to a human reply.

Action:

- Remove or supersede `Follow Up` label.
- Apply `Responded` label/state.
- Log sent response date/time and Gmail message id/thread id.

---

## 10. Workflow F — Follow-Up Drafting and Sending

### Mission Control Follow-Up Queue

Show all candidates/emails in state `Follow Up`.

For each item show:

- Contact name/email/company
- Project name
- Original outreach date
- Response date
- Response summary
- Link to email/thread
- Draft response
- Attachments to include

### Draft Rules

1. Draft a suitable response based on the contact's email.
2. Include the DRS Statement of Qualifications PDF from `mission-control/data/planhubguy/DRS_Statement_of_Qualifications.pdf`.
3. Include the sentence:

   > Please find attached our Statement of Qualification for your information. Please feel free to share it with customers or clients as you see fit.

4. Include the approved email signature image from `mission-control/data/planhubguy/DRS_Email_Signature.jpg`.
5. Do not send automatically.

### Dave Controls

Mission Control must provide:

- Edit draft
- Save draft
- Send approved response
- Skip / dismiss
- Mark as responded manually

### Send Preconditions

A follow-up response may be sent only if:

1. Current state is `Follow Up` or `Response Drafted`.
2. Dave has approved the send.
3. The draft body is visible/editable before sending.
4. Required attachment/signature availability has been checked.

After sending:

- Set state to `Responded`.
- Log response sent date/time.
- Store Gmail message id/thread id.

---

## 11. Likelihood Scoring

Scoring should produce both a category and reasons.

### High

Strong likelihood of needing DRS services, such as:

- Shoring
- Retaining walls
- Excavation support
- Earth retention
- Deep foundations
- Soldier piles / lagging
- Tiebacks / anchors
- Micropiles / caissons / piles
- Hillside or constrained-site structural work
- Large commercial, multifamily, civic, or infrastructure project with relevant scope

### Medium

Possible DRS fit, such as:

- General construction project with unclear foundation/earthwork scope
- Sitework or structural scope that may include retention/foundation needs
- Location/type suggests possible geostructural need but evidence is incomplete

### Low

Weak DRS fit, such as:

- Interior-only remodel
- Finishes, painting, flooring, tenant improvement with no structural/earthwork signal
- Procurement-only or unrelated trade scope
- Small/simple project with no likely DRS service need

---

## 12. Implementation Safety Rules

1. Never send external email without an explicit approved send gate, except future behavior Dave separately authorizes in writing.
2. Never rely on Outreach Log alone for duplicate suppression.
3. Never mark an email as sent unless Gmail send succeeded and the Outreach Log was updated.
4. If logging fails after send, flag immediate repair/audit rather than silently continuing.
5. Ambiguous inbound replies should be treated as `Follow Up`, not discarded.
6. Automatic replies and bad emails should not clutter Dave's manual follow-up queue.
7. `Do Not Contact` overrides every other state.

---

## 13. Recommended Mission Control Sections

1. **Daily Review Summary**
   - New candidates
   - Scored candidates
   - Suppressions

2. **Send Gate**
   - Proposed recipients
   - Category settings
   - Template preview
   - Approve Send Session button

3. **Outreach Log Health**
   - Sent count
   - Logged count
   - Any send/log mismatch
   - Duplicate suppression count

4. **Follow-Up Queue**
   - Human replies needing action
   - Draft/edit/send controls

5. **Automatic / Bad Email Review**
   - Auto replies
   - Bounces
   - Invalid addresses
   - Optional recovery actions

---

## 14. Clean State Transition Summary

```text
New Candidate
  -> Scored - Low / Medium / High
  -> Suppressed - Duplicate / Invalid Email / Excluded

Scored - Medium or Scored - High
  -> Queued for Outreach
  -> Approved for Send
  -> Template 1 Sent

Template 1 Sent
  -> Follow Up                  [actionable or ambiguous human reply]
  -> Closed - Not Interested    [clear human decline/no-interest]
  -> Automatic Reply            [auto/out-of-office]
  -> Bad Email                  [bounce/undeliverable]

Follow Up
  -> Response Drafted
  -> Responded

Any State
  -> Do Not Contact     [manual override]
```

---

## 15. Open Implementation Questions

1. Should `Low` ever be eligible for outreach, or should it remain permanently excluded unless Dave manually opts in? **Answered 2026-05-06: Yes. Low should always be eligible for selection.**
2. Should out-of-office replies create a delayed reminder when a return date is detected? **Answered 2026-05-06: Yes. Create a delayed reminder/follow-up task when a return date is detected.**
3. Should human declines become `Responded`, `Closed - Not Interested`, or remain `Follow Up` until Dave reviews them? **Answered 2026-05-06: Human no-interest/decline replies should become `Closed - Not Interested`.**
4. What is the final local path or upload location for the DRS Statement of Qualifications PDF? **Answered 2026-05-06: Use `mission-control/data/planhubguy/DRS_Statement_of_Qualifications.pdf`.**
5. What is the final approved logo/signature image file to use in outgoing replies? **Answered 2026-05-06: Use `mission-control/data/planhubguy/DRS_Email_Signature.jpg`.**
