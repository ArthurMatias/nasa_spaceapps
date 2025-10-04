export interface ForecastPoint { datetime_utc: string; no2_forecast: number }
export interface WeatherPoint {
  datetime_utc: string; temp?: number; humidity?: number; wind_speed?: number;
  wind_deg?: number; clouds?: number; pressure?: number; rain_1h_est?: number; snow_1h_est?: number;
}
export interface ForecastPayload {
  lat: number; lon: number; no2_seed: number;
  forecast: ForecastPoint[]; weather: WeatherPoint[];
}

const BASE = import.meta.env.VITE_API_BASE;

export async function getForecast(lat: number, lon: number): Promise<ForecastPayload> {
  const url = `${BASE}/forecast?lat=${lat}&lon=${lon}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}
