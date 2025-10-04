import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Legend,
} from "chart.js";
import { Line } from "react-chartjs-2";
import type { ForecastPoint } from "../lib/api";

ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend);

export default function ForecastChart({ data }: { data: ForecastPoint[] }) {
  const labels = data.map(d =>
    new Date(d.datetime_utc).toLocaleString(undefined, {
      hour: "2-digit",
      day: "2-digit",
      month: "2-digit",
    })
  );
  const ds = {
    labels,
    datasets: [
      {
        label: "NO₂ (forecast)",
        data: data.map(d => d.no2_forecast),
        tension: 0.3,
        borderWidth: 2,
        pointRadius: 0,
      },
    ],
  };
  const options = {
    responsive: true,
    plugins: { legend: { display: true } },
    scales: { x: { ticks: { maxTicksLimit: 12 } } },
  } as const;

  return <div style={{ width: "100%", height: 300 }}><Line data={ds} options={options} /></div>;
}
