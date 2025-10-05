import React, { useEffect, useMemo, useRef, useState } from "react";
import { geoAlbersUsa, geoPath } from "d3-geo";
import * as topojson from "topojson-client";
import type { Topology, Objects } from "topojson-specification";
import { getBase } from "../lib/api";

type Props = { onSelect: (s: { name: string; lat: number; lon: number }) => void; useNASA?: boolean; };
type Risk = "low" | "moderate" | "high" | "unknown";
type USAtlas = Topology<{ states: Objects<{ type: "GeometryCollection"; geometries: any[] }>; nation?: any; counties?: any; }>;

const US_TOPO_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";
const riskFill = (r: Risk) => (r === "high" ? "#ef4444" : r === "moderate" ? "#f59e0b" : r === "low" ? "#10b981" : "#334155");

export default function USAirMap({ onSelect, useNASA = false }: Props) {
  const [topo, setTopo] = useState<USAtlas | null>(null);
  const [riskMap, setRiskMap] = useState<Record<string, Risk>>({});
  const [hover, setHover] = useState<{ name: string; x: number; y: number; risk: Risk } | null>(null);
  const [loadingMap, setLoadingMap] = useState(false);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const width = 900, height = 540;
  const projection = useMemo(() => geoAlbersUsa().translate([width / 2, height / 2]).scale(1150), [width, height]);
  const path = useMemo(() => geoPath(projection), [projection]);

  useEffect(() => {
    let canceled = false;
    (async () => {
      try {
        const r = await fetch(US_TOPO_URL);
        const js = (await r.json()) as USAtlas;
        if (!canceled) setTopo(js);
      } catch (e) { console.error(e); }
    })();
    return () => { canceled = true; };
  }, []);

  async function loadSummary(useNasaFlag: boolean) {
    setLoadingMap(true);
    try {
      const res = await fetch(`${getBase()}/states/summary?skip_nasa=${useNasaFlag ? "false" : "true"}`);
      const js = await res.json();
      const map: Record<string, Risk> = {};
      for (const it of js.items as any[]) map[it.state] = (it.risk || "unknown") as Risk;
      setRiskMap(map);
    } catch (e) { console.error(e); }
    finally { setLoadingMap(false); }
  }

  useEffect(() => { loadSummary(useNASA); }, [useNASA]);

  const features = useMemo(() => {
    if (!topo) return [];
    const fc: any = topojson.feature(topo, topo.objects.states as any);
    return (fc.features || []) as Array<any>;
  }, [topo]);

  function handleClick(f: any) {
    const name: string = f.properties?.name || "Unknown";
    const c = path.centroid(f);
    const inv = projection.invert?.(c as [number, number]);
    if (!inv) return;
    const [lon, lat] = inv;
    onSelect({ name, lat, lon });
  }

  function handleMouseMove(e: React.MouseEvent<SVGPathElement>, f: any) {
    const name: string = f.properties?.name || "Unknown";
    const risk = riskMap[name] || "unknown";
    const rect = (svgRef.current as SVGSVGElement).getBoundingClientRect();
    setHover({ name, x: e.clientX - rect.left + 10, y: e.clientY - rect.top + 10, risk });
  }

  function handleMouseLeave() { setHover(null); }

  return (
    <div style={{ position: "relative" }}>
      <div style={{ padding: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 14, color: "#9ca3af" }}>{loadingMap ? "Atualizando mapa..." : "Clique em um estado para ver detalhes"}</div>
        <div style={{ fontSize: 12, color: "#9ca3af" }}>Fonte de risco: /states/summary</div>
      </div>
      <svg ref={svgRef} width={width} height={height} style={{ display: "block", height: "auto" }}>
        <rect x={0} y={0} width={width} height={height} fill="#0b0f19" />
        {features.map((f, i) => {
          const name: string = f.properties?.name || `S${i}`;
          const risk = riskMap[name] || "unknown";
          return (
            <path
              key={name}
              d={path(f) || undefined}
              fill={riskFill(risk)}
              stroke="#0f172a"
              strokeWidth={0.8}
              onClick={() => handleClick(f)}
              onMouseMove={(e) => handleMouseMove(e, f)}
              onMouseLeave={handleMouseLeave}
              style={{ cursor: "pointer" }}
            />
          );
        })}
      </svg>
      {hover && (
        <div
          style={{
            position: "absolute",
            left: hover.x,
            top: hover.y,
            background: "#111827",
            color: "#e5e7eb",
            border: "1px solid #374151",
            padding: "6px 10px",
            fontSize: 13,
            borderRadius: 6,
            pointerEvents: "none",
            whiteSpace: "nowrap",
          }}
        >
          <div style={{ fontWeight: 700 }}>{hover.name}</div>
          <div>
            Risco:{" "}
            <span style={{ background: riskFill(hover.risk), color: "#fff", padding: "2px 6px", borderRadius: 6 }}>
              {hover.risk.toUpperCase()}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
