import { useEffect, useMemo, useState } from "react";
import { getForecast, type ForecastPayload } from "./lib/api";
import ForecastChart from "./components/ForecastChart";
import USAirMap from "./components/USAirMap";
import AlertBadge from "./components/AlertBadge";
import RiskLegend from "./components/RiskLegend";
import CitationPanel from "./components/CitationPanel";
import NotifyOptIn from "./components/NotifyOptIn";
import Header from "./components/header";
import "./App.css"

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

export default function App() {
  const [lat, setLat] = useState(39.7392);
  const [lon, setLon] = useState(-104.9903);
  const [stateName, setStateName] = useState<string>("Colorado");
  const [useNASA, setUseNASA] = useState<boolean>(false);
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
        timeoutMs: 15000,
        skip_nasa: useNASA ? false : true,
      });
      setData(res);
    } catch (e: any) {
      setData(null);
      setErr(e?.message ?? "Erro inesperado");
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { runFetch(); }, [lat, lon, useNASA]); // eslint-disable-line

  const riskColor = data?.risk === "high" ? "#ef4444" : data?.risk === "moderate" ? "#f59e0b" : "#10b981";

  return ( 
    <main style={{margin: "0 auto", color: "#e5e7eb" }}>
      <Header/>
      <h1 className="header_txt" style={{ fontSize: 55, margin: "16px 0" }}>
        BREATH • <span style={{ color: "#60a5fa" }}>UM PROJETO NASA</span>
      </h1>
      <p className="header_txt" style={{ marginTop: -6 }}>
        Clique em um estado para consultar a previsão local de NO₂. Ative “Usar NASA (TEMPO)”.
      </p>

      <div style={{ display: "flex", alignItems: "center", gap: 16, margin: "10px 0 16px" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input type="checkbox" checked={useNASA} onChange={(e) => setUseNASA(e.target.checked)} />
          <span>Usar NASA (TEMPO)</span>
        </label>
        <RiskLegend size="md" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16}}>
        <div style={{ background: "#0b0f19", borderRadius: 10, border: "1px solid #1f2937" }}>
          <USAirMap
            useNASA={useNASA}
            onSelect={(s) => {
              setLat(s.lat);
              setLon(s.lon);
              setStateName(s.name);
            }}
          />
        </div>

        <div className="mr-4" style={{ background: "#000000ff", borderRadius: 10, border: "1px solid #1f2937", padding: 16}}>
          <h2 style={{ marginTop: 0 }}>Detalhes</h2>
          <div style={{ opacity: 0.9, marginBottom: 8 }}>{stateName}</div>
          <div style={{ fontSize: 13, color: "#9ca3af", marginBottom: 8 }}>
            lon/lat: {lon.toFixed(4)}, {lat.toFixed(4)}
          </div>

          <button onClick={runFetch} disabled={loading} style={{ background: "#111827", border: "1px solid #374151", padding: "8px 14px", borderRadius: 8, color: "#e5e7eb", cursor: "pointer" }}>
            {loading ? "Atualizando..." : "Atualizar"}
          </button>

          {err && (
            <div style={{ marginTop: 12, padding: 10, background: "#7f1d1d", borderRadius: 8, border: "1px solid #991b1b" }}>
              <b>Erro:</b> {err}
            </div>
          )}

          {data && (
            <>
              <div style={{ marginTop: 12 }}>
                <b>Risco:</b>{" "}
                <span style={{ background: riskColor, color: "#fff", padding: "4px 10px", borderRadius: 8 }}>
                  {data.risk.toUpperCase()}
                </span>
              </div>

              <div style={{ marginTop: 8, fontSize: 14 }}>
                <b>NO₂ seed:</b> {Number(data.no2_seed).toExponential(2)}
                {data.tempo?.fallback_used && <div style={{ color: "#f59e0b", marginTop: 4 }}>fallback usado</div>}
              </div>

              {data.alerts && (
                <div style={{ marginTop: 12 }}>
                  <h3>Alertas</h3>
                  <AlertBadge risk={data.risk as any} nextCritical={data.alerts.next_critical_hour as any} />
                  <div style={{ marginTop: 8 }}>
                    <NotifyOptIn nextCritical={data.alerts.next_critical_hour as any} />
                  </div>
                </div>
              )}

              <div style={{ marginTop: 12 }}>
                <h3>Recomendações</h3>
                <ul style={{ lineHeight: 1.6, marginTop: 6 }}>
                  {data.risk === "high" && (
                    <>
                      <li>Evite atividades físicas intensas ao ar livre; priorize ambientes internos.</li>
                      <li>Grupos sensíveis: usar PFF2/N95 ao sair.</li>
                      <li>Mantenha janelas fechadas; prefira ventilação filtrada.</li>
                    </>
                  )}
                  {data.risk === "moderate" && (
                    <>
                      <li>Reduza exercícios ao ar livre se tiver sintomas respiratórios.</li>
                      <li>Prefira horários e rotas com menos tráfego.</li>
                    </>
                  )}
                  {data.risk === "low" && <li>Condição favorável para atividades ao ar livre.</li>}
                </ul>
              </div>

              <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={() => downloadCSV("forecast_no2.csv", data.forecast)}>Baixar CSV (NO₂)</button>
                <button onClick={() => downloadCSV("weather_hourly.csv", data.weather)}>Baixar CSV (Clima horário)</button>
              </div>

              <h3 style={{ marginTop: 16 }}>Próximas horas</h3>
              <ForecastChart data={data.forecast} />

              <CitationPanel tempo={data.tempo as any} />

              <details style={{ marginTop: 12 }}>
                <summary>Proveniência (TEMPO - JSON)</summary>
                <pre style={{ whiteSpace: "pre-wrap", background: "#111827", padding: 8, borderRadius: 8, border: "1px solid #1f2937" }}>
{JSON.stringify(data.tempo, null, 2)}
                </pre>
              </details>

              <details style={{ marginTop: 12 }}>
                <summary>Validação (solo vs previsão)</summary>
                <div style={{ marginTop: 8, fontSize: 14 }}>
                  <div><b>AQI solo:</b> {data.ground?.aqi ?? "—"} {data.ground?.time_local ? `(${data.ground.time_local})` : ""}</div>
                  {data.ground?.station && <div><b>Estação:</b> {data.ground.station}</div>}
                  <div><b>Risco (solo):</b> {(data.validation?.ground_bucket ?? "unknown").toUpperCase()}</div>
                  <div><b>Risco (modelo):</b> {(data.validation?.model_bucket ?? "unknown").toUpperCase()}</div>
                  <div><b>Concordância:</b> {(data.validation?.concordance ?? "unknown").toUpperCase()}</div>
                </div>
              </details>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
