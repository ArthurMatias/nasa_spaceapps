from __future__ import annotations
import os, requests, datetime as dt

AQICN_TOKEN = os.getenv("AQICN_TOKEN", "")

class AQICNError(Exception): pass

def fetch_nearest(lat: float, lon: float) -> dict:
    if not AQICN_TOKEN:
        raise AQICNError("AQICN_TOKEN ausente no ambiente")
    url = f"https://api.waqi.info/feed/geo:{lat:.4f};{lon:.4f}/?token={AQICN_TOKEN}"
    r = requests.get(url, timeout=8)
    r.raise_for_status()
    js = r.json()
    if js.get("status") != "ok" or not js.get("data"):
        raise AQICNError(f"Resposta inválida: {js}")
    d = js["data"]
    iaqi = d.get("iaqi", {}) or {}
    def g(key):
        v = iaqi.get(key)
        return None if v is None else v.get("v")
    return {
        "aqi": d.get("aqi"),
        "no2": g("no2"),
        "o3": g("o3"),
        "pm25": g("pm25"),
        "pm10": g("pm10"),
        "time_local": d.get("time", {}).get("s"),
        "station": d.get("city", {}).get("name"),
        "station_geo": d.get("city", {}).get("geo"),
        "attribution": "Powered by AQICN.org",
        "fetched_utc": dt.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
