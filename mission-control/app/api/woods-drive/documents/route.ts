import { NextResponse } from 'next/server';
import { saveWoodsDriveDocuments } from '@/lib/woods-drive';

export async function PUT(request: Request) {
  const body = await request.json().catch(() => ({}));
  const documents = Array.isArray(body.documents) ? body.documents : [];
  const project = await saveWoodsDriveDocuments(documents);
  return NextResponse.json(project);
}
