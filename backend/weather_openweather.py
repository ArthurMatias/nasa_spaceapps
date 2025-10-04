from __future__ import annotations
import os, datetime as dt, requests, pandas as pd

OWM_KEY = os.getenv("OPENWEATHER_API_KEY", "")
OWM_TIMEOUT_S = float(os.getenv("OPENWEATHER_TIMEOUT_S", "8"))

def _raise_if_no_key():
    if not OWM_KEY:
        raise RuntimeError("OPENWEATHER_API_KEY ausente no ambiente")

def fetch_forecast(lat: float, lon: float, units: str = "metric") -> dict:
    _raise_if_no_key()
    url = "https://api.openweathermap.org/data/2.5/forecast"
    params = {"lat": lat, "lon": lon, "appid": OWM_KEY, "units": units}
    r = requests.get(url, params=params, timeout=OWM_TIMEOUT_S)
    r.raise_for_status()
    return r.json()

def forecast_to_df(js: dict) -> pd.DataFrame:
    rows = []
    for it in js.get("list", []):
        ts = dt.datetime.utcfromtimestamp(it["dt"]).replace(tzinfo=dt.timezone.utc)
        main = it.get("main", {})
        wind = it.get("wind", {})
        rain = (it.get("rain", {}) or {}).get("3h")
        snow = (it.get("snow", {}) or {}).get("3h")
        clouds = (it.get("clouds", {}) or {}).get("all")
        rows.append({
            "datetime_utc": ts,
            "temp": main.get("temp"),
            "humidity": main.get("humidity"),
            "pressure": main.get("pressure"),
            "wind_speed": wind.get("speed"),
            "wind_deg": wind.get("deg"),
            "clouds": clouds,
            "rain_3h": rain,
            "snow_3h": snow,
        })
    df = pd.DataFrame(rows)
    if not df.empty:
        df = df.sort_values("datetime_utc").reset_index(drop=True)
    return df

def to_hourly(df3h: pd.DataFrame) -> pd.DataFrame:
    if df3h.empty:
        return df3h
    df = df3h.copy()
    df["datetime_utc"] = pd.to_datetime(df["datetime_utc"], utc=True)
    df = df.set_index("datetime_utc").asfreq("1h")
    df = df.interpolate("time").ffill()
    df["rain_1h_est"] = (df["rain_3h"].fillna(0) / 3.0).astype(float)
    df["snow_1h_est"] = (df["snow_3h"].fillna(0) / 3.0).astype(float)
    return df.reset_index()
