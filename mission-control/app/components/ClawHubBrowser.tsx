"use client";

import { useEffect, useState, useTransition } from 'react';

type SkillItem = {
  slug: string;
  name?: string;
  description?: string;
  ownerHandle?: string;
  installs?: number;
  downloads?: number;
  stars?: number;
  latestVersion?: string;
  installed?: boolean;
  installedVersion?: string | null;
};

export function ClawHubBrowser() {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('installs');
  const [items, setItems] = useState<SkillItem[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();
  const [busySlug, setBusySlug] = useState('');

  async function loadCurrent() {
    setError('');
    const url = query.trim()
      ? `/mission-control/api/clawhub?mode=search&q=${encodeURIComponent(query.trim())}&limit=24`
      : `/mission-control/api/clawhub?mode=explore&sort=${encodeURIComponent(sort)}&limit=24`;
    const response = await fetch(url);
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || 'Failed to load skills');
      return;
    }
    setItems(data.items || []);
  }

  useEffect(() => {
    void loadCurrent();
  }, [sort]);

  function runSearch() {
    startTransition(async () => {
      await loadCurrent();
      setSelected(null);
    });
  }

  async function inspectSkill(slug: string) {
    setError('');
    const response = await fetch(`/mission-control/api/clawhub?mode=inspect&slug=${encodeURIComponent(slug)}`);
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || 'Inspect failed');
      return;
    }
    setSelected(data);
  }

  async function actOnSkill(slug: string, action: 'install' | 'update', version?: string) {
    setBusySlug(slug);
    setError('');
    const response = await fetch('/mission-control/api/clawhub', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, version, action }),
    });
    const data = await response.json();
    setBusySlug('');
    if (!response.ok) {
      setError(data.error || `${action} failed`);
      return;
    }
    await loadCurrent();
    await inspectSkill(slug);
  }

  return (
    <section className="grid" style={{ gap: 16 }}>
      <section className="card hero" style={{ minHeight: 140 }}>
        <div className="kicker">ClawHub</div>
        <h1>Browse and install skills from Mission Control.</h1>
        <p className="muted" style={{ maxWidth: 760, lineHeight: 1.7 }}>
          Popular skills load first. Search when you want something specific, inspect what it does, and install or update it without leaving Mission Control.
        </p>
      </section>

      <section className="card">
        <div className="clawhub-toolbar">
          <input
            className="clawhub-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') runSearch(); }}
            placeholder="Search ClawHub skills"
          />
          <select className="clawhub-select" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="installs">Popular</option>
            <option value="trending">Trending</option>
            <option value="downloads">Downloads</option>
            <option value="newest">Newest</option>
          </select>
          <button className="reference-primary-button" onClick={runSearch} type="button">
            {isPending ? 'Loading…' : 'Search'}
          </button>
        </div>
        {error ? <p className="muted">{error}</p> : null}
      </section>

      <section className="grid grid-2-1">
        <div className="list">
          {items.map((item) => (
            <article className="item clawhub-item" key={item.slug}>
              <div className="item-top">
                <div>
                  <h3>{item.name || item.slug}</h3>
                  <p className="muted small">{item.slug}{item.ownerHandle ? ` · @${item.ownerHandle}` : ''}</p>
                </div>
                <div className="badge-row">
                  {item.installed ? <span className="status-pill active">Installed</span> : null}
                  {typeof item.installs === 'number' ? <span className="status-pill priority-medium">{item.installs} installs</span> : null}
                </div>
              </div>
              <p className="body-copy">{item.description || 'No description available.'}</p>
              <div className="clawhub-stats muted small">
                <span>v{item.latestVersion || '—'}</span>
                <span>{item.downloads || 0} downloads</span>
                <span>{item.stars || 0} stars</span>
                {item.installedVersion ? <span>installed {item.installedVersion}</span> : null}
              </div>
              <div className="clawhub-actions">
                <button className="mission-nav-link clawhub-button" type="button" onClick={() => inspectSkill(item.slug)}>Inspect</button>
                {item.installed ? (
                  <button className="reference-primary-button" type="button" onClick={() => actOnSkill(item.slug, 'update', item.latestVersion)} disabled={busySlug === item.slug}>
                    {busySlug === item.slug ? 'Updating…' : 'Update'}
                  </button>
                ) : (
                  <button className="reference-primary-button" type="button" onClick={() => actOnSkill(item.slug, 'install', item.latestVersion)} disabled={busySlug === item.slug}>
                    {busySlug === item.slug ? 'Installing…' : 'Install'}
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>

        <aside className="card">
          <div className="section-title">
            <div>
              <h2>Skill detail</h2>
              <p className="muted small">Inspect a skill before installing it.</p>
            </div>
          </div>
          {selected ? (
            <div className="grid" style={{ gap: 12 }}>
              <div>
                <p className="eyebrow">Skill</p>
                <h2>{selected.name || selected.slug}</h2>
                <p className="muted small">{selected.slug}{selected.ownerHandle ? ` · @${selected.ownerHandle}` : ''}</p>
              </div>
              <p className="body-copy">{selected.description || 'No description available.'}</p>
              <div className="clawhub-stats muted small">
                <span>latest {selected.latestVersion || '—'}</span>
                <span>{selected.downloads || 0} downloads</span>
                <span>{selected.stars || 0} stars</span>
                {selected.installedVersion ? <span>installed {selected.installedVersion}</span> : null}
              </div>
              <div className="clawhub-actions">
                {selected.installed ? (
                  <button className="reference-primary-button" type="button" onClick={() => actOnSkill(selected.slug, 'update', selected.latestVersion)} disabled={busySlug === selected.slug}>
                    {busySlug === selected.slug ? 'Updating…' : 'Update skill'}
                  </button>
                ) : (
                  <button className="reference-primary-button" type="button" onClick={() => actOnSkill(selected.slug, 'install', selected.latestVersion)} disabled={busySlug === selected.slug}>
                    {busySlug === selected.slug ? 'Installing…' : 'Install skill'}
                  </button>
                )}
              </div>
            </div>
          ) : <p className="muted">Pick a skill to inspect it.</p>}
        </aside>
      </section>
    </section>
  );
}
