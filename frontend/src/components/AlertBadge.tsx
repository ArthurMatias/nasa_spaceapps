type Props = { risk: "low" | "moderate" | "high" | string; nextCritical?: string | null };
const color = (risk: string) => (risk === "high" ? "#ef4444" : risk === "moderate" ? "#f59e0b" : "#10b981");

export default function AlertBadge({ risk, nextCritical }: Props) {
  return (
    <div style={{ display: "grid", gap: 8, padding: 12, borderRadius: 8, background: "#111827", border: "1px solid #374151", color: "#e5e7eb" }}>
      <div>
        <b>Current Risk:</b>{" "} 
        <span style={{ background: color(risk), color: "#fff", padding: "4px 10px", borderRadius: 8 }}>
          {risk.toUpperCase()}
        </span>
      </div>
      {nextCritical && (
        <div>
          <b>Next Critical Hour:</b>{" "} 
          <span style={{ color: "#fca5a5" }}>{nextCritical}</span>
        </div>
      )}
    </div>
  );
}