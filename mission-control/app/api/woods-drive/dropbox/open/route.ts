import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';

const execFileAsync = promisify(execFile);
const remoteName = 'Dropbox:';

const contentTypes: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.csv': 'text/csv',
  '.txt': 'text/plain; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
};

function cleanDropboxPath(value: string | null) {
  return (value || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .split('/')
    .filter((part) => part && part !== '.' && part !== '..')
    .join('/');
}

function safeFilename(value: string) {
  return (path.basename(value) || 'dropbox-document').replace(/["\r\n]/g, '');
}

export async function GET(request: NextRequest) {
  const filePath = cleanDropboxPath(request.nextUrl.searchParams.get('path'));
  if (!filePath) {
    return NextResponse.json({ error: 'Dropbox file path is required.' }, { status: 400 });
  }

  const target = `${remoteName}${filePath}`;
  const filename = safeFilename(filePath);
  const contentType = contentTypes[path.extname(filename).toLowerCase()] || 'application/octet-stream';

  try {
    const { stdout } = await execFileAsync('rclone', ['cat', target], {
      encoding: 'buffer',
      maxBuffer: 1024 * 1024 * 250,
      timeout: 60000,
    });

    return new NextResponse(new Uint8Array(stdout), {
      headers: {
        'Cache-Control': 'no-store',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Content-Type': contentType,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not open Dropbox file.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
