import pandas as pd
from sklearn.linear_model import LinearRegression

def forecast_no2_24h(weather_hourly: pd.DataFrame, no2_seed: float) -> pd.DataFrame:
    """
    Baseline simples: regressão nas variáveis meteorológicas + persistência do estado atual.
    Usa 6h iniciais para "calibrar" o nível, depois gera 24–48h.
    """
    wx = weather_hourly.copy().sort_values("datetime_utc")
    feats = ["temp","humidity","wind_speed","clouds","pressure","rain_1h_est"]
    for f in feats:
        if f not in wx: wx[f] = 0.0

    # calibrar nas 6 primeiras horas (ou menos, se houver)
    calib = wx.head(6)
    if calib.empty:  # fallback puro persistência
        return pd.DataFrame({"datetime_utc": wx["datetime_utc"], "no2_forecast": no2_seed})

    X = calib[feats]
    y = [no2_seed] * len(calib)

    model = LinearRegression()
    model.fit(X, y)
    pred = model.predict(wx[feats])
    # suavização leve
    wx["no2_forecast"] = pd.Series(pred).rolling(3, min_periods=1).mean()
    return wx[["datetime_utc","no2_forecast"]]
