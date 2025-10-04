import datetime as dt
import requests
import pandas as pd
import os
from dotenv import load_dotenv
load_dotenv()

API_KEY = os.getenv("OWM_API_KEY")
BASE_NOW = "https://api.openweathermap.org/data/2.5/weather"
BASE_FC  = "https://api.openweathermap.org/data/2.5/forecast"

def fetch_current(lat: float, lon: float, units="metric") -> dict:
    r = requests.get(BASE_NOW, params={"lat":lat,"lon":lon,"appid":API_KEY,"units":units}, timeout=60)
    r.raise_for_status(); return r.json()

def fetch_forecast(lat: float, lon: float, units="metric") -> dict:
    r = requests.get(BASE_FC, params={"lat":lat,"lon":lon,"appid":API_KEY,"units":units}, timeout=60)
    r.raise_for_status(); return r.json()

def current_to_df(js: dict) -> pd.DataFrame:
    ts = dt.datetime.fromtimestamp(js["dt"], dt.UTC)
    main, wind, clouds = js.get("main",{}), js.get("wind",{}), js.get("clouds",{})
    return pd.DataFrame([{
        "datetime_utc": ts, "temp": main.get("temp"), "humidity": main.get("humidity"),
        "pressure": main.get("pressure"), "wind_speed": wind.get("speed"),
        "wind_deg": wind.get("deg"), "clouds": clouds.get("all"),
        "rain_1h": (js.get("rain") or {}).get("1h"), "snow_1h": (js.get("snow") or {}).get("1h"),
    }])

def forecast_to_df(js: dict) -> pd.DataFrame:
    rows=[]
    for it in js.get("list", []):
        ts = dt.datetime.fromtimestamp(it["dt"], dt.UTC)
        main, wind, clouds = it.get("main",{}), it.get("wind",{}), it.get("clouds",{})
        rain, snow = (it.get("rain") or {}), (it.get("snow") or {})
        rows.append({
            "datetime_utc": ts, "temp": main.get("temp"), "humidity": main.get("humidity"),
            "pressure": main.get("pressure"), "wind_speed": wind.get("speed"),
            "wind_deg": wind.get("deg"), "clouds": clouds.get("all"),
            "rain_3h": rain.get("3h"), "snow_3h": snow.get("3h"),
        })
    return pd.DataFrame(rows).sort_values("datetime_utc")

def to_hourly(df3h: pd.DataFrame) -> pd.DataFrame:
    if df3h.empty: return df3h
    df = df3h.infer_objects(copy=False).set_index("datetime_utc").sort_index()
    num_cols = df.select_dtypes(include="number").columns
    out = (df[num_cols].resample("h").interpolate("time").ffill().reset_index())
    if "rain_3h" in out: out["rain_1h_est"] = (out["rain_3h"].fillna(0).astype(float))/3.0
    if "snow_3h" in out: out["snow_1h_est"] = (out["snow_3h"].fillna(0).astype(float))/3.0
    return out
