"use client";

import { useEffect, useState, useTransition } from 'react';

export function PlanHubGuyPanel() {
  const [enabled, setEnabled] = useState(false);
  const [mode, setMode] = useState<'test' | 'live'>('test');
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [lastRunMessage, setLastRunMessage] = useState('');
  const [sampleEmail, setSampleEmail] = useState('manuel@magallonconstruction.com');
  const [sampleTemplate, setSampleTemplate] = useState<'template1' | 'template2' | 'template3'>('template1');
  const [confidenceLevels, setConfidenceLevels] = useState<string[]>(['High', 'Medium', 'Low']);
  const [testGroupEmails, setTestGroupEmails] = useState<string[]>([]);
  const [testGroupDetails, setTestGroupDetails] = useState<Array<{ email: string; confidence: string; project: string }>>([]);
  const [testingOpen, setTestingOpen] = useState(false);

  async function load() {
    const res = await fetch('/mission-control/api/planhubguy');
    const data = await res.json();
    setEnabled(Boolean(data.enabled));
    setMode(data.mode === 'live' ? 'live' : 'test');
    setUpdatedAt(data.updatedAt || null);
    setConfidenceLevels(Array.isArray(data.confidenceLevels) ? data.confidenceLevels : ['High', 'Medium', 'Low']);
    const groupRes = await fetch('/mission-control/api/planhubguy/test-group');
    const groupData = await groupRes.json();
    setTestGroupEmails(Array.isArray(groupData.testGroupEmails) ? groupData.testGroupEmails : []);
    setTestGroupDetails(Array.isArray(groupData.testGroupDetails) ? groupData.testGroupDetails : []);
  }

  useEffect(() => {
    void load();
  }, []);

  function saveState(next: { enabled?: boolean; mode?: 'test' | 'live' }) {
    startTransition(async () => {
      const res = await fetch('/mission-control/api/planhubguy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      const data = await res.json();
      setEnabled(Boolean(data.enabled));
      setMode(data.mode === 'live' ? 'live' : 'test');
      setUpdatedAt(data.updatedAt || null);
    });
  }

  return (
    <main className="grid" style={{ gap: 16 }}>
      <section className="grid grid-2-1">
        <section className="card">
          <div className="section-title">
            <div>
              <h2>Status</h2>
              <p className="muted small">Current operational state.</p>
            </div>
          </div>
          <div className="grid" style={{ gap: 12 }}>
            <div className="item">
              <div className="item-top">
                <div>
                  <h3>{enabled ? 'Enabled' : 'Paused'}</h3>
                  <p className="muted small">{enabled ? 'PlanHubGuy is allowed to run the workflow.' : 'PlanHubGuy is currently paused.'}</p>
                </div>
                <span className={`status-pill ${enabled ? 'active' : 'priority-low'}`}>{enabled ? 'Running' : 'Stopped'}</span>
              </div>
              <p className="muted small">Mode: <strong>{mode === 'live' ? 'Live (real recipients)' : 'Test (internal DRS samples only)'}</strong></p>
              <p className="muted small">Last changed: {updatedAt ?? 'not set yet'}</p>
            </div>
            <div className="clawhub-actions">
              <button className="reference-primary-button planhub-start-button" type="button" disabled={isPending || enabled} onClick={() => saveState({ enabled: true })}>
                {isPending && !enabled ? 'Starting…' : 'Start'}
              </button>
              <button className="mission-nav-link clawhub-button planhub-stop-button" type="button" disabled={isPending || !enabled} onClick={() => saveState({ enabled: false })}>
                {isPending && enabled ? 'Stopping…' : 'Stop'}
              </button>
              <button className={`mission-nav-link clawhub-button ${mode === 'test' ? 'planhub-start-button' : ''}`} type="button" disabled={isPending || mode === 'test'} onClick={() => saveState({ mode: 'test' })}>
                Test mode
              </button>
              <button className={`mission-nav-link clawhub-button ${mode === 'live' ? 'planhub-start-button' : ''}`} type="button" disabled={isPending || mode === 'live'} onClick={() => saveState({ mode: 'live' })}>
                Live mode
              </button>
            </div>
            {lastRunMessage ? <p className="muted small">{lastRunMessage}</p> : null}
          </div>
        </section>

        <aside className="card">
          <div className="section-title">
            <div>
              <h2>Current remit</h2>
              <p className="muted small">What PlanHubGuy is meant to handle.</p>
            </div>
          </div>
          <ul className="muted" style={{ lineHeight: 1.9, paddingLeft: 18 }}>
            <li>Review updated PlanHub leads</li>
            <li>Maintain unique-email tracking</li>
            <li>In test mode, send internal samples only to DRS@DRS-Engineering.net</li>
            <li>In live mode, send approved outreach to real filtered recipient emails from Dave@DRS-Engineering.net</li>
            <li>Track projects already referenced</li>
            <li>Monitor valid replies and notify DRS@DRS-Engineering.net</li>
          </ul>
        </aside>
      </section>

      <section className="card">
        <div className="section-title">
          <div>
            <h2>Excavation confidence filter</h2>
            <p className="muted small">Choose which excavation-confidence levels are eligible for outreach.</p>
          </div>
        </div>
        <div className="clawhub-actions" style={{ gap: 12, flexWrap: 'wrap' }}>
          {['High', 'Medium', 'Low'].map((level) => (
            <label key={level} className="muted small" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={confidenceLevels.includes(level)}
                onChange={(e) => {
                  const next = e.target.checked ? [...confidenceLevels, level] : confidenceLevels.filter((item) => item !== level);
                  setConfidenceLevels(next);
                }}
              />
              {level}
            </label>
          ))}
          <button
            className="reference-primary-button"
            type="button"
            disabled={isPending}
            onClick={() => startTransition(async () => {
              const res = await fetch('/mission-control/api/planhubguy/filter', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ confidenceLevels }),
              });
              const data = await res.json();
              setLastRunMessage(res.ok ? `Saved confidence filter: ${(data.confidenceLevels || []).join(', ')}` : 'Failed to save confidence filter.');
            })}
          >
            Save confidence filter
          </button>
        </div>
      </section>

      <section className="card">
        <div className="section-title">
          <div>
            <h2>Logs</h2>
            <p className="muted small">Quick links to PlanHubGuy logs.</p>
          </div>
        </div>
        <div className="clawhub-actions" style={{ gap: 10, flexWrap: 'wrap' }}>
          <a className="mission-nav-link clawhub-button" href="https://docs.google.com/spreadsheets/d/1AJ5p4YHb3T1PtfFW8CFulVK1cHcDZT7cqrTxoo3An7s/edit#gid=2080954848" target="_blank" rel="noreferrer">Test Log</a>
          <a className="mission-nav-link clawhub-button" href="https://docs.google.com/spreadsheets/d/1AJ5p4YHb3T1PtfFW8CFulVK1cHcDZT7cqrTxoo3An7s/edit#gid=2085353928" target="_blank" rel="noreferrer">Outreach Log</a>
          <a className="mission-nav-link clawhub-button" href="https://docs.google.com/spreadsheets/d/1AJ5p4YHb3T1PtfFW8CFulVK1cHcDZT7cqrTxoo3An7s/edit#gid=702983069" target="_blank" rel="noreferrer">Response Log</a>
        </div>
      </section>

      <section className="card">
        <div className="section-title">
          <div>
            <h2>Testing mode</h2>
            <p className="muted small">Open internal testing tools for samples and balanced test groups.</p>
          </div>
          <button className="mission-nav-link clawhub-button" type="button" onClick={() => setTestingOpen((v) => !v)}>
            {testingOpen ? 'Hide testing tools' : 'Open testing tools'}
          </button>
        </div>
        {testingOpen ? (
          <div className="grid" style={{ gap: 16 }}>
            <section className="item">
              <div className="section-title">
                <div>
                  <h3>Random test group</h3>
                  <p className="muted small">Generate a temporary sample of unique emails for controlled testing.</p>
                </div>
              </div>
              <div className="grid" style={{ gap: 12 }}>
                <div className="clawhub-actions">
                  <button
                    className="reference-primary-button"
                    type="button"
                    disabled={isPending}
                    onClick={() => startTransition(async () => {
                      const res = await fetch('/mission-control/api/planhubguy/test-group', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ count: 9, balanced: true }),
                      });
                      const data = await res.json();
                      setTestGroupEmails(Array.isArray(data.testGroupEmails) ? data.testGroupEmails : []);
                      setTestGroupDetails(Array.isArray(data.testGroupDetails) ? data.testGroupDetails : []);
                      setLastRunMessage(res.ok ? `Generated balanced test group with ${(data.testGroupEmails || []).length} emails.` : 'Failed to generate balanced test group.');
                    })}
                  >
                    Generate balanced 9-email test group
                  </button>
                </div>
                {testGroupEmails.length ? (
                  <div className="item">
                    <div className="item-top"><div><h3>Current test group</h3><p className="muted small">Temporary sample set.</p></div></div>
                    <ul className="muted small" style={{ paddingLeft: 18, lineHeight: 1.8, margin: 0 }}>
                      {testGroupDetails.map((item) => <li key={item.email}><strong>{item.email}</strong> — {item.confidence || 'Unknown'} — {item.project || 'No project shown'}</li>)}
                    </ul>
                    {testGroupEmails.length < 9 ? <p className="muted small">Only {testGroupEmails.length} matching emails were available for the balanced group under the current filter.</p> : null}
                    <div className="clawhub-actions" style={{ marginTop: 12 }}>
                      <button
                        className="reference-primary-button"
                        type="button"
                        disabled={isPending || testGroupEmails.length === 0}
                        onClick={() => startTransition(async () => {
                          const res = await fetch('/mission-control/api/planhubguy/test-group/run', { method: 'POST' });
                          const data = await res.json();
                          setLastRunMessage(res.ok ? `Ran test group (${testGroupEmails.length} emails). Output goes to DRS@DRS-Engineering.net.` : `Test-group run failed: ${data.error || 'unknown error'}`);
                        })}
                      >
                        Run test group to DRS inbox
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </section>

            <section className="item">
              <div className="section-title">
                <div>
                  <h3>Explicit sample generator</h3>
                  <p className="muted small">Send one internal sample for a chosen contact and template.</p>
                </div>
              </div>
              <div className="grid" style={{ gap: 12 }}>
                <label className="muted small">
                  Contact email
                  <input value={sampleEmail} onChange={(e) => setSampleEmail(e.target.value)} style={{ width: '100%', marginTop: 6, padding: '10px 12px' }} />
                </label>
                <label className="muted small">
                  Template
                  <select value={sampleTemplate} onChange={(e) => setSampleTemplate(e.target.value as 'template1' | 'template2' | 'template3')} style={{ width: '100%', marginTop: 6, padding: '10px 12px' }}>
                    <option value="template1">template1</option>
                    <option value="template2">template2</option>
                    <option value="template3">template3</option>
                  </select>
                </label>
                <div className="clawhub-actions">
                  <button
                    className="reference-primary-button"
                    type="button"
                    disabled={isPending || !sampleEmail.trim()}
                    onClick={() => startTransition(async () => {
                      const res = await fetch('/mission-control/api/planhubguy/sample', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email: sampleEmail.trim(), template: sampleTemplate }),
                      });
                      const data = await res.json();
                      setLastRunMessage(res.ok ? `Explicit sample sent for ${sampleEmail.trim()} (${sampleTemplate}).` : `Sample failed: ${data.error || 'unknown error'}`);
                    })}
                  >
                    Send explicit sample
                  </button>
                </div>
              </div>
            </section>
          </div>
        ) : null}
      </section>
    </main>
  );
}
