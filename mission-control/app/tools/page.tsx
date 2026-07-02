import Link from 'next/link';
import { getCalendarView } from '@/lib/data';

export const dynamic = 'force-dynamic';

function localDateKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function dayKey(date: Date) {
  return localDateKey(date);
}

function dayLabel(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function eventTimeLabel(startSort: string, allDay?: boolean) {
  if (allDay) return 'All day';
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(startSort));
}

export default async function ToolsPage() {
  const { googleEvents, googleError } = await getCalendarView(7);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const days = Array.from({ length: 8 }, (_, index) => {
    const day = new Date(today);
    day.setDate(today.getDate() + index);
    return {
      key: dayKey(day),
      label: index === 0 ? 'Today' : dayLabel(day),
    };
  });

  const eventsByDay = new Map<string, typeof googleEvents>();
  for (const day of days) eventsByDay.set(day.key, []);
  for (const event of googleEvents) {
    const key = localDateKey(new Date(event.startSort));
    if (eventsByDay.has(key)) eventsByDay.get(key)!.push(event);
  }

  return (
    <main className="grid" style={{ gap: 16 }}>
      <section className="card calendar-table-card">
        {googleError ? (
          <div className="calendar-status" role="status">
            Google Calendar is unavailable: {googleError}
          </div>
        ) : null}
        <div className="calendar-table-wrap">
          <div className="calendar-table-header">
            {days.map((day, index) => (
              <div className={`calendar-table-day ${index === 0 ? 'today' : ''}`} key={day.key}>{day.label}</div>
            ))}
          </div>
          <div className="calendar-table-body">
            {days.map((day) => {
              const events = eventsByDay.get(day.key) ?? [];
              return (
                <div className="calendar-table-column" key={day.key}>
                  {events.length > 0 ? events.map((event) => (
                    <article className="calendar-table-event" key={event.id}>
                      <div className="calendar-table-event-time">{eventTimeLabel(event.startSort, event.allDay)}</div>
                      <div className="calendar-table-event-title">{event.summary}</div>
                      {event.location ? <div className="calendar-table-event-meta">{event.location}</div> : null}
                      {event.link ? <div className="calendar-table-event-link"><Link href={event.link}>Open</Link></div> : null}
                    </article>
                  )) : <div className="calendar-table-empty">No events</div>}
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </main>
  );
}
