import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

const workspaceDir = '/home/davesalter/.openclaw/workspace';
const memoryDir = path.join(workspaceDir, 'memory');

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const summary = typeof body.summary === 'string' ? body.summary.trim() : '';
    if (!summary) return NextResponse.json({ error: 'summary is required' }, { status: 400 });

    await fs.mkdir(memoryDir, { recursive: true });
    const file = path.join(memoryDir, `${todayKey()}.md`);
    const line = `\n- ${summary}\n`;
    await fs.appendFile(file, line, 'utf8');
    return NextResponse.json({ ok: true, file });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'log failed' }, { status: 500 });
  }
}
