import { NextRequest, NextResponse } from 'next/server';
import { getWoodsDriveProject, saveWoodsDriveActions } from '@/lib/woods-drive';

export async function GET() {
  return NextResponse.json(await getWoodsDriveProject());
}

export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const actions = Array.isArray(body.actions) ? body.actions : [];
  const project = await saveWoodsDriveActions(actions);
  return NextResponse.json(project);
}
