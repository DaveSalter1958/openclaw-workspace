import { NextRequest, NextResponse } from 'next/server';
import { getWoodsDriveProject, saveWoodsDriveSchedule } from '@/lib/woods-drive';

export async function GET() {
  return NextResponse.json(await getWoodsDriveProject());
}

export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const schedule = Array.isArray(body.schedule) ? body.schedule : [];
  const project = await saveWoodsDriveSchedule(schedule);
  return NextResponse.json(project);
}
