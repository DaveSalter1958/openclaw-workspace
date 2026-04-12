import { promises as fs } from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { NextRequest, NextResponse } from 'next/server';

const execFileAsync = promisify(execFile);
const remotionOutDir = '/home/davesalter/.openclaw/workspace/remotion/out';
const remotionArchiveDir = '/home/davesalter/.openclaw/workspace/remotion/archive';

function resolveSafe(name: string) {
  const resolved = path.resolve(remotionOutDir, name);
  if (!resolved.startsWith(path.resolve(remotionOutDir))) {
    throw new Error('Forbidden');
  }
  return resolved;
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const action = body.action;
  const name = body.name;

  if (!name || typeof name !== 'string') {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  let filePath: string;
  try {
    filePath = resolveSafe(name);
  } catch {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  if (action === 'archive') {
    await fs.mkdir(remotionArchiveDir, { recursive: true });
    const target = path.join(remotionArchiveDir, `${Date.now()}-${path.basename(name)}`);
    await fs.rename(filePath, target);
    return NextResponse.json({ ok: true, archivedTo: target });
  }

  if (action === 'delete') {
    await execFileAsync('gio', ['trash', filePath]);
    return NextResponse.json({ ok: true });
  }

  if (action === 'deliver') {
    return NextResponse.json({ ok: false, message: 'Attachment delivery is not solved yet. Use the Remotion page as the delivery surface for now.' }, { status: 501 });
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 });
}
