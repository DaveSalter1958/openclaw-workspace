import { execFile } from 'child_process';
import { promisify } from 'util';
import { NextRequest, NextResponse } from 'next/server';

const execFileAsync = promisify(execFile);
const remoteName = 'Dropbox:';
const defaultPath = 'DRSEng/1 - DRS Eng - Projects/2025/2025-202 1643 Woods Drive - SRS';

type RcloneItem = {
  Path: string;
  Name?: string;
  Size?: number;
  MimeType?: string;
  ModTime?: string;
  IsDir?: boolean;
};

function cleanDropboxPath(value: string | null) {
  return (value === null ? defaultPath : value)
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .split('/')
    .filter((part) => part && part !== '.' && part !== '..')
    .join('/');
}

function parentPath(value: string) {
  const parts = value.split('/').filter(Boolean);
  parts.pop();
  return parts.join('/');
}

function titleFromPath(value: string) {
  const parts = value.split('/').filter(Boolean);
  return parts[parts.length - 1] || value;
}

export async function GET(request: NextRequest) {
  const folderPath = cleanDropboxPath(request.nextUrl.searchParams.get('path'));
  const target = `${remoteName}${folderPath}`;

  try {
    const { stdout } = await execFileAsync('rclone', ['lsjson', target], {
      maxBuffer: 1024 * 1024 * 8,
      timeout: 20000,
    });
    const parsed = JSON.parse(stdout) as RcloneItem[];
    const entries = parsed
      .map((item) => {
        const name = item.Name || titleFromPath(item.Path);
        const fullPath = [folderPath, name].filter(Boolean).join('/');
        return {
          id: `${item.IsDir ? 'dir' : 'file'}:${fullPath}`,
          name,
          path: fullPath,
          isDir: Boolean(item.IsDir),
          size: typeof item.Size === 'number' && item.Size >= 0 ? item.Size : null,
          mimeType: item.MimeType || '',
          modifiedAt: item.ModTime || '',
        };
      })
      .sort((left, right) => {
        if (left.isDir !== right.isDir) return left.isDir ? -1 : 1;
        return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' });
      });

    return NextResponse.json({
      path: folderPath,
      parentPath: parentPath(folderPath),
      entries,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not browse Dropbox.';
    return NextResponse.json({ error: message, path: folderPath, parentPath: parentPath(folderPath), entries: [] }, { status: 500 });
  }
}
