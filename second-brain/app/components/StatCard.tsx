export function StatCard({ label, value, hint }: { label: string; value: number | string; hint: string }) {
  return (
    <div className="card">
      <div className="muted small">{label}</div>
      <div className="metric">{value}</div>
      <div className="muted small">{hint}</div>
    </div>
  );
}
