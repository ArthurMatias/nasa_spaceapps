import { useState } from "react";
import { getForecast, type ForecastPayload } from "./lib/api";
import ForecastChart from "./components/ForecastChart";

export default function App() {
  const [lat, setLat] = useState(39.7392);
  const [lon, setLon] = useState(-104.9903);
  const [start, setStart] = useState<string>();
  const [end, setEnd] = useState<string>();
  const [bbox, setBbox] = useState<string>(); 
  const [useNasa, setUseNasa] = useState(false);
  const [requireNasa, setRequireNasa] = useState(false);

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ForecastPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setErr(null);
    setData(null);
    try {
      const res = await getForecast(lat, lon, {
        start, end, bbox,
        mode: "fast",
        timeoutMs: 30000,
        skipNasa: !useNasa,
        requireNasa: useNasa && requireNasa,
      });
      setData(res);
    } catch (e: any) {
      setErr(e?.message ?? "Erro inesperado");
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  const riskColor =
    data?.risk === "high" ? "#ef4444" : data?.risk === "moderate" ? "#f59e0b" : "#10b981";

  return (
    <main style={{ maxWidth: 1000, margin: "40px auto", padding: 16, color: "#111827", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ marginBottom: 8 }}>TEMPO Air — NO₂ Forecast</h1>
      <p style={{ marginTop: 0, opacity: 0.8, fontSize: 14 }}>
        Previsão local de NO₂ combinando <b>NASA TEMPO</b> (seed), <b>OpenWeather</b> (dinâmica) e validação em solo (AQICN).
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, alignItems: "end", marginTop: 12 }}>
        <label>Lat
          <input type="number" step="0.0001" value={lat} onChange={e => setLat(parseFloat(e.target.value))}
            style={{ width: "100%", height: 36 }} />
        </label>
        <label>Lon
          <input type="number" step="0.0001" value={lon} onChange={e => setLon(parseFloat(e.target.value))}
            style={{ width: "100%", height: 36 }} />
        </label>
        <button onClick={run} disabled={loading} style={{ height: 36 }}>
          {loading ? "Carregando..." : "Buscar"}
        </button>
      </div>

      <div style={{ display: "flex", gap: 16, alignItems: "center", marginTop: 8 }}>
        <label>
          <input type="checkbox" checked={useNasa} onChange={e => setUseNasa(e.target.checked)} /> Usar NASA (TEMPO)
        </label>
        <label style={{ opacity: useNasa ? 1 : 0.4 }}>
          <input type="checkbox" disabled={!useNasa} checked={requireNasa} onChange={e => setRequireNasa(e.target.checked)} /> Exigir NASA (sem fallback)
        </label>
      </div>

      <details style={{ marginTop: 10 }}>
        <summary>Avançado</summary>
        <div style={{ display: "grid", gap: 8, marginTop: 8, gridTemplateColumns: "repeat(3, 1fr)" }}>
          <label>start (UTC)
            <input placeholder="2025-10-04T16:00:00Z" value={start ?? ""} onChange={e => setStart(e.target.value || undefined)}
              style={{ width: "100%", height: 32 }} />
          </label>
          <label>end (UTC)
            <input placeholder="2025-10-04T22:00:00Z" value={end ?? ""} onChange={e => setEnd(e.target.value || undefined)}
              style={{ width: "100%", height: 32 }} />
          </label>
          <label>bbox
            <input placeholder="-106,38,-104,41" value={bbox ?? ""} onChange={e => setBbox(e.target.value || undefined)}
              style={{ width: "100%", height: 32 }} />
          </label>
        </div>
        <p style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>
          Dica: para garantir TEMPO, use janela e bbox próximos (ex.: Denver {`<-106,38,-104,41`}, 16–22Z).
        </p>
      </details>

      {err && (
        <div style={{ marginTop: 12, padding: 12, background: "#fee2e2", color: "#7f1d1d", borderRadius: 8 }}>
          <b>Erro:</b> {err}
        </div>
      )}

      {data && (
        <>
          <div style={{ marginTop: 16 }}>
            <b>Risco:</b>{" "}
            <span style={{ background: riskColor, color: "#fff", padding: "4px 10px", borderRadius: 8 }}>
              {data.risk.toUpperCase()}
            </span>
            <span style={{ marginLeft: 12 }}><b>NO₂ seed:</b> {data.no2_seed.toExponential(2)}</span>
            {data.tempo?.fallback_used && (
              <span style={{ marginLeft: 12, color: "#b45309" }}>fallback usado</span>
            )}
          </div>

          <h3 style={{ marginTop: 16 }}>Próximas horas</h3>
          {data.forecast?.length ? (
            <ForecastChart data={data.forecast} />
          ) : (
            <div style={{ padding: 10, background: "#f3f4f6", borderRadius: 8 }}>
              Sem pontos de previsão para exibir.
            </div>
          )}

          {data.ground && (
            <div style={{ marginTop: 12, padding: 10, borderRadius: 8, background: "#ecfdf5", color: "#064e3b" }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Validação (Solo)</div>
              <div><b>Estação:</b> {data.ground.station ?? "—"} | <b>AQI:</b> {data.ground.aqi ?? "—"}</div>
              <div><b>NO₂:</b> {data.ground.no2 ?? "—"} | <b>PM2.5:</b> {data.ground.pm25 ?? "—"}</div>
              <div style={{ fontSize: 12, opacity: 0.8 }}>{data.ground.attribution}</div>
            </div>
          )}

          <details style={{ marginTop: 12 }}>
            <summary>Proveniência (TEMPO)</summary>
            <pre style={{ background: "#111827", color: "#e5e7eb", padding: 8, borderRadius: 8, overflow: "auto" }}>
{JSON.stringify(data.tempo, null, 2)}
            </pre>
          </details>
        </>
      )}
    </main>
  );
}
