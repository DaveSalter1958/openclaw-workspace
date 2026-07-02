import { NextRequest, NextResponse } from 'next/server';
import { addTask } from '@/lib/data';
import { parseTaskCapture } from '@/lib/task-capture';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const text = body.text;

  if (!text || typeof text !== 'string') {
    return NextResponse.json({ error: 'text is required' }, { status: 400 });
  }

  const parsed = parseTaskCapture(text);

  if (!parsed.title) {
    return NextResponse.json({ error: 'could not determine task title' }, { status: 400 });
  }

  const task = await addTask(
    parsed.title,
    parsed.domain,
    parsed.dueDate,
    parsed.priority,
    parsed.scope,
    parsed.project || '',
    parsed.notes || '',
    parsed.dueTime || '',
  );

  return NextResponse.json({ task, parsed }, { status: 201 });
}
