import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

const filePath = '/home/davesalter/.openclaw/workspace/mission-control/data/planhubguy-templates.json';
const auditPath = '/home/davesalter/.openclaw/workspace/memory/planhubguy-template-audit.jsonl';

async function loadTemplates() {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

async function audit(event: object) {
  await fs.mkdir(path.dirname(auditPath), { recursive: true });
  await fs.appendFile(auditPath, JSON.stringify({ at: new Date().toISOString(), ...event }) + '\n', 'utf8');
}

export async function GET() {
  const templates = await loadTemplates();
  return NextResponse.json(templates);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const current = await loadTemplates();
  const next = {
    template1: {
      subject: String(body?.template1?.subject ?? current.template1.subject),
      body: String(body?.template1?.body ?? current.template1.body),
    },
    template2: {
      subject: String(body?.template2?.subject ?? current.template2.subject),
      body: String(body?.template2?.body ?? current.template2.body),
    },
    template3: {
      subject: String(body?.template3?.subject ?? current.template3.subject),
      body: String(body?.template3?.body ?? current.template3.body),
    },
  };
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(next, null, 2) + '\n', 'utf8');
  await audit({
    action: 'templates_saved',
    changed: {
      template1: current.template1.body !== next.template1.body || current.template1.subject !== next.template1.subject,
      template2: current.template2.body !== next.template2.body || current.template2.subject !== next.template2.subject,
      template3: current.template3.body !== next.template3.body || current.template3.subject !== next.template3.subject,
    },
    userAgent: request.headers.get('user-agent') || '',
    referer: request.headers.get('referer') || '',
  });
  return NextResponse.json({ ok: true, templates: next });
}
