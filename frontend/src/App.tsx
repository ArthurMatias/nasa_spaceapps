import { useEffect, useMemo, useState } from "react";
import { getForecast, type ForecastPayload } from "./lib/api";
import ForecastChart from "./components/ForecastChart";
import USAirMap from "./components/USAirMap";
import AlertBadge from "./components/AlertBadge";
import RiskLegend from "./components/RiskLegend";
import NotifyOptIn from "./components/NotifyOptIn";
import Header from "./components/header";
import "./App.css";

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

export default function App() {
  const [lat, setLat] = useState(39.7392);
  const [lon, setLon] = useState(-104.9903);
  const [stateName, setStateName] = useState<string>("Colorado");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ForecastPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);

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
        timeoutMs: 18000,
        skip_nasa: false,
        require_nasa: true,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lon]);

  const riskColor = data?.risk === "high" ? "#ef4444" : data?.risk === "moderate" ? "#f59e0b" : "#10b981";

  return (
    <main style={{ margin: "0 auto", color: "#e5e7eb" }}>
      <Header />
      <h1 className="header_txt" style={{ fontSize: 55, margin: "16px 0" }}>
        BREATH • <span style={{ color: "#60a5fa" }}>A NASA PROJECT</span>
      </h1>
      <p className="header_txt" style={{ marginTop: -6 }}>
        Click a state to inspect the local forecast seeded with NASA TEMPO. TEMPO usage is enforced.
      </p>

      <div style={{ display: "flex", alignItems: "center", gap: 16, margin: "30px 0 0 0", padding: 16 }}>
        <div style={{ background: "#0b0f19", border: "1px solid #1f2937", borderRadius: 8, padding: "6px 10px" }}>
          Using <b>NASA TEMPO</b> data
        </div>
        <RiskLegend size="md" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16, padding: 16 }}>
        <div style={{ background: "#0b0f19", borderRadius: 10, border: "1px solid #1f2937" }}>
          <USAirMap
            useNASA={true}
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

          {err && (
            <div style={{ marginTop: 12, padding: 10, background: "#7f1d1d", borderRadius: 8, border: "1px solid #991b1b" }}>
              <b>Error:</b> {err}
            </div>
          )}

          {data && (
            <>
              <div style={{ marginTop: 12 }}>
                <b>Risk:</b>{" "}
                <span style={{ background: riskColor, color: "#fff", padding: "4px 10px", borderRadius: 8 }}>
                  {data.risk.toUpperCase()}
                </span>
              </div>

              <div style={{ marginTop: 8, fontSize: 14 }}>
                <b>NO₂ seed:</b> {Number(data.no2_seed).toExponential(2)}
              </div>

              {data.alerts && (
                <div style={{ marginTop: 12 }}>
                  <h3>Alerts</h3>
                  <AlertBadge risk={data.risk as any} nextCritical={data.alerts.next_critical_hour as any} />
                  <div style={{ marginTop: 8 }}>
                    <NotifyOptIn nextCritical={data.alerts.next_critical_hour as any} />
                  </div>
                </div>
              )}

              <div style={{ marginTop: 12 }}>
                <h3>Recommendations</h3>
                <ul style={{ lineHeight: 1.6, marginTop: 6 }}>
                  {data.risk === "high" && (
                    <>
                      <li>Avoid strenuous outdoor exercise; prioritize indoor environments.</li>
                      <li>Sensitive groups: consider PFF2/N95 when outdoors.</li>
                      <li>Keep windows closed; prefer filtered ventilation.</li>
                    </>
                  )}
                  {data.risk === "moderate" && (
                    <>
                      <li>Reduce outdoor exercise if you have respiratory symptoms.</li>
                      <li>Prefer lower-traffic hours and routes.</li>
                    </>
                  )}
                  {data.risk === "low" && <li>Favorable conditions for outdoor activities.</li>}
                </ul>
              </div>

              <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={() => downloadCSV("forecast_no2.csv", data.forecast)}>Download CSV (NO₂)</button>
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
