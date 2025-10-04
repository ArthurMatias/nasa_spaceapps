export interface ForecastPoint { datetime_utc: string; no2_forecast: number }
export interface WeatherPoint {
  datetime_utc: string; temp?: number; humidity?: number; wind_speed?: number;
  wind_deg?: number; clouds?: number; pressure?: number; rain_1h_est?: number; snow_1h_est?: number;
}
export interface TempoMeta {
  collection_id: string;
  temporal_used: { start: string; end: string };
  bbox_used: { minLon: number; minLat: number; maxLon: number; maxLat: number };
  granules: string[];
  mode?: string;
  timeout_s?: number;
  fallback_used?: boolean;
}
export interface GroundSample {
  aqi?: number; no2?: number; o3?: number; pm25?: number; pm10?: number;
  time_local?: string; station?: string; station_geo?: [number, number];
  attribution?: string;
}
export interface ForecastPayload {
  lat: number; lon: number; no2_seed: number;
  risk: "low" | "moderate" | "high";
  ratio_peak_over_seed: number;
  forecast: ForecastPoint[]; weather: WeatherPoint[];
  tempo: TempoMeta; ground?: GroundSample;
}

const BASE = (import.meta.env.VITE_API_BASE as string) || "http://127.0.0.1:8000";

function timeoutController(ms: number) {
  const ctrl = new AbortController();
  const id = setTimeout(() => { try { (ctrl as any).abort?.("timeout"); } catch { ctrl.abort(); } }, ms);
  return { signal: ctrl.signal, clear: () => clearTimeout(id) };
}

type Mode = "fast" | "auto" | "cache";

export async function getForecast(
  lat: number,
  lon: number,
  opts?: {
    start?: string; end?: string; bbox?: string;
    mode?: Mode; timeoutMs?: number;
    skipNasa?: boolean; requireNasa?: boolean;
  }
): Promise<ForecastPayload> {
  const q = new URLSearchParams({ lat: String(lat), lon: String(lon), mode: opts?.mode ?? "fast" });
  if (opts?.start) q.append("start", opts.start);
  if (opts?.end) q.append("end", opts.end);
  if (opts?.bbox) q.append("bbox", opts.bbox);
  if (opts?.skipNasa) q.append("skip_nasa", "true");
  if (opts?.requireNasa) q.append("require_nasa", "true");

  const { signal, clear } = timeoutController(opts?.timeoutMs ?? 30000);
  try {
    const res = await fetch(`${BASE}/forecast?${q.toString()}`, {
      signal, cache: "no-store", headers: { accept: "application/json" },
    });
    const txt = await res.text();
    if (!res.ok) {
      let detail: string | undefined;
      try { detail = JSON.parse(txt).detail; } catch {}
      throw new Error(detail || txt || `API ${res.status}`);
    }
    return JSON.parse(txt) as ForecastPayload;
  } catch (e: any) {
    if (e?.name === "AbortError" || String(e?.message||"").toLowerCase().includes("timeout"))
      throw new Error("Tempo esgotado ao consultar a API (timeout).");
    throw new Error(e?.message || "Erro inesperado");
  } finally { clear(); }
}
