import { ReviewActions } from '@/app/components/ReviewActions';
import { getWeeklyReviewData } from '@/lib/data';

export default async function ReviewPage() {
  const {
    stats,
    recentMemories,
    openTasks,
    completedTasks,
    staleDocuments,
    workspaceDocuments,
    dropboxHighlights,
    suggestedActions,
    upcomingEvents,
    dayLoad,
    overloadedDays,
    taskPressure,
  } = await getWeeklyReviewData();

  return (
    <main className="grid" style={{ gap: 18 }}>
      <section className="card hero">
        <div className="kicker">Weekly review</div>
        <h1>Review the state of your world without drowning in it.</h1>
        <p className="muted">
          This page is built to answer the practical weekly questions: what still matters, what is stale,
          what is open, and what deserves attention next.
        </p>
        <div className="badge-row">
          <span className="badge">{stats.openTasks} open tasks</span>
          <span className="badge">{stats.documents} surfaced documents</span>
          <span className="badge">{stats.memories} memory entries</span>
          <span className="badge">{upcomingEvents.length} upcoming events</span>
        </div>
      </section>

      <section className="grid grid-2-1">
        <div className="card">
          <div className="section-title">
            <div>
              <h2>Suggested actions</h2>
              <p className="muted small">A blunt shortlist, not a motivational poster.</p>
            </div>
          </div>
          <ReviewActions actions={suggestedActions} />
        </div>

        <div className="grid" style={{ gap: 18 }}>
          <div className="card">
            <h2>Open vs completed</h2>
            <p className="muted small">{stats.openTasks} open · {stats.completedTasks} completed</p>
          </div>
          <div className="card">
            <h2>Document split</h2>
            <p className="muted small">{stats.workspaceDocuments} workspace · {stats.dropboxDocuments} Dropbox</p>
          </div>
          <div className="card">
            <h2>Overloaded days</h2>
            <p className="muted small">{overloadedDays.length > 0 ? overloadedDays.map((day) => day.day).join(' · ') : 'None flagged'}</p>
          </div>
        </div>
      </section>

      <section className="grid grid-3">
        <div className="card">
          <div className="section-title">
            <div>
              <h2>Recent memories</h2>
              <p className="muted small">What context should still be alive in your head.</p>
            </div>
          </div>
          <div className="list">
            {recentMemories.map((memory) => (
              <article className="item" key={memory.id}>
                <h3>{memory.title}</h3>
                <p className="muted small">{memory.date} · {memory.source}</p>
                <p className="muted">{memory.summary}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="section-title">
            <div>
              <h2>Open tasks</h2>
              <p className="muted small">The queue that still has teeth.</p>
            </div>
          </div>
          <div className="list">
            {openTasks.length > 0 ? openTasks.map((task) => (
              <article className="item" key={task.id}>
                <h3>{task.title}</h3>
                <p className="muted small">{task.domain} · {task.priority} · due {task.dueDate}</p>
              </article>
            )) : <p className="muted">No open tasks.</p>}
          </div>
        </div>

        <div className="card">
          <div className="section-title">
            <div>
              <h2>Upcoming calendar</h2>
              <p className="muted small">Next 7 days from Google Calendar.</p>
            </div>
          </div>
          <div className="list">
            {upcomingEvents.length > 0 ? upcomingEvents.map((event) => (
              <article className="item" key={event.id}>
                <h3>{event.title}</h3>
                <p className="muted small">{event.start}{event.allDay ? ' · all day' : ''}</p>
                <p className="muted small">{event.source}{event.location ? ` · ${event.location}` : ''}</p>
              </article>
            )) : <p className="muted">No upcoming events found.</p>}
          </div>
        </div>
      </section>

      <section className="grid grid-2">
        <div className="card">
          <div className="section-title">
            <div>
              <h2>Task pressure</h2>
              <p className="muted small">Things due too soon for comfort.</p>
            </div>
          </div>
          <div className="list">
            {taskPressure.length > 0 ? taskPressure.map((task) => (
              <article className="item" key={task.taskId}>
                <h3>{task.title}</h3>
                <p className="muted small">{task.domain} · {task.priority} · {task.timing} · due {task.dueDate}</p>
              </article>
            )) : <p className="muted">No immediate task pressure.</p>}
          </div>
        </div>

        <div className="card">
          <div className="section-title">
            <div>
              <h2>Calendar load</h2>
              <p className="muted small">Which days are starting to look crowded.</p>
            </div>
          </div>
          <div className="list">
            {dayLoad.length > 0 ? dayLoad.map((day) => (
              <article className="item" key={day.day}>
                <div className="item-top">
                  <div>
                    <h3>{day.day}</h3>
                    <p className="muted small">{day.count} event(s)</p>
                  </div>
                  {day.overloaded ? <span className="tag">crowded</span> : null}
                </div>
                <p className="muted small">{day.titles.slice(0, 3).join(' • ')}</p>
              </article>
            )) : <p className="muted">No upcoming calendar load found.</p>}
          </div>
        </div>
      </section>

      <section className="grid grid-3">
        <div className="card">
          <div className="section-title">
            <div>
              <h2>Stale documents</h2>
              <p className="muted small">Things that probably want updating.</p>
            </div>
          </div>
          <div className="list">
            {staleDocuments.length > 0 ? staleDocuments.map((document) => (
              <article className="item" key={document.id}>
                <h3>{document.title}</h3>
                <p className="muted small">{document.source}</p>
                <p className="muted">{document.summary}</p>
              </article>
            )) : <p className="muted">No stale documents.</p>}
          </div>
        </div>

        <div className="card">
          <div className="section-title">
            <div>
              <h2>Workspace notes</h2>
              <p className="muted small">Core notes worth revisiting.</p>
            </div>
          </div>
          <div className="list">
            {workspaceDocuments.map((document) => (
              <article className="item" key={document.id}>
                <h3>{document.title}</h3>
                <p className="muted small">{document.path}</p>
                <p className="muted">{document.summary}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="section-title">
            <div>
              <h2>Dropbox highlights</h2>
              <p className="muted small">Recent or relevant surfaced Dropbox items.</p>
            </div>
          </div>
          <div className="list">
            {dropboxHighlights.map((document) => (
              <article className="item" key={document.id}>
                <h3>{document.title}</h3>
                <p className="muted small">{document.path}</p>
                <p className="muted">{document.summary}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="card">
        <div className="section-title">
          <div>
            <h2>Recently completed</h2>
            <p className="muted small">A bit of evidence that things do in fact move.</p>
          </div>
        </div>
        <div className="list">
          {completedTasks.length > 0 ? completedTasks.map((task) => (
            <article className="item" key={task.id}>
              <h3>{task.title}</h3>
              <p className="muted small">{task.domain} · done</p>
            </article>
          )) : <p className="muted">No completed tasks yet.</p>}
        </div>
      </section>
    </main>
  );
}
