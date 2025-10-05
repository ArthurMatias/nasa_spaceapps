import { useEffect, useMemo, useState } from "react";
import { geoAlbersUsa, geoPath } from "d3-geo";
import * as topojson from "topojson-client";
import type { Topology, GeometryObject } from "topojson-specification";
import { getForecast, type ForecastPayload } from "../lib/api";

type StateFeature = {
  id: string;
  name: string;
  path: string;
  centroidLonLat: [number, number];
};

type StateData = {
  id: string;
  name: string;
  centroidLonLat: [number, number];
  risk?: "low" | "moderate" | "high";
};

function riskColor(r?: string) {
  if (r === "high") return "#ef4444";
  if (r === "moderate") return "#f59e0b";
  if (r === "low") return "#10b981";
  return "#e5e7eb";
}

function LegendSquare({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 14, height: 14, background: color, borderRadius: 3, display: "inline-block", border: "1px solid #1112" }} />
      <span style={{ fontSize: 12 }}>{label}</span>
    </div>
  );
}

const US_TOPO_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";

export default function USAirMap() {
  const [features, setFeatures] = useState<StateFeature[]>([]);
  const [states, setStates] = useState<Record<string, StateData>>({});
  const [hover, setHover] = useState<StateData | null>(null);
  const [selected, setSelected] = useState<StateData | null>(null);
  const [payload, setPayload] = useState<ForecastPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [useNasa, setUseNasa] = useState(false);
  const [requireNasa, setRequireNasa] = useState(false);
  const [showTempo, setShowTempo] = useState(false);
  const [tempoOpacity, setTempoOpacity] = useState(0.6);

  const API_BASE = import.meta.env.VITE_API_BASE as string;
  const usaBbox = "-125,24,-66,50";

  const viewBox = "0 0 975 610";
  const proj = useMemo(() => geoAlbersUsa().scale(1280).translate([487.5, 305]), []);
  const path = useMemo(() => geoPath(proj), [proj]);

  useEffect(() => {
    let abort = false;
    (async () => {
      const res = await fetch(US_TOPO_URL, { cache: "force-cache" });
      const topo = (await res.json()) as Topology;
      const objects = topo.objects as Record<string, GeometryObject>;
      const statesObj = objects.states;
      const fc: any = topojson.feature(topo, statesObj);
      const feats: StateFeature[] = fc.features.map((f: any) => {
        const id = String(f.id);
        const name: string = f.properties.name;
        const d = path(f) || "";
        const cxy = path.centroid(f);
        const lonlat = proj.invert(cxy) as [number, number] | null;
        const centroidLonLat = lonlat ?? [-98.5795, 39.8283];
        return { id, name, path: d, centroidLonLat };
      });
      const dict: Record<string, StateData> = {};
      for (const f of feats) dict[f.id] = { id: f.id, name: f.name, centroidLonLat: f.centroidLonLat };
      if (!abort) {
        setFeatures(feats);
        setStates(dict);
      }
    })();
    return () => {
      abort = true;
    };
  }, [path, proj]);

  async function fetchForState(st: StateData) {
    setSelected(st);
    setPayload(null);
    setErr(null);
    setLoading(true);
    try {
      const [lon, lat] = st.centroidLonLat;
      const res = await getForecast(lat, lon, {
        mode: "fast",
        timeoutMs: 30000,
        skipNasa: !useNasa,
        requireNasa,
      });
      setPayload(res);
      setStates((prev) => ({
        ...prev,
        [st.id]: { ...st, risk: res.risk as "low" | "moderate" | "high" },
      }));
    } catch (e: any) {
      setErr(e?.message || "Erro inesperado");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <label>
            <input type="checkbox" checked={useNasa} onChange={(e) => setUseNasa(e.target.checked)} /> Usar NASA (TEMPO)
          </label>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <LegendSquare color={riskColor("high")} label="Alto" />
            <LegendSquare color={riskColor("moderate")} label="Moderado" />
            <LegendSquare color={riskColor("low")} label="Baixo" />
          </div>
          <label style={{ marginLeft: 12 }}>
            <input type="checkbox" checked={requireNasa} onChange={(e) => setRequireNasa(e.target.checked)} /> Exigir TEMPO
          </label>
          <label style={{ marginLeft: 12 }}>
            <input type="checkbox" checked={showTempo} onChange={(e) => setShowTempo(e.target.checked)} /> Mostrar overlay TEMPO
          </label>
          {showTempo && (
            <label style={{ marginLeft: 8, fontSize: 12 }}>
              Opacidade:{" "}
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.05}
                value={tempoOpacity}
                onChange={(e) => setTempoOpacity(parseFloat(e.target.value))}
              />
            </label>
          )}
        </div>

        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden", position: "relative" }}>
          {showTempo && (
            <img
              src={`${API_BASE}/tempo/latest_overlay.png?bbox=${usaBbox}&prefer_l3=true&hours=8`}
              alt="TEMPO overlay"
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: tempoOpacity, pointerEvents: "none" }}
            />
          )}
          <svg viewBox={viewBox} width="100%" style={{ display: "block", position: "relative" }}>
            <g>
              {features.map((f) => {
                const st = states[f.id];
                const fill = riskColor(st?.risk);
                return (
                  <path
                    key={f.id}
                    d={f.path}
                    fill={fill}
                    stroke="#ffffff"
                    strokeWidth={0.75}
                    style={{ cursor: "pointer" }}
                    onMouseEnter={() => st && setHover(st)}
                    onMouseLeave={() => setHover((prev) => (prev?.id === st?.id ? null : prev))}
                    onClick={() => st && fetchForState(st)}
                  />
                );
              })}
            </g>
          </svg>
        </div>

        {hover && (
          <div style={{ marginTop: 8, fontSize: 14, opacity: 0.85 }}>
            {hover.name}
          </div>
        )}
      </div>

      <aside style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
        <h3 style={{ marginTop: 0 }}>Detalhes</h3>
        {!selected && <div>Clique em um estado para ver a qualidade do ar local.</div>}
        {selected && (
          <>
            <div style={{ marginBottom: 8 }}>
              <b>{selected.name}</b>
              <div style={{ fontSize: 12, opacity: 0.75 }}>
                lon/lat: {selected.centroidLonLat[0].toFixed(4)}, {selected.centroidLonLat[1].toFixed(4)}
              </div>
            </div>

            <div style={{ marginBottom: 8 }}>
              <button onClick={() => fetchForState(selected)} disabled={loading}>
                {loading ? "Carregando..." : "Atualizar"}
              </button>
            </div>

            {err && (
              <div style={{ background: "#fee2e2", color: "#7f1d1d", borderRadius: 6, padding: 8, marginBottom: 8 }}>
                <b>Erro:</b> {err}
              </div>
            )}

            {payload && (
              <div>
                <div style={{ marginBottom: 8 }}>
                  <b>Risco:</b>{" "}
                  <span
                    style={{
                      background: riskColor(payload.risk),
                      color: "#fff",
                      padding: "3px 8px",
                      borderRadius: 6,
                    }}
                  >
                    {payload.risk.toUpperCase()}
                  </span>
                </div>
                <div style={{ fontSize: 13, marginBottom: 8 }}>
                  <div>
                    <b>NO₂ seed:</b> {payload.no2_seed.toExponential(2)}
                  </div>
                  {payload.tempo?.fallback_used && <div style={{ color: "#b45309" }}>fallback usado</div>}
                </div>
                <details>
                  <summary>Proveniência (TEMPO)</summary>
                  <pre style={{ background: "#111827", color: "#e5e7eb", padding: 8, borderRadius: 6, overflow: "auto" }}>
{JSON.stringify(payload.tempo, null, 2)}
                  </pre>
                </details>
              </div>
            )}
          </>
        )}
      </aside>
    </div>
  );
}
