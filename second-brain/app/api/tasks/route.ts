import { NextRequest, NextResponse } from 'next/server';
import { addTask, toggleTask, updateTask } from '@/lib/data';

export async function POST(request: NextRequest) {
  const body = await request.json();

  if (!body.title || typeof body.title !== 'string') {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }

  const task = await addTask(
    body.title,
    body.domain || 'general',
    body.dueDate,
    body.priority || 'medium',
    body.scope || 'personal',
    body.project || '',
    body.notes || '',
    body.dueTime || '',
  );

  return NextResponse.json({ task }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();

  if (!body.id || typeof body.id !== 'string') {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const mode = body.mode || 'toggle';

  if (mode === 'update') {
    const task = await updateTask(body.id, {
      title: body.title,
      priority: body.priority,
      scope: body.scope,
      domain: body.domain,
      dueDate: body.dueDate,
      dueTime: body.dueTime,
      project: body.project,
      notes: body.notes,
    });

    if (!task) {
      return NextResponse.json({ error: 'task not found' }, { status: 404 });
    }

    return NextResponse.json({ task });
  }

  const task = await toggleTask(body.id);

  if (!task) {
    return NextResponse.json({ error: 'task not found' }, { status: 404 });
  }

  return NextResponse.json({ task });
}
