def aqi_pm25(pm25: float) -> int:
    # Tabela EPA simplificada (µg/m³)
    brks = [(0,12,0,50),(12.1,35.4,51,100),(35.5,55.4,101,150),
            (55.5,150.4,151,200),(150.5,250.4,201,300),(250.5,500.4,301,500)]
    for c_low, c_high, a_low, a_high in brks:
        if pm25 <= c_high:
            return round((a_high-a_low)/(c_high-c_low)*(pm25-c_low)+a_low)
    return 500

def band(aqi:int) -> str:
    return ("Good" if aqi<=50 else "Moderate" if aqi<=100 else
            "USG" if aqi<=150 else "Unhealthy" if aqi<=200 else
            "Very Unhealthy" if aqi<=300 else "Hazardous")
