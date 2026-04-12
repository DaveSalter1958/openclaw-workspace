export function StatCard({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="card stat-card">
      <p className="eyebrow">{label}</p>
      <div className="metric">{value}</div>
      <p className="muted small">{hint}</p>
    </div>
  );
}
