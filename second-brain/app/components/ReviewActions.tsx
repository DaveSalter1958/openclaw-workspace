"use client";

import { useState, useTransition } from 'react';

type ReviewActionsProps = {
  actions: string[];
};

export function ReviewActions({ actions }: ReviewActionsProps) {
  const [created, setCreated] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();

  async function promoteToTask(action: string) {
    if (created.includes(action)) return;

    startTransition(async () => {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: action,
          domain: 'review',
        }),
      });

      if (!response.ok) return;
      setCreated((current) => [...current, action]);
    });
  }

  if (actions.length === 0) {
    return <p className="muted">Nothing obvious to surface.</p>;
  }

  return (
    <div className="list">
      {actions.map((action) => {
        const alreadyCreated = created.includes(action);

        return (
          <article className="item" key={action}>
            <div className="item-top">
              <div>
                <h3>{action}</h3>
              </div>
              <div className="badge-row">
                {alreadyCreated ? <span className="badge">saved as task</span> : null}
                <button
                  className="button secondary"
                  type="button"
                  disabled={isPending || alreadyCreated}
                  onClick={() => promoteToTask(action)}
                >
                  {alreadyCreated ? 'Created' : isPending ? 'Saving…' : 'Promote to task'}
                </button>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
