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
export interface ForecastPayload {
  lat: number; lon: number; no2_seed: number;
  risk: "low" | "moderate" | "high";
  ratio_peak_over_seed: number;
  forecast: ForecastPoint[]; weather: WeatherPoint[];
  tempo: TempoMeta;
}

const BASE = (import.meta.env.VITE_API_BASE as string) || "http://127.0.0.1:8000";

function timeoutController(ms: number) {
  const ctrl = new AbortController();
  const id = setTimeout(() => {
    // defina uma razão explícita do abort (nem todos browsers expõem, mas ajuda)
    try {
      // navegadores modernos aceitam abort(reason)
      (ctrl as any).abort?.("timeout");
    } catch {
      ctrl.abort();
    }
  }, ms);
  const clear = () => clearTimeout(id);
  return { signal: ctrl.signal, clear };
}

export async function getForecast(
  lat: number, lon: number,
  opts?: { start?: string; end?: string; bbox?: string; mode?: "fast"|"auto"|"cache"; timeoutMs?: number }
): Promise<ForecastPayload> {
  const q = new URLSearchParams({ lat: String(lat), lon: String(lon), mode: opts?.mode ?? "fast" });
  if (opts?.start) q.append("start", opts.start);
  if (opts?.end) q.append("end", opts.end);
  if (opts?.bbox) q.append("bbox", opts.bbox);

  const { signal, clear } = timeoutController(opts?.timeoutMs ?? 20000); // 20s
  try {
    const res = await fetch(`${BASE}/forecast?${q.toString()}`, {
      signal,
      cache: "no-store",
      headers: { "accept": "application/json" },
    });

    const txt = await res.text();
    if (!res.ok) {
      try {
        const j = JSON.parse(txt);
        throw new Error(j.detail ?? `API ${res.status}`);
      } catch {
        throw new Error(txt || `API ${res.status}`);
      }
    }
    return JSON.parse(txt) as ForecastPayload;
  } catch (e: any) {
    // normalizar mensagens de abort
    if (e?.name === "AbortError" || String(e?.message || "").toLowerCase().includes("aborted")) {
      throw new Error("Tempo esgotado ao consultar a API (timeout). Tente novamente ou use o modo Avançado.");
    }
    throw e;
  } finally {
    clear();
  }
}
