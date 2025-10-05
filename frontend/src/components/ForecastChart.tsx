import React from "react";
import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  LinearScale,
  TimeScale,
  Tooltip,
  Legend,
  CategoryScale,
} from "chart.js";
import { Line } from "react-chartjs-2";

ChartJS.register(LineElement, PointElement, LinearScale, TimeScale, Tooltip, Legend, CategoryScale);

export default function ForecastChart({ data }: { data: Array<{ datetime_utc: string; no2_forecast: number }> }) {
  const labels = data.map((d) => d.datetime_utc.replace("T", " ").replace("Z", ""));
  const series = data.map((d) => d.no2_forecast);
  const dsColor = "rgba(96,165,250,0.9)";
  return (
    <div style={{ background: "#0b0f19", border: "1px solid #1f2937", borderRadius: 8, padding: 12 }}>
      <Line
        data={{
          labels,
          datasets: [
            {
              label: "NO₂ (u.a. relativa)",
              data: series,
              borderColor: dsColor,
              backgroundColor: "rgba(96,165,250,0.25)",
              tension: 0.25,
            },
          ],
        }}
        options={{
          responsive: true,
          plugins: { legend: { labels: { color: "#e5e7eb" } } },
          scales: {
            x: { ticks: { color: "#9ca3af", maxRotation: 0, autoSkip: true }, grid: { color: "#111827" } },
            y: { ticks: { color: "#9ca3af" }, grid: { color: "#111827" } },
          },
        }}
      />
    </div>
  );
}
