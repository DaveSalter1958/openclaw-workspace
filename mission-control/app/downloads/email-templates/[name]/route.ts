import { NextRequest } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

const baseDir = '/home/davesalter/.openclaw/workspace/mission-control/public/downloads/email-templates';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const safeName = path.basename(name);
  const filePath = path.join(baseDir, safeName);
  const data = await fs.readFile(filePath);
  return new Response(data, {
    headers: {
      'Content-Type': safeName.endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream',
      'Content-Disposition': `inline; filename="${safeName}"`,
    },
  });
}
