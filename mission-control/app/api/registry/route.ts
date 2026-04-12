import { NextRequest, NextResponse } from 'next/server';
import { addModule, addToolBlueprint, addToolIdea, addWorkflow } from '@/lib/data';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const kind = body.kind;

  if (kind === 'idea') {
    if (!body.name || !body.problem || !body.nextStep) {
      return NextResponse.json({ error: 'name, problem, and nextStep are required' }, { status: 400 });
    }

    const idea = await addToolIdea({
      name: body.name,
      owner: body.owner || 'Dave',
      problem: body.problem,
      nextStep: body.nextStep,
      status: body.status,
      tags: body.tags || [],
      users: body.users || [],
      outputs: body.outputs || [],
    });

    return NextResponse.json({ item: idea }, { status: 201 });
  }

  if (kind === 'module') {
    if (!body.name || !body.type || !body.description) {
      return NextResponse.json({ error: 'name, type, and description are required' }, { status: 400 });
    }

    const module = await addModule({
      name: body.name,
      type: body.type,
      description: body.description,
      state: body.state,
      inputs: body.inputs || [],
      outputs: body.outputs || [],
    });

    return NextResponse.json({ item: module }, { status: 201 });
  }

  if (kind === 'workflow') {
    if (!body.name || !body.goal || !body.trigger) {
      return NextResponse.json({ error: 'name, goal, and trigger are required' }, { status: 400 });
    }

    const workflow = await addWorkflow({
      name: body.name,
      goal: body.goal,
      trigger: body.trigger,
      owner: body.owner || 'Dave',
      status: body.status,
      steps: body.steps || [],
      moduleIds: body.moduleIds || [],
    });

    return NextResponse.json({ item: workflow }, { status: 201 });
  }

  if (kind === 'toolBlueprint') {
    if (!body.name || !body.purpose) {
      return NextResponse.json({ error: 'name and purpose are required' }, { status: 400 });
    }

    const blueprint = await addToolBlueprint({
      name: body.name,
      purpose: body.purpose,
      owner: body.owner || 'Dave',
      status: body.status,
      workflowIds: body.workflowIds || [],
      moduleIds: body.moduleIds || [],
      expectedInputs: body.expectedInputs || [],
      expectedOutputs: body.expectedOutputs || [],
    });

    return NextResponse.json({ item: blueprint }, { status: 201 });
  }

  return NextResponse.json({ error: 'unknown kind' }, { status: 400 });
}
