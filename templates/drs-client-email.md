# DRS Client Email Template

Use this template when drafting professional client emails for DRS Engineering.

## Style Rules

- Tone: professional, clear, courteous, technically competent.
- Keep emails concise unless the issue requires detail.
- Do not overpromise.
- Do not invent facts, dates, code requirements, fees, or schedules.
- If information is missing, state what is needed.
- Use plain English with appropriate engineering terminology.
- End with a practical next step.

## Standard Structure

Subject:
[Clear subject line]

Email Body:

Hi [Name],

[Opening sentence: acknowledge the project, issue, or request.]

[Main message: explain the key point, recommendation, question, or response.]

[Optional technical clarification, if needed.]

[Next step or requested action.]

Best regards,

[Insert email signature image here]

Signature image file:
`mission-control/data/planhubguy/DRS_Email_Signature.jpg`

Implementation note:
When sending as HTML email, embed the image inline at the end of the body using a CID reference, for example:

```html
<p>Best regards,</p>
<img src="cid:drs-email-signature" alt="Dave Salter, DRS Engineering Inc. email signature" style="max-width:350px;height:auto;">
```

Attach `mission-control/data/planhubguy/DRS_Email_Signature.jpg` as an inline MIME image with Content-ID `drs-email-signature`.
