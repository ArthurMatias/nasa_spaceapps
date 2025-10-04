import os
from weather_openweather import fetch_forecast, forecast_to_df, to_hourly

print("KEY?", bool(os.getenv("OPENWEATHER_API_KEY")), "TIMEOUT", os.getenv("OPENWEATHER_TIMEOUT_S"))

js = fetch_forecast(39.7392, -104.9903, units="metric")
df3 = forecast_to_df(js)
print("3h rows:", len(df3))
df1 = to_hourly(df3)
print("1h rows:", len(df1))
