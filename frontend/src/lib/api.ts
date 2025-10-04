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
}
export interface ForecastPayload {
  lat: number; lon: number; no2_seed: number;
  risk: "low" | "moderate" | "high";
  ratio_peak_over_seed: number;
  forecast: ForecastPoint[]; weather: WeatherPoint[];
  tempo: TempoMeta;
}

const BASE = import.meta.env.VITE_API_BASE as string;

export async function getForecast(
  lat: number, lon: number,
  opts?: { start?: string; end?: string; bbox?: string }
): Promise<ForecastPayload> {
  const q = new URLSearchParams({ lat: String(lat), lon: String(lon) });
  if (opts?.start) q.append("start", opts.start);
  if (opts?.end) q.append("end", opts.end);
  if (opts?.bbox) q.append("bbox", opts.bbox);
  const res = await fetch(`${BASE}/forecast?${q.toString()}`);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}
