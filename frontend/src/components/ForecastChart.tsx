import React, { useMemo } from "react";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler);

type Row = {
  datetime_utc: string;
  [k: string]: number | string | null | undefined;
};

type SeriesSpec = { key: string; name?: string; unit?: string };

type Props = {
  data: Row[];
  series?: SeriesSpec[];
  height?: number;
};

const defaultSeries: SeriesSpec[] = [{ key: "no2_forecast", name: "NO₂", unit: "molec·cm⁻²" }];

const palette = ["#60a5fa", "#34d399", "#f59e0b", "#ef4444", "#a78bfa", "#f472b6", "#22d3ee", "#d946ef", "#fb923c", "#84cc16"];

function fmtTickLabel(s: string) {
  try {
    const d = new Date(s);
    return d.toLocaleString(undefined, { month: "2-digit", day: "2-digit", hour: "2-digit" });
  } catch {
    return s;
  }
}

function prettyValue(label: string, v: number, unit?: string) {
  const L = label.toLowerCase();
  const isColumn =
    L.includes("no₂") || L.includes("no2") ||
    L.includes("o₃") || L.includes("o3") ||
    L.includes("hcho") || L.includes("ch2o") ||
    L.includes("column");
  // coluna (satélite) costuma ser bem pequena -> notação científica
  if (isColumn) return `${v.toExponential(2)}${unit ? ` ${unit}` : ""}`;
  // PM / AI / meteo: valor normal
  return `${Number.isFinite(v) ? v.toFixed(2) : v}${unit ? ` ${unit}` : ""}`;
}

export default function ForecastChart({ data, series = defaultSeries, height = 280 }: Props) {
  const hasData = Array.isArray(data) && data.length > 0;

  const labels = useMemo(() => (hasData ? data.map((r) => r.datetime_utc) : []), [hasData, data]);

  const datasets = useMemo(() => {
    if (!hasData) return [];
    return series.map((s, i) => {
      const values = data.map((r) => {
        const v = r[s.key];
        return typeof v === "number" ? v : v == null ? null : Number(v);
      });
      const color = palette[i % palette.length];
      return {
        label: s.name ?? s.key,
        data: values,
        borderColor: color,
        backgroundColor: color + "44",
        tension: 0.3,
        pointRadius: 0,
        borderWidth: 2,
        spanGaps: true,
        _unit: s.unit, // guardamos a unidade para o tooltip
      } as any;
    });
  }, [hasData, data, series]);

  const chartData = useMemo(
    () => ({
      labels,
      datasets,
    }),
    [labels, datasets]
  );

  const options = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false as const,
      interaction: { mode: "index" as const, intersect: false },
      plugins: {
        legend: { display: (series?.length ?? 1) > 1, labels: { color: "#e5e7eb", boxWidth: 16 } },
        tooltip: {
          callbacks: {
            title: (items: any[]) => (items?.[0]?.label ? `UTC: ${items[0].label}` : ""),
            label: (ctx: any) => {
              const label = ctx.dataset?.label ?? ctx.datasetIndex;
              const v = ctx.parsed?.y as number;
              const unit = (ctx.dataset as any)?._unit as string | undefined;
              if (typeof v === "number") return `${label}: ${prettyValue(label, v, unit)}`;
              return `${label}: ${v ?? "—"}`;
            },
          },
          backgroundColor: "#111827",
          titleColor: "#e5e7eb",
          bodyColor: "#e5e7eb",
          borderColor: "#374151",
          borderWidth: 1,
        },
      },
      scales: {
        x: {
          ticks: {
            color: "#9ca3af",
            maxRotation: 0,
            autoSkip: true,
            callback: (val: any, idx: number) => fmtTickLabel(labels[idx]),
            font: { size: 12 },
          },
          grid: { color: "#1f2937" },
        },
        y: {
          ticks: { color: "#9ca3af", font: { size: 12 } },
          grid: { color: "#1f2937" },
        },
      },
    }),
    [labels, series]
  );

  if (!hasData) {
    return (
      <div
        style={{
          width: "100%",
          height,
          display: "grid",
          placeItems: "center",
          border: "1px solid #1f2937",
          borderRadius: 8,
          background: "#0b0f19",
          color: "#9ca3af",
          fontSize: 14,
        }}
      >
        No time series data.
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height }}>
      <Line data={chartData as any} options={options as any} />
    </div>
  );
}
