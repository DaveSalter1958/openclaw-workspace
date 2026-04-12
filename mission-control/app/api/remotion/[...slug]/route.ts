import { promises as fs } from 'fs';
import path from 'path';
import { NextRequest } from 'next/server';

const remotionOutDir = '/home/davesalter/.openclaw/workspace/remotion/out';

export async function GET(_request: NextRequest, context: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await context.params;
  const filePath = path.resolve(remotionOutDir, ...slug);

  if (!filePath.startsWith(path.resolve(remotionOutDir))) {
    return new Response('Forbidden', { status: 403 });
  }

  try {
    const file = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = ext === '.mp4' ? 'video/mp4' : ext === '.webm' ? 'video/webm' : 'application/octet-stream';
    return new Response(file, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
