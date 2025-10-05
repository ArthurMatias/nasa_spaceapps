import React from "react";

type TempoInfo = {
  collection_id?: string;
  temporal_used?: { start?: string; end?: string };
  bbox_used?: { minLon: number; minLat: number; maxLon: number; maxLat: number };
  granules?: string[];
  mode?: string;
  timeout_s?: number;
  fallback_used?: boolean;
};

export default function CitationPanel({ tempo }: { tempo?: TempoInfo | null }) {
  if (!tempo) return null;
  const bbox = tempo.bbox_used ? `${tempo.bbox_used.minLon},${tempo.bbox_used.minLat},${tempo.bbox_used.maxLon},${tempo.bbox_used.maxLat}` : "—";
  const granules = tempo.granules && tempo.granules.length ? tempo.granules.join(", ") : "—";
  return (
    <div style={{ marginTop: 12 }}>
      <h3>Citation</h3>
      <div style={{ background: "#0b0f19", borderRadius: 8, border: "1px solid #1f2937", padding: 12, fontSize: 14, lineHeight: 1.5 }}>
        <div><b>Collection:</b> {tempo.collection_id ?? "—"}</div>
        <div><b>Temporal:</b> {tempo.temporal_used?.start ?? "—"} → {tempo.temporal_used?.end ?? "—"}</div>
        <div><b>BBox:</b> {bbox}</div>
        <div><b>Granules:</b> {granules}</div>
        <div><b>Mode/Timeout:</b> {tempo.mode ?? "—"} / {tempo.timeout_s ?? "—"}s</div>
        <div><b>Fallback:</b> {tempo.fallback_used ? "yes" : "no"}</div>
      </div>
    </div>
  );
}
