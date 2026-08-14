import { getGolfDashboard } from '@/lib/data';
import type { GolfRoundSummary } from '@/lib/types';

export const dynamic = 'force-dynamic';

function statValue(value: number | string | undefined) {
  if (value === undefined || value === '') return '-';
  return value;
}

function numberLabel(value: number | undefined) {
  return value === undefined ? '-' : String(value);
}

function dateLabel(value: string | undefined) {
  if (!value) return 'Not set';
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function shortDateLabel(value: string) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function StatTile({ label, value, hint }: { label: string; value: number | string | undefined; hint: string }) {
  return (
    <article className="golf-stat-tile">
      <div className="golf-stat-label">{label}</div>
      <div className="golf-stat-value">{statValue(value)}</div>
      <div className="golf-stat-hint">{hint}</div>
    </article>
  );
}

function HoleGrid({ round }: { round: GolfRoundSummary }) {
  const holes = Array.from({ length: 18 }, (_, index) => {
    const number = index + 1;
    return round.holes.find((hole) => hole.number === number) || { number, noteCount: 0 };
  });

  return (
    <div className="golf-hole-grid" aria-label={`Hole scores for ${round.course}`}>
      {holes.map((hole) => (
        <div className={`golf-hole-cell ${hole.score === undefined ? 'is-empty' : ''}`} key={hole.number}>
          <span>{hole.number}</span>
          <strong>{numberLabel(hole.score)}</strong>
        </div>
      ))}
    </div>
  );
}

function RoundCard({ round }: { round: GolfRoundSummary }) {
  return (
    <article className="golf-round-card">
      <div className="golf-round-head">
        <div>
          <h3>{round.course}</h3>
          <p>{dateLabel(round.date)} / {round.teeLabel}</p>
        </div>
        <div className="golf-round-score">{numberLabel(round.totalScore)}</div>
      </div>
      <HoleGrid round={round} />
      <div className="golf-round-meta">
        <span>{round.holesScored}/18 holes</span>
        <span>{round.format}</span>
        <span>{round.totalPutts ? `${round.totalPutts} putts` : 'Putts incomplete'}</span>
        <span>{round.penalties ? `${round.penalties} penalties` : 'No penalties logged'}</span>
      </div>
      {round.notes ? <p className="golf-round-notes">{round.notes}</p> : null}
    </article>
  );
}

export default async function GolfPage() {
  const { rounds, courses, profile, stats } = await getGolfDashboard();
  const scoredRounds = rounds.filter((round) => round.totalScore !== undefined).slice().reverse();
  const minScore = scoredRounds.length ? Math.min(...scoredRounds.map((round) => round.totalScore || 0)) : 0;
  const maxScore = scoredRounds.length ? Math.max(...scoredRounds.map((round) => round.totalScore || 0)) : 0;
  const scoreRange = Math.max(1, maxScore - minScore);

  return (
    <main className="golf-page">
      <section className="golf-hero">
        <div>
          <div className="reference-title-pill">Golf</div>
          <h1>Golf scores</h1>
          <p>Scores captured from Telegram dictation and scorecard photos, summarized in Mission Control.</p>
        </div>
        <div className="golf-hero-current">
          <span>Latest scored round</span>
          <strong>{numberLabel(stats.latestScore)}</strong>
          <small>{stats.latestCourse ? `${stats.latestCourse} / ${dateLabel(stats.latestDate)}` : 'No rounds saved yet'}</small>
        </div>
      </section>

      <section className="golf-stat-grid" aria-label="Golf score summary">
        <StatTile label="Rounds" value={stats.rounds} hint={`${stats.completedRounds} completed`} />
        <StatTile label="Best score" value={stats.bestScore} hint="Lowest stored gross score" />
        <StatTile label="Average" value={stats.averageScore} hint="Stored scored rounds" />
        <StatTile label="Latest" value={stats.latestScore} hint={stats.latestCourse || 'No latest score'} />
        <StatTile label="GHIN index" value={profile.handicapIndex} hint={profile.handicapUpdatedAt ? `Updated ${dateLabel(profile.handicapUpdatedAt)}` : 'Not set yet'} />
      </section>

      <section className="golf-layout">
        <div className="golf-main-column">
          <section className="golf-panel">
            <div className="golf-section-head">
              <h2>Recent score trend</h2>
              <span>{scoredRounds.length} scored rounds</span>
            </div>
            {scoredRounds.length ? (
              <div className="golf-score-chart">
                {scoredRounds.map((round) => {
                  const score = round.totalScore || 0;
                  const height = 34 + ((score - minScore) / scoreRange) * 58;
                  return (
                    <div className="golf-chart-item" key={round.id}>
                      <div className="golf-chart-bar-wrap">
                        <div className="golf-chart-bar" style={{ height: `${height}%` }}>
                          <span>{score}</span>
                        </div>
                      </div>
                      <strong>{shortDateLabel(round.date)}</strong>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="muted">No scored rounds are stored yet.</p>
            )}
          </section>

          <section className="golf-panel">
            <div className="golf-section-head">
              <h2>Round ledger</h2>
              <span>{rounds.length} rounds</span>
            </div>
            <div className="golf-round-table-wrap">
              <table className="golf-round-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Course</th>
                    <th>Tee</th>
                    <th>Score</th>
                    <th>Holes</th>
                    <th>Putts</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rounds.map((round) => (
                    <tr key={round.id}>
                      <td>{dateLabel(round.date)}</td>
                      <th>{round.course}</th>
                      <td>{round.teeLabel}</td>
                      <td>{numberLabel(round.totalScore)}</td>
                      <td>{round.holesScored}/18</td>
                      <td>{numberLabel(round.totalPutts)}</td>
                      <td>{round.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="golf-round-list">
            {rounds.map((round) => <RoundCard key={round.id} round={round} />)}
          </section>
        </div>

        <aside className="golf-side-column">
          <section className="golf-panel golf-handicap-panel">
            <div className="golf-section-head">
              <h2>Handicap</h2>
              <span>{profile.playerName}</span>
            </div>
            <div className="golf-handicap-number">{numberLabel(profile.handicapIndex)}</div>
            <div className="golf-ghin-row">
              <span>GHIN</span>
              <strong>{profile.ghinNumber || 'Not set'}</strong>
            </div>
            <p>{profile.handicapIndex === undefined ? 'GHIN handicap index is not set locally yet.' : `Source: ${profile.handicapSource}`}</p>
            <div className="golf-handicap-formula">Course handicap = index x slope / 113 + rating - par</div>
          </section>

          <section className="golf-panel">
            <div className="golf-section-head">
              <h2>Courses</h2>
              <span>{courses.length}</span>
            </div>
            <div className="golf-course-list">
              {courses.map((course) => (
                <article className="golf-course-row" key={course.course}>
                  <div>
                    <h3>{course.course}</h3>
                    <p>{course.rounds} round{course.rounds === 1 ? '' : 's'} / latest {dateLabel(course.latestDate)}</p>
                  </div>
                  <div className="golf-course-score">
                    <strong>{numberLabel(course.bestScore)}</strong>
                    <span>best</span>
                  </div>
                  <div className="golf-course-score">
                    <strong>{numberLabel(course.averageScore)}</strong>
                    <span>avg</span>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="golf-panel golf-capture-panel">
            <h2>Capture flow</h2>
            <p>Keep sending scorecards or dictated holes through Telegram. This page will update from the local golf store after the round is captured.</p>
          </section>
        </aside>
      </section>
    </main>
  );
}
