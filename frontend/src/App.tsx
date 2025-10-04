import { useState } from "react";
import { getForecast, type ForecastPayload } from "./lib/api";
import ForecastChart from "./components/ForecastChart";

export default function App() {
  const [lat, setLat] = useState(39.7392);
  const [lon, setLon] = useState(-104.9903);
  const [start, setStart] = useState<string | undefined>();
  const [end, setEnd] = useState<string | undefined>();
  const [bbox, setBbox] = useState<string | undefined>(); // "-106,38,-104,41"
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ForecastPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    setLoading(true); setErr(null);
    try {
      const res = await getForecast(lat, lon, { start, end, bbox });
      setData(res);
    } catch (e: any) {
      setErr(e.message || "Erro");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 960, margin: "40px auto", padding: 16 }}>
      <h1>TEMPO Air — NO₂ Forecast</h1>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, alignItems: "end" }}>
        <label>Lat <input type="number" step="0.0001" value={lat} onChange={e=>setLat(parseFloat(e.target.value))} /></label>
        <label>Lon <input type="number" step="0.0001" value={lon} onChange={e=>setLon(parseFloat(e.target.value))} /></label>
        <button onClick={run} disabled={loading} style={{ height: 36 }}>{loading ? "Carregando..." : "Buscar"}</button>
        <details>
          <summary>Avançado</summary>
          <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
            <label>start (UTC ISO) <input placeholder="2025-10-04T16:00:00Z" value={start ?? ""} onChange={e=>setStart(e.target.value || undefined)} /></label>
            <label>end (UTC ISO) <input placeholder="2025-10-04T22:00:00Z" value={end ?? ""} onChange={e=>setEnd(e.target.value || undefined)} /></label>
            <label>bbox (minLon,minLat,maxLon,maxLat)
              <input placeholder="-106,38,-104,41" value={bbox ?? ""} onChange={e=>setBbox(e.target.value || undefined)} />
            </label>
          </div>
        </details>
      </div>

      {err && <div style={{ color: "crimson", marginTop: 8 }}>Erro: {err}</div>}

      {data && (
        <>
          <div style={{ marginTop: 12 }}>
            <b>Risco:</b> <span style={{
              background: data.risk === "high" ? "#ef4444" : data.risk === "moderate" ? "#f59e0b" : "#10b981",
              color: "#fff", padding: "4px 10px", borderRadius: 8
            }}>{data.risk.toUpperCase()}</span>
            <span style={{ marginLeft: 12 }}><b>NO₂ seed:</b> {data.no2_seed.toExponential(2)}</span>
          </div>

          <h3 style={{ marginTop: 16 }}>Próximas horas</h3>
          <ForecastChart data={data.forecast} />

          <details style={{ marginTop: 12 }}>
            <summary>Proveniência (TEMPO)</summary>
            <pre style={{ background: "#f7f7f7", padding: 8 }}>
{JSON.stringify(data.tempo, null, 2)}
            </pre>
          </details>
        </>
      )}
    </main>
  );
}
