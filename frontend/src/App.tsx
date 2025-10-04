import { useState } from "react";
import { getForecast, type ForecastPayload } from "./lib/api";
import ForecastChart from "./components/ForecastChart";

export default function App() {
  const [lat, setLat] = useState(39.7392);
  const [lon, setLon] = useState(-104.9903);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ForecastPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    setLoading(true); setErr(null);
    try {
      const res = await getForecast(lat, lon);
      setData(res);
    } catch (e: any) {
      setErr(e.message || "Erro");
    } finally {
      setLoading(false);
    }
  };

  const aqiBadge = (seed: number) => {
    // regra simples de demo: acima de 120% do seed = alerta
    if (!data) return null;
    const max = Math.max(...data.forecast.map(f => f.no2_forecast));
    const ratio = max / seed;
    const color = ratio >= 1.2 ? "#ef4444" : ratio >= 1.0 ? "#f59e0b" : "#10b981";
    const label = ratio >= 1.2 ? "ALTO" : ratio >= 1.0 ? "MODERADO" : "BAIXO";
    return <span style={{ background: color, color: "#fff", padding: "6px 10px", borderRadius: 8 }}>{label}</span>;
  };

  return (
    <main style={{ maxWidth: 960, margin: "40px auto", padding: 16 }}>
      <h1 style={{ marginBottom: 12 }}>TEMPO Air — NO₂ Forecast (24h)</h1>
      <p style={{ marginTop: 0, color: "#666" }}>
        Insira coordenadas (lat/lon) na América do Norte → buscamos <b>TEMPO(NO₂)</b> + <b>clima</b> e geramos a previsão.
      </p>

      <div style={{ display: "flex", gap: 8, margin: "12px 0" }}>
        <input type="number" step="0.0001" value={lat} onChange={e => setLat(parseFloat(e.target.value))} placeholder="lat" />
        <input type="number" step="0.0001" value={lon} onChange={e => setLon(parseFloat(e.target.value))} placeholder="lon" />
        <button onClick={run} disabled={loading}>{loading ? "Carregando..." : "Gerar previsão"}</button>
      </div>

      {err && <div style={{ color: "crimson" }}>Erro: {err}</div>}

      {data && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div><b>NO₂ seed:</b> {data.no2_seed.toExponential(2)}</div>
            <div>{aqiBadge(data.no2_seed)}</div>
          </div>
          <h3 style={{ marginTop: 16 }}>Próximas horas</h3>
          <ForecastChart data={data.forecast} />
          <details style={{ marginTop: 12 }}>
            <summary>Ver amostra de clima (debug)</summary>
            <pre style={{ fontSize: 12, background: "#f7f7f7", padding: 8, overflow: "auto", maxHeight: 200 }}>
              {JSON.stringify(data.weather.slice(0, 6), null, 2)}
            </pre>
          </details>
        </>
      )}
    </main>
  );
}
