import { NextResponse } from 'next/server';
import { saveWoodsDrivePermits } from '@/lib/woods-drive';

export async function PUT(request: Request) {
  const body = await request.json().catch(() => ({}));
  const permits = Array.isArray(body.permits) ? body.permits : [];
  const project = await saveWoodsDrivePermits(permits);
  return NextResponse.json(project);
}
