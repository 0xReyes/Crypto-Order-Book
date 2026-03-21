import { useMemo, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import type { ProcessedBook } from "@/hooks/useOrderBook";

type TimeRange = "24H" | "7D" | "30D" | "90D";

function generatePriceHistory(basePrice: number, points: number) {
  const data = [];
  let price = basePrice * 0.97;
  const now = Date.now();
  const interval = (24 * 60 * 60 * 1000) / points;

  for (let i = 0; i < points; i++) {
    const change = (Math.random() - 0.48) * basePrice * 0.002;
    price = Math.max(price + change, basePrice * 0.9);
    const volume = Math.random() * 500 + 100;
    data.push({
      time: now - (points - i) * interval,
      price: parseFloat(price.toFixed(2)),
      volume: parseFloat(volume.toFixed(2)),
    });
  }
  return data;
}

const RANGE_POINTS: Record<TimeRange, number> = {
  "24H": 96,
  "7D": 168,
  "30D": 360,
  "90D": 720,
};

interface PriceChartProps {
  data: ProcessedBook | undefined;
}

export default function PriceChart({ data }: PriceChartProps) {
  const [range, setRange] = useState<TimeRange>("24H");
  const basePrice = data?.midPrice ?? 100000;

  const chartData = useMemo(
    () => generatePriceHistory(basePrice, RANGE_POINTS[range]),
    [basePrice, range]
  );

  const prices = chartData.map((d) => d.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const padding = (maxPrice - minPrice) * 0.1;

  const lastPrice = chartData[chartData.length - 1]?.price ?? 0;
  const firstPrice = chartData[0]?.price ?? 0;
  const change = lastPrice - firstPrice;
  const changePercent = firstPrice > 0 ? (change / firstPrice) * 100 : 0;
  const isPositive = change >= 0;

  const ranges: TimeRange[] = ["24H", "7D", "30D", "90D"];

  return (
    <div className="bg-card border border-border rounded-md flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="font-display text-[11px] font-semibold tracking-widest uppercase text-muted-foreground">
          Price Chart
        </h2>
        <div className="flex items-center gap-1">
          {ranges.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-sm transition-colors font-mono ${
                range === r
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Price summary */}
      <div className="px-4 py-2 flex items-baseline gap-3">
        <span className="font-mono text-2xl font-bold text-foreground tabular-nums">
          ${lastPrice.toLocaleString("en-US", { minimumFractionDigits: 2 })}
        </span>
        <span
          className={`font-mono text-sm font-medium tabular-nums ${
            isPositive ? "text-bid" : "text-ask"
          }`}
        >
          {isPositive ? "+" : ""}
          {change.toFixed(2)} ({isPositive ? "+" : ""}
          {changePercent.toFixed(2)}%)
        </span>
      </div>

      {/* Chart */}
      <div className="flex-1 min-h-0 px-1 pb-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor={isPositive ? "hsl(145,100%,45%)" : "hsl(350,100%,62%)"}
                  stopOpacity={0.2}
                />
                <stop
                  offset="100%"
                  stopColor={isPositive ? "hsl(145,100%,45%)" : "hsl(350,100%,62%)"}
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="hsl(214,22%,16%)"
              vertical={false}
            />
            <XAxis
              dataKey="time"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(t) => {
                const d = new Date(t);
                return range === "24H"
                  ? d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
                  : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
              }}
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: "hsl(215,16%,37%)" }}
              minTickGap={40}
            />
            <YAxis
              domain={[minPrice - padding, maxPrice + padding]}
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: "hsl(215,16%,37%)" }}
              tickFormatter={(v) => `$${v.toLocaleString()}`}
              width={80}
              orientation="right"
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(216,28%,7%)",
                border: "1px solid hsl(214,22%,16%)",
                borderRadius: "4px",
                fontSize: "12px",
                fontFamily: "'IBM Plex Mono', monospace",
                color: "hsl(213,31%,91%)",
              }}
              formatter={(value: number) => [
                `$${value.toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
                "Price",
              ]}
              labelFormatter={(t) =>
                new Date(t).toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              }
            />
            <Area
              type="monotone"
              dataKey="price"
              stroke={isPositive ? "hsl(145,100%,45%)" : "hsl(350,100%,62%)"}
              strokeWidth={1.5}
              fill="url(#priceGradient)"
              dot={false}
              activeDot={{
                r: 3,
                stroke: isPositive ? "hsl(145,100%,45%)" : "hsl(350,100%,62%)",
                strokeWidth: 2,
                fill: "hsl(216,28%,7%)",
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
