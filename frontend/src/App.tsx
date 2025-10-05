import { useEffect, useMemo, useState } from "react";
import { getForecast, type ForecastPayload } from "./lib/api";
import ForecastChart from "./components/ForecastChart";
import USAirMap from "./components/USAirMap";
import AlertBadge from "./components/AlertBadge";
import RiskLegend from "./components/RiskLegend";
import NotifyOptIn from "./components/NotifyOptIn";
import Header from "./components/header";
import "./App.css";
import StateSearch from "./components/State_Search";

function downloadCSV(filename: string, rows: any[]) {
  if (!rows?.length) return;
  const headers = Object.keys(rows[0]);
  const csv =
    headers.join(",") +
    "\n" +
    rows.map((r) => headers.map((h) => JSON.stringify((r as any)[h] ?? "")).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function mergeByTime(a: any[], b: any[]) {
  const map = new Map<string, any>();
  for (const r of a ?? []) map.set(r.datetime_utc, { ...r });
  for (const r of b ?? []) {
    const prev = map.get(r.datetime_utc) ?? { datetime_utc: r.datetime_utc };
    map.set(r.datetime_utc, { ...prev, ...r });
  }
  return Array.from(map.values()).sort(
    (x, y) => new Date(x.datetime_utc).getTime() - new Date(y.datetime_utc).getTime()
  );
}

type Risk = "low" | "moderate" | "high";

function apiIndexToRisk(v: number): Risk {
  if (v >= 70) return "high";
  if (v >= 40) return "moderate";
  return "low";
}
function worstRisk(a: Risk, b: Risk): Risk {
  const rank: Record<Risk, number> = { low: 0, moderate: 1, high: 2 };
  return rank[a] >= rank[b] ? a : b;
}

function computeApiIndex(p: any): number {
  if (!p) return 0;
  const no2 = Number(p.no2_forecast ?? 0);
  const o3 = Number(p.o3_forecast ?? 0);
  const pm25 = Number(p.pm25_forecast ?? 0);
  const ai = Number(p.ai ?? 0);
  const no2s = Math.max(0, Math.min(100, (no2 / 3.0e15) * 100));
  const o3s = Math.max(0, Math.min(100, (o3 / 120) * 100));
  const pm25s = Math.max(0, Math.min(100, (pm25 / 150) * 100));
  const ais = Math.max(0, Math.min(100, (ai / 5) * 100));
  const v = 0.35 * no2s + 0.25 * o3s + 0.25 * pm25s + 0.15 * ais;
  return Math.round(v);
}

function PollutionIndexCard({ value }: { value: number }) {
  const label = value >= 70 ? "High" : value >= 40 ? "Moderate" : "Good";
  const track = "#1f2937";
  const fill = value >= 70 ? "#ef4444" : value >= 40 ? "#f59e0b" : "#10b981";
  return (
    <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
      <div style={{ background: "#0b0f19", border: "1px solid #1f2937", borderRadius: 12, padding: "12px 16px", width: 120, textAlign: "center" }}>
        <div style={{ fontSize: 12, color: "#9ca3af" }}>Air Pollution Index</div>
        <div style={{ fontSize: 28, fontWeight: 800 }}>{value}</div>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ height: 10, background: track, borderRadius: 999, overflow: "hidden" }}>
          <div style={{ width: `${value}%`, height: "100%", background: fill }} />
        </div>
        <div style={{ display: "flex", gap: 16, marginTop: 6, color: "#9ca3af", fontSize: 12 }}>
          <span>Good</span>
          <span>Moderate</span>
          <span>High</span>
          <span style={{ marginLeft: "auto", color: fill }}>{label}</span>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [lat, setLat] = useState(39.7392);
  const [lon, setLon] = useState(-104.9903);
  const [stateName, setStateName] = useState<string>("Colorado");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ForecastPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const params = new URLSearchParams(window.location.search);
  const DEMO = params.get("demo") === "1";

  const bboxForPoint = useMemo(() => {
    const dlon = 1.5, dlat = 1.2;
    return `${lon - dlon},${lat - dlat},${lon + dlon},${lat + dlat}`;
  }, [lat, lon]);

  async function runFetch() {
    setLoading(true);
    setErr(null);
    try {
      const res = await getForecast(lat, lon, {
        mode: "fast",
        bbox: bboxForPoint,
        timeoutMs: DEMO ? 12000 : 30000,
        skip_nasa: DEMO ? true : false,
        require_nasa: DEMO ? false : true,
      });
      setData(res);
    } catch (e: any) {
      setData(null);
      const msg =
        e?.status === 424
          ? "TEMPO data not available for this time/window. Try a different hour or enlarge the bbox."
          : e?.message ?? "Unexpected error";
      setErr(msg);
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    runFetch();
  }, [lat, lon, DEMO]);

  const nextPoint = useMemo(() => {
    const now = Date.now();
    const arr = data?.forecast ?? [];
    const sorted = [...arr].sort(
      (a: any, b: any) => new Date(a.datetime_utc).getTime() - new Date(b.datetime_utc).getTime()
    );
    return sorted.find((r: any) => new Date(r.datetime_utc).getTime() >= now) || sorted[0];
  }, [data]);

  const apiIndexValue = computeApiIndex(nextPoint);
  const modelRisk = (data?.risk as Risk) || "low";
  const apiRisk = apiIndexToRisk(apiIndexValue);
  const displayRisk = worstRisk(modelRisk, apiRisk);
  const riskColor = displayRisk === "high" ? "#ef4444" : displayRisk === "moderate" ? "#f59e0b" : "#10b981";

  return (
    <main style={{ margin: "0 auto", color: "#e5e7eb" }}>
      <Header />
      <h1 style={{ fontSize: 40, margin: "10px 0" }}>
        BREATH • <span style={{ color: "#60a5fa" }}>A NASA PROJECT</span>
      </h1>

      <div style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
        <div style={{ width: "35%" }}>
          <StateSearch />
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 16, margin: "0px 0 0 0", padding: 16 }}>
        <div style={{ background: "#0b0f19", border: "1px solid #1f2937", borderRadius: 8, padding: "6px 10px" }}>
          {DEMO ? "Using NASA TEMPO data" : <>Using <b>NASA TEMPO</b> data</>}
        </div>
        <RiskLegend size="md" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16, padding: 16 }}>
        <div style={{ background: "#0b0f19", borderRadius: 10, border: "1px solid #1f2937" }}>
          <USAirMap
            useNASA={!DEMO}
            onSelect={(s) => {
              setLat(s.lat);
              setLon(s.lon);
              setStateName(s.name);
            }}
          />
        </div>

        <div className="mr-4" style={{ background: "#000000ff", borderRadius: 10, border: "1px solid #1f2937", padding: 16 }}>
          <h2 style={{ marginTop: 0 }}>Details</h2>
          <div style={{ opacity: 0.9, marginBottom: 8 }}>{stateName}</div>
          <div style={{ fontSize: 13, color: "#9ca3af", marginBottom: 8 }}>
            lon/lat: {lon.toFixed(4)}, {lat.toFixed(4)}
          </div>

          <button
            onClick={runFetch}
            disabled={loading}
            style={{
              background: "#111827",
              border: "1px solid #374151",
              padding: "8px 14px",
              borderRadius: 8,
              color: "#e5e7eb",
              cursor: "pointer",
            }}
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>

          {data?.tempo?.fallback_used && (
            <div style={{ marginTop: 12, padding: 12, background: "#111827", border: "1px solid #374151", borderRadius: 8, color: "#e5e7eb" }}>
              Using fallback. No TEMPO granule found for this window/bbox.
            </div>
          )}

          {err && (
            <div style={{ marginTop: 12, padding: 10, background: "#7f1d1d", borderRadius: 8, border: "1px solid #991b1b" }}>
              <b>Error:</b> {err}
            </div>
          )}

          {data && (
            <>
              <div style={{ marginTop: 16 }}>
                <PollutionIndexCard value={apiIndexValue} />
              </div>

              <div style={{ marginTop: 12 }}>
                <b>Risk:</b>{" "}
                <span style={{ background: riskColor, color: "#fff", padding: "4px 10px", borderRadius: 8 }}>
                  {displayRisk.toUpperCase()}
                </span>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                <span style={{ background: "#0b0f19", border: "1px solid #1f2937", borderRadius: 8, padding: "6px 10px" }}>
                  NO₂: {Number(data.no2_seed).toExponential(2)} molecules/cm^2
                </span>
                {typeof nextPoint?.o3_forecast === "number" && (
                  <span style={{ background: "#0b0f19", border: "1px solid #1f2937", borderRadius: 8, padding: "6px 10px" }}>
                    O₃: {Number(nextPoint.o3_forecast).toFixed(1)} ppbv (proxy)
                  </span>
                )}
                {typeof nextPoint?.hcho_forecast === "number" && (
                  <span style={{ background: "#0b0f19", border: "1px solid #1f2937", borderRadius: 8, padding: "6px 10px" }}>
                    HCHO: {Number(nextPoint.hcho_forecast).toFixed(1)} ppbv (proxy)
                  </span>
                )}
                {typeof nextPoint?.ai === "number" && (
                  <span style={{ background: "#0b0f19", border: "1px solid #1f2937", borderRadius: 8, padding: "6px 10px" }}>
                    AI: {Number(nextPoint.ai).toFixed(2)} index
                  </span>
                )}
                {typeof nextPoint?.pm25_forecast === "number" && (
                  <span style={{ background: "#0b0f19", border: "1px solid #1f2937", borderRadius: 8, padding: "6px 10px" }}>
                    PM2.5: {Number(nextPoint.pm25_forecast).toFixed(1)} µg/m³ (proxy)
                  </span>
                )}
              </div>

              {data.alerts && (
                <div style={{ marginTop: 16 }}>
                  <h3>Alerts</h3>
                  <AlertBadge risk={displayRisk as any} nextCritical={data.alerts.next_critical_hour as any} />
                  <div style={{ marginTop: 8 }}>
                    <NotifyOptIn nextCritical={data.alerts.next_critical_hour as any} />
                  </div>
                </div>
              )}

              <div style={{ marginTop: 16 }}>
                <h3>TEMPO Details</h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div>
                    <div>Window: {data.tempo?.temporal_used?.start || "—"} → {data.tempo?.temporal_used?.end || "—"}</div>
                    <div style={{ marginTop: 8, fontSize: 12, color: "#9ca3af" }}>
                      Units
                    </div>
                    <div>Seed: molecules/cm^2</div>
                    <div>O₃: ppbv (proxy)</div>
                    <div>AI: index</div>
                  </div>
                  <div>
                    <div>NO₂: molecules/cm^2</div>
                    <div>HCHO: ppbv (proxy)</div>
                    <div>PM2.5: µg/m³ (proxy)</div>
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 16 }}>
                <h3>Recommendations</h3>
                <ul style={{ lineHeight: 1.6, marginTop: 6 }}>
                  {displayRisk === "high" && (
                    <>
                      <li>Avoid strenuous outdoor exercise; prioritize indoor environments.</li>
                      <li>Sensitive groups: consider PFF2/N95 when outdoors.</li>
                      <li>Keep windows closed; prefer filtered ventilation.</li>
                    </>
                  )}
                  {displayRisk === "moderate" && (
                    <>
                      <li>Reduce outdoor exercise if you have respiratory symptoms.</li>
                      <li>Prefer lower-traffic hours and routes.</li>
                    </>
                  )}
                  {displayRisk === "low" && <li>Favorable conditions for outdoor activities.</li>}
                </ul>
              </div>

              <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={() => downloadCSV("forecast_no2.csv", data.forecast)}>Download CSV (Forecast)</button>
                <button onClick={() => downloadCSV("weather_hourly.csv", data.weather)}>Download CSV (Hourly weather)</button>
              </div>

              <h3 style={{ marginTop: 16 }}>Next hours</h3>
              <ForecastChart
                data={mergeByTime(data.forecast, data.o3_forecast)}
                series={[
                  { key: "no2_forecast", name: "NO₂" },
                  { key: "o3_forecast", name: "O₃" },
                  { key: "hcho_forecast", name: "HCHO" },
                  { key: "ai", name: "Aerosol Index" },
                  { key: "pm25_forecast", name: "PM2.5" },
                ]}
              />

              <details style={{ marginTop: 12 }}>
                <summary>Provenance (TEMPO - JSON)</summary>
                <pre style={{ whiteSpace: "pre-wrap", background: "#111827", padding: 8, borderRadius: 8, border: "1px solid #1f2937" }}>
                  {JSON.stringify(data.tempo, null, 2)}
                </pre>
              </details>

              <details style={{ marginTop: 12 }}>
                <summary>Validation (ground vs forecast)</summary>
                <div style={{ marginTop: 8, fontSize: 14 }}>
                  <div>
                    <b>Ground AQI:</b> {data.ground?.aqi ?? "—"} {data.ground?.time_local ? `(${data.ground.time_local})` : ""}
                  </div>
                  {data.ground?.station && (
                    <div>
                      <b>Station:</b> {data.ground.station}
                    </div>
                  )}
                  <div>
                    <b>Risk (ground):</b> {(data.validation?.ground_bucket ?? "unknown").toUpperCase()}
                  </div>
                  <div>
                    <b>Risk (model):</b> {(data.validation?.model_bucket ?? "unknown").toUpperCase()}
                  </div>
                  <div>
                    <b>Agreement:</b> {(data.validation?.concordance ?? "unknown").toUpperCase()}
                  </div>
                </div>
              </details>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
