import React from "react";

type Props = { size?: "sm" | "md" };

export default function RiskLegend({ size = "md" }: Props) {
  const s = size === "sm" ? 10 : 12;
  const gap = size === "sm" ? 8 : 12;
  const font = size === "sm" ? 12 : 14;
  return (
    <div style={{ display: "flex", gap, alignItems: "center", fontSize: font }}>
      <span><span style={{ background: "#10b981", display: "inline-block", width: s, height: s, marginRight: 6 }} />Baixo</span>
      <span><span style={{ background: "#f59e0b", display: "inline-block", width: s, height: s, marginRight: 6 }} />Moderado</span>
      <span><span style={{ background: "#ef4444", display: "inline-block", width: s, height: s, marginRight: 6 }} />Alto</span>
    </div>
  );
}
