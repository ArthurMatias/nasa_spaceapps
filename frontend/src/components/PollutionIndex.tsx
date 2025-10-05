
type Props = {
  value: number;
  label?: string;
};

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

export default function PollutionIndex({ value, label = "Air Pollution Index" }: Props) {
  const v = clamp(Math.round(value), 0, 100);
  const color =
    v >= 70 ? "#ef4444" : v >= 40 ? "#f59e0b" : "#10b981";

  return (
    <div style={{ display: "grid", gap: 8, width: 220 }}>
      <div style={{ fontSize: 14, opacity: 0.9 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <div
          style={{
            width: 72,
            height: 56,
            borderRadius: 10,
            background: "#0b0f19",
            border: "1px solid #1f2937",
            display: "grid",
            placeItems: "center",
            color,
            fontSize: 28,
            fontWeight: 800,
            lineHeight: 1,
          }}
        >
          {v}
        </div>
        <div style={{ flex: 1 }}>
          <div
            style={{
              height: 10,
              borderRadius: 6,
              background: "#0f172a",
              border: "1px solid #1f2937",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${v}%`,
                height: "100%",
                background: color,
              }}
            />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, opacity: 0.7, marginTop: 6 }}>
            <span>Good</span>
            <span>Moderate</span>
            <span>High</span>
          </div>
        </div>
      </div>
    </div>
  );
}
