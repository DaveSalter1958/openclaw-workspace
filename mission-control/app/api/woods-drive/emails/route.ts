import { NextResponse } from 'next/server';
import { getWoodsDriveEmails } from '@/lib/woods-drive';

export async function GET() {
  return NextResponse.json({ emails: await getWoodsDriveEmails() });
}
