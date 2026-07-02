import { getMorningBriefData } from '@/lib/data';

export default async function MorningPage() {
  const { summary, activeTasks, todayTasks, tomorrowTasks, completedToday, todaysEvents, emailScan, replyCandidates, suggestedPriorities, conflictWarnings } = await getMorningBriefData();

  return (
    <main className="grid" style={{ gap: 18 }}>
      <section className="card hero">
        <div className="kicker">Morning brief</div>
        <h1>Start the day with the useful truth, not the noise.</h1>
        <p className="muted">A compact operational brief from your tasks, calendar, and inbox.</p>
        <div className="badge-row">
          <span className="badge">{activeTasks.length} active tasks</span>
          <span className="badge">{todaysEvents.length} calendar items</span>
          <span className="badge">{replyCandidates.length} reply-likely emails</span>
          <span className="badge">{conflictWarnings.length} calendar warnings</span>
        </div>
      </section>

      <section className="card">
        <div className="section-title"><div><h2>Summary</h2><p className="muted small">The blunt morning view.</p></div></div>
        <div className="list">
          {summary.map((line) => (
            <article className="item" key={line}><h3>{line}</h3></article>
          ))}
        </div>
      </section>

      <section className="grid grid-2">
        <div className="card">
          <div className="section-title"><div><h2>Today’s tasks</h2><p className="muted small">Ordered by priority, then time.</p></div></div>
          <div className="list">
            {todayTasks.length > 0 ? todayTasks.map((task) => (
              <article className="item" key={task.id}>
                <h3>{task.title}</h3>
                <p className="muted small">{task.priority} · {task.dueTime ? task.dueTime : 'today'}</p>
                {task.notes ? <p className="muted">{task.notes}</p> : null}
              </article>
            )) : <p className="muted">No tasks due today.</p>}
          </div>
        </div>

        <div className="card">
          <div className="section-title"><div><h2>Calendar today</h2><p className="muted small">What is on the books.</p></div></div>
          <div className="list">
            {todaysEvents.length > 0 ? todaysEvents.map((event) => (
              <article className="item" key={event.id}>
                <h3>{event.title}</h3>
                <p className="muted small">{event.start}{event.allDay ? ' · all day' : ''}</p>
                {event.location ? <p className="muted small">{event.location}</p> : null}
              </article>
            )) : <p className="muted">No events found for today.</p>}
          </div>
        </div>
      </section>

      <section className="grid grid-2">
        <div className="card">
          <div className="section-title"><div><h2>Tomorrow’s tasks</h2><p className="muted small">Next day, same clean order.</p></div></div>
          <div className="list">
            {tomorrowTasks.length > 0 ? tomorrowTasks.map((task) => (
              <article className="item" key={task.id}>
                <h3>{task.title}</h3>
                <p className="muted small">{task.priority} · {task.dueTime ? task.dueTime : 'tomorrow'}</p>
                {task.notes ? <p className="muted">{task.notes}</p> : null}
              </article>
            )) : <p className="muted">No tasks due tomorrow.</p>}
          </div>
        </div>

        <div className="card">
          <div className="section-title"><div><h2>Email scan</h2><p className="muted small">Just sender and whether it likely needs a response.</p></div></div>
          <div className="list">
            {emailScan.length > 0 ? emailScan.map((item) => (
              <article className="item" key={item.id}>
                <h3>{item.sender}</h3>
                <p className="muted small">{item.responseHint} · {item.date}</p>
              </article>
            )) : <p className="muted">No inbox items surfaced.</p>}
          </div>
        </div>
      </section>

      <section className="grid grid-2">
        <div className="card">
          <div className="section-title"><div><h2>Suggested priorities</h2><p className="muted small">If you only do a few things, do these.</p></div></div>
          <div className="list">
            {suggestedPriorities.map((item) => (
              <article className="item" key={item}><h3>{item}</h3></article>
            ))}
            {activeTasks.length === 0 ? <p className="muted">No immediate priorities surfaced.</p> : null}
          </div>
        </div>

        <div className="card">
          <div className="section-title"><div><h2>Calendar conflict warnings</h2><p className="muted small">Crowded or tightly stacked days get surfaced here.</p></div></div>
          <div className="list">
            {conflictWarnings.length > 0 ? conflictWarnings.map((warning) => (
              <article className="item" key={warning}><h3>{warning}</h3></article>
            )) : <p className="muted">No obvious calendar conflicts detected.</p>}
          </div>
        </div>
      </section>

      <section className="card">
        <div className="section-title"><div><h2>Recently completed</h2><p className="muted small">Proof of motion.</p></div></div>
        <div className="list">
          {completedToday.length > 0 ? completedToday.map((task) => (
            <article className="item" key={task.id}>
              <h3>{task.title}</h3>
              <p className="muted small">{task.domain} · done</p>
            </article>
          )) : <p className="muted">No completed tasks to surface.</p>}
        </div>
      </section>
    </main>
  );
}
