"use client";

import { useMemo, useState, useTransition } from 'react';
import type { ModuleDefinition, ToolBlueprint, ToolBlueprintStatus, WorkflowDefinition } from '@/lib/types';

type Props = {
  initialBlueprints: ToolBlueprint[];
  modules: ModuleDefinition[];
  workflows: WorkflowDefinition[];
};

export function ToolBuilder({ initialBlueprints, modules, workflows }: Props) {
  const [blueprints, setBlueprints] = useState(initialBlueprints);
  const [selectedModules, setSelectedModules] = useState<string[]>([]);
  const [selectedWorkflows, setSelectedWorkflows] = useState<string[]>([]);
  const [selectedBlueprintId, setSelectedBlueprintId] = useState<string>(initialBlueprints[0]?.id ?? '');
  const [copiedKind, setCopiedKind] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({
    name: '',
    purpose: '',
    owner: 'Dave',
    status: 'concept' as ToolBlueprintStatus,
    expectedInputs: '',
    expectedOutputs: '',
  });

  function splitCsv(value: string) {
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }

  function toggle(list: string[], setter: (next: string[]) => void, id: string) {
    setter(list.includes(id) ? list.filter((item) => item !== id) : [...list, id]);
  }

  function workflowName(id: string) {
    return workflows.find((workflow) => workflow.id === id)?.name ?? id;
  }

  function moduleName(id: string) {
    return modules.find((module) => module.id === id)?.name ?? id;
  }

  const selectedBlueprint = useMemo(
    () => blueprints.find((tool) => tool.id === selectedBlueprintId) ?? blueprints[0] ?? null,
    [blueprints, selectedBlueprintId],
  );

  const exportBundle = useMemo(() => {
    if (!selectedBlueprint) return null;

    const linkedWorkflows = workflows.filter((workflow) => selectedBlueprint.workflowIds.includes(workflow.id));
    const linkedModules = modules.filter((module) => selectedBlueprint.moduleIds.includes(module.id));

    const jsonSpec = JSON.stringify(
      {
        tool: selectedBlueprint,
        workflows: linkedWorkflows,
        modules: linkedModules,
      },
      null,
      2,
    );

    const markdownSpec = `# ${selectedBlueprint.name}\n\n## Purpose\n${selectedBlueprint.purpose}\n\n## Owner\n${selectedBlueprint.owner}\n\n## Status\n${selectedBlueprint.status}\n\n## Expected Inputs\n${selectedBlueprint.expectedInputs.map((item) => `- ${item}`).join('\n') || '- None defined'}\n\n## Expected Outputs\n${selectedBlueprint.expectedOutputs.map((item) => `- ${item}`).join('\n') || '- None defined'}\n\n## Workflows\n${linkedWorkflows.map((workflow) => `- ${workflow.name}: ${workflow.goal}`).join('\n') || '- None attached'}\n\n## Modules\n${linkedModules.map((module) => `- ${module.name}: ${module.description}`).join('\n') || '- None attached'}\n`;

    const builderPrompt = `Build a local-first tool called "${selectedBlueprint.name}".\n\nPurpose:\n${selectedBlueprint.purpose}\n\nOwner:\n${selectedBlueprint.owner}\n\nExpected inputs:\n${selectedBlueprint.expectedInputs.join(', ') || 'None defined'}\n\nExpected outputs:\n${selectedBlueprint.expectedOutputs.join(', ') || 'None defined'}\n\nWorkflows to support:\n${linkedWorkflows.map((workflow) => `- ${workflow.name}: trigger=${workflow.trigger}; goal=${workflow.goal}; steps=${workflow.steps.join(' | ')}`).join('\n') || '- None attached'}\n\nModules to use:\n${linkedModules.map((module) => `- ${module.name}: type=${module.type}; inputs=${module.inputs.join(', ')}; outputs=${module.outputs.join(', ')}`).join('\n') || '- None attached'}\n\nRequirements:\n- Keep the interface clean and minimal.\n- Prefer local-first persistence.\n- Expose the main workflow clearly.\n- Avoid decorative admin-dashboard clutter.\n`;

    const starterFiles = `# starter-files.txt\n\napp/\n  page.tsx\n  components/\n    ToolShell.tsx\n    WorkflowLane.tsx\n    ResultPanel.tsx\nlib/\n  types.ts\n  blueprint.ts\n  workflows.ts\n  modules.ts\ndata/\n  ${selectedBlueprint.id}.json\n\n# blueprint-outline.md\n\nTool: ${selectedBlueprint.name}\nPurpose: ${selectedBlueprint.purpose}\nOwner: ${selectedBlueprint.owner}\nStatus: ${selectedBlueprint.status}\n\nInputs:\n${selectedBlueprint.expectedInputs.map((item) => `- ${item}`).join('\n') || '- None defined'}\n\nOutputs:\n${selectedBlueprint.expectedOutputs.map((item) => `- ${item}`).join('\n') || '- None defined'}\n\nWorkflows:\n${linkedWorkflows.map((workflow) => `- ${workflow.name}`).join('\n') || '- None attached'}\n\nModules:\n${linkedModules.map((module) => `- ${module.name}`).join('\n') || '- None attached'}\n`;

    return { jsonSpec, markdownSpec, builderPrompt, starterFiles };
  }, [selectedBlueprint, workflows, modules]);

  async function copyText(kind: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKind(kind);
      window.setTimeout(() => setCopiedKind((current) => (current === kind ? null : current)), 1500);
    } catch {
      setCopiedKind(null);
    }
  }

  async function createBlueprint() {
    startTransition(async () => {
      const response = await fetch('/api/registry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'toolBlueprint',
          ...form,
          workflowIds: selectedWorkflows,
          moduleIds: selectedModules,
          expectedInputs: splitCsv(form.expectedInputs),
          expectedOutputs: splitCsv(form.expectedOutputs),
        }),
      });

      if (!response.ok) return;
      const { item } = await response.json();
      setBlueprints((current) => [item, ...current]);
      setSelectedBlueprintId(item.id);
      setSelectedModules([]);
      setSelectedWorkflows([]);
      setForm({ name: '', purpose: '', owner: 'Dave', status: 'concept', expectedInputs: '', expectedOutputs: '' });
    });
  }

  return (
    <div className="grid" style={{ gap: 16 }}>
      <section className="card">
        <div className="section-title">
          <div>
            <h2>Tool Builder</h2>
            <p className="muted small">Assemble a custom tool from workflows and modules with clear inputs and outputs.</p>
          </div>
        </div>

        <div className="form">
          <input className="input" placeholder="Tool name" value={form.name} onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))} />
          <textarea className="input" rows={3} placeholder="Purpose" value={form.purpose} onChange={(e) => setForm((c) => ({ ...c, purpose: e.target.value }))} />
          <div className="grid grid-3">
            <input className="input" placeholder="Owner" value={form.owner} onChange={(e) => setForm((c) => ({ ...c, owner: e.target.value }))} />
            <select className="select" value={form.status} onChange={(e) => setForm((c) => ({ ...c, status: e.target.value as ToolBlueprintStatus }))}>
              <option value="concept">concept</option>
              <option value="designing">designing</option>
              <option value="ready">ready</option>
            </select>
            <div />
          </div>
          <input className="input" placeholder="Expected inputs comma-separated" value={form.expectedInputs} onChange={(e) => setForm((c) => ({ ...c, expectedInputs: e.target.value }))} />
          <input className="input" placeholder="Expected outputs comma-separated" value={form.expectedOutputs} onChange={(e) => setForm((c) => ({ ...c, expectedOutputs: e.target.value }))} />

          <div className="section-title" style={{ marginBottom: 8 }}>
            <div><h3>Attach workflows</h3><p className="muted small">Choose the flows this tool depends on.</p></div>
          </div>
          <div className="badge-row">
            {workflows.map((workflow) => (
              <button key={workflow.id} type="button" className={`button secondary ${selectedWorkflows.includes(workflow.id) ? 'active-pill' : ''}`} onClick={() => toggle(selectedWorkflows, setSelectedWorkflows, workflow.id)}>
                {workflow.name}
              </button>
            ))}
          </div>

          <div className="section-title" style={{ marginBottom: 8 }}>
            <div><h3>Attach modules</h3><p className="muted small">Select the primitives used directly by the tool.</p></div>
          </div>
          <div className="badge-row">
            {modules.map((module) => (
              <button key={module.id} type="button" className={`button secondary ${selectedModules.includes(module.id) ? 'active-pill' : ''}`} onClick={() => toggle(selectedModules, setSelectedModules, module.id)}>
                {module.name}
              </button>
            ))}
          </div>

          <button className="button" type="button" onClick={createBlueprint} disabled={isPending || !form.name || !form.purpose}>
            {isPending ? 'Saving…' : 'Create tool blueprint'}
          </button>
        </div>
      </section>

      <section className="grid grid-2">
        <div className="card">
          <div className="section-title">
            <div>
              <h2>Blueprint registry</h2>
              <p className="muted small">Structured custom tools waiting to be built or refined.</p>
            </div>
          </div>
          <div className="list">
            {blueprints.map((tool) => (
              <article className="item" key={tool.id}>
                <div className="item-top">
                  <div>
                    <h3>{tool.name}</h3>
                    <p className="muted small">{tool.owner}</p>
                  </div>
                  <div className="badge-row">
                    <span className={`status-pill ${tool.status}`}>{tool.status}</span>
                    <button className={`button secondary ${selectedBlueprint?.id === tool.id ? 'active-pill' : ''}`} type="button" onClick={() => setSelectedBlueprintId(tool.id)}>
                      Select
                    </button>
                  </div>
                </div>
                <p className="body-copy">{tool.purpose}</p>
                <p className="muted small"><strong>Inputs</strong> — {tool.expectedInputs.join(', ') || 'None defined'}</p>
                <p className="muted small"><strong>Outputs</strong> — {tool.expectedOutputs.join(', ') || 'None defined'}</p>
                <div className="badge-row subdued-tags">
                  {tool.workflowIds.map((id) => <span className="tag" key={id}>{workflowName(id)}</span>)}
                  {tool.moduleIds.map((id) => <span className="tag" key={id}>{moduleName(id)}</span>)}
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="section-title">
            <div>
              <h2>Build spec export</h2>
              <p className="muted small">Select a tool blueprint to generate implementation-friendly specs.</p>
            </div>
          </div>
          {selectedBlueprint && exportBundle ? (
            <div className="grid" style={{ gap: 14 }}>
              <div>
                <div className="section-title">
                  <p className="eyebrow">JSON spec</p>
                  <button className="button secondary" type="button" onClick={() => copyText('json', exportBundle.jsonSpec)}>
                    {copiedKind === 'json' ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <pre className="code-block">{exportBundle.jsonSpec}</pre>
              </div>
              <div>
                <div className="section-title">
                  <p className="eyebrow">Markdown spec</p>
                  <button className="button secondary" type="button" onClick={() => copyText('markdown', exportBundle.markdownSpec)}>
                    {copiedKind === 'markdown' ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <pre className="code-block">{exportBundle.markdownSpec}</pre>
              </div>
              <div>
                <div className="section-title">
                  <p className="eyebrow">Builder prompt</p>
                  <button className="button secondary" type="button" onClick={() => copyText('prompt', exportBundle.builderPrompt)}>
                    {copiedKind === 'prompt' ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <pre className="code-block">{exportBundle.builderPrompt}</pre>
              </div>
              <div>
                <div className="section-title">
                  <p className="eyebrow">Starter implementation</p>
                  <button className="button secondary" type="button" onClick={() => copyText('starter', exportBundle.starterFiles)}>
                    {copiedKind === 'starter' ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <pre className="code-block">{exportBundle.starterFiles}</pre>
              </div>
            </div>
          ) : (
            <p className="muted">No blueprint selected.</p>
          )}
        </div>
      </section>
    </div>
  );
}
