import { useMemo } from "react";
import type { ProcessedBook } from "@/hooks/useOrderBook";
import { ScrollArea } from "@/components/ui/scroll-area";

interface OrderBookProps {
  data: ProcessedBook | undefined;
}

export default function OrderBook({ data }: OrderBookProps) {
  if (!data) return null;

  const { bids, asks, exchanges, median, outliers } = data;
  const spread = useMemo(() => {
    if (!data || !Number.isFinite(data.bestBid) || !Number.isFinite(data.bestAsk) || data.bestAsk === Infinity) return null;
    return data.bestAsk - data.bestBid;
  }, [data]);

  const spreadBps = useMemo(() => {
    if (spread == null || !data?.midPrice) return null;
    return (spread / data.midPrice) * 10000;
  }, [spread, data?.midPrice]);
  // Build cumulative
  const bidCum: [number, number, number][] = [];
  let c = 0;
  for (const [p, q] of bids) {
    c += q;
    bidCum.push([p, q, c]);
  }
  const askCum: [number, number, number][] = [];
  c = 0;
  for (const [p, q] of asks) {
    c += q;
    askCum.push([p, q, c]);
  }
  const maxCum = Math.max(
    bidCum.length ? bidCum[bidCum.length - 1]![2] : 0,
    askCum.length ? askCum[askCum.length - 1]![2] : 0
  );

  const apiErrors = exchanges.filter((ex) => ex.error).length;
  const outlierCount = outliers.size;

  const sorted = [...exchanges].sort((a, b) => {
    if (a.error && !b.error) return 1;
    if (!a.error && b.error) return -1;
    if (outliers.has(a.exchange) && !outliers.has(b.exchange)) return 1;
    if (!outliers.has(a.exchange) && outliers.has(b.exchange)) return -1;
    return (a.spread.spread || 999) - (b.spread.spread || 999);
  });
  const fmt = (value: number, decimals: number = 2) => value?.toFixed(decimals) ?? '0';
const fmtQty = (value: number) => value?.toLocaleString() ?? '0';
const pct = (value: number, max: number) => max > 0 ? `${(value / max) * 100}%` : '0%';

  return (
    <>
      {/* Bids Panel */}
      <div className="bg-card overflow-hidden flex flex-col">
        <div className="px-4 py-2 border-b border-border font-display text-[11px] font-semibold tracking-widest uppercase text-muted-foreground flex items-center gap-2.5">
          Bids{" "}
          <span className="text-[10px] px-1.5 py-px rounded font-mono font-normal tracking-normal bg-bid/10 text-bid border border-bid/20">
            {bidCum.length} levels
          </span>
        </div>
        <ScrollArea className="flex-1">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="sticky top-0 bg-card px-3.5 py-2 text-left text-muted-foreground text-[10px] tracking-wider uppercase font-normal border-b border-border z-[2]">
                  Price
                </th>
                <th className="sticky top-0 bg-card px-3.5 py-2 text-right text-muted-foreground text-[10px] tracking-wider uppercase font-normal border-b border-border z-[2]">
                  Size
                </th>
                <th className="sticky top-0 bg-card px-3.5 py-2 text-right text-muted-foreground text-[10px] tracking-wider uppercase font-normal border-b border-border z-[2]">
                  Cumulative
                </th>
              </tr>
            </thead>
            <tbody>
              {bidCum.map(([p, q, cum]) => (
                <tr
                  key={p}
                  className="hover:bg-white/[0.03] transition-colors"
                  style={
                    {
                      background: `linear-gradient(to left, hsl(var(--bid) / 0.08) ${pct(
                        cum,
                        maxCum
                      )}, transparent ${pct(cum, maxCum)})`,
                    } as React.CSSProperties
                  }
                >
                  <td className="px-3.5 py-1 text-left text-bid font-medium text-xs whitespace-nowrap leading-[1.7]">
                    {fmt(p, 2)}
                  </td>
                  <td className="px-3.5 py-1 text-right text-xs whitespace-nowrap leading-[1.7]">
                    {fmtQty(q)}
                  </td>
                  <td className="px-3.5 py-1 text-right text-muted-foreground text-xs whitespace-nowrap leading-[1.7]">
                    {fmtQty(cum)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>
      </div>

      {/* Asks Panel */}
      <div className="bg-card overflow-hidden flex flex-col">
        <div className="px-4 py-2 border-b border-border font-display text-[11px] font-semibold tracking-widest uppercase text-muted-foreground flex items-center gap-2.5">
          Asks{" "}
          <span className="text-[10px] px-1.5 py-px rounded font-mono font-normal tracking-normal bg-ask/10 text-ask border border-ask/20">
            {asks.length} levels
          </span>
        </div>
        <ScrollArea className="flex-1">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="sticky top-0 bg-card px-3.5 py-2 text-left text-muted-foreground text-[10px] tracking-wider uppercase font-normal border-b border-border z-[2]">
                  Price
                </th>
                <th className="sticky top-0 bg-card px-3.5 py-2 text-right text-muted-foreground text-[10px] tracking-wider uppercase font-normal border-b border-border z-[2]">
                  Size
                </th>
                <th className="sticky top-0 bg-card px-3.5 py-2 text-right text-muted-foreground text-[10px] tracking-wider uppercase font-normal border-b border-border z-[2]">
                  Cumulative
                </th>
              </tr>
            </thead>
            <tbody>
              {askCum.map(([p, q, cum]) => (
                <tr
                  key={p}
                  className="hover:bg-white/[0.03] transition-colors"
                  style={
                    {
                      background: `linear-gradient(to right, hsl(var(--ask) / 0.08) ${pct(
                        cum,
                        maxCum
                      )}, transparent ${pct(cum, maxCum)})`,
                    } as React.CSSProperties
                  }
                >
                  <td className="px-3.5 py-1 text-left text-ask font-medium text-xs whitespace-nowrap leading-[1.7]">
                    {fmt(p, 2)}
                  </td>
                  <td className="px-3.5 py-1 text-right text-xs whitespace-nowrap leading-[1.7]">
                    {fmtQty(q)}
                  </td>
                  <td className="px-3.5 py-1 text-right text-muted-foreground text-xs whitespace-nowrap leading-[1.7]">
                    {fmtQty(cum)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>
      </div>

      {/* Exchange Breakdown (spans full width below) */}
      <div
        className="bg-card border-t border-border overflow-x-auto max-h-[200px] overflow-y-auto"
        style={{ gridColumn: "1 / -1" }}
      >
        <div className="px-4 py-2.5 border-b border-border font-display text-[11px] font-semibold tracking-widest uppercase text-muted-foreground flex gap-4">
          <span>Exchange Breakdown</span>
          <span className="ml-auto font-normal font-mono text-muted-foreground">
            {data.okCount} ok · {apiErrors} api errors · {outlierCount} outliers
            · {data.totalCount} total
          </span>
        </div>
        <div className="flex flex-col">
          {sorted.map((ex) => {
            if (ex.error) {
              return (
                <div
                  key={ex.exchange}
                  className="grid grid-cols-[130px_1fr_1fr_80px] items-center px-3.5 py-1.5 border-b border-border/60 gap-2 opacity-35"
                >
                  <span className="font-medium text-xs truncate">
                    {ex.exchange}
                  </span>
                  <span className="text-[10px] text-ask/70 col-span-3">
                    {ex.error}
                  </span>
                </div>
              );
            }
            const isOutlier = outliers.has(ex.exchange);
            const devPct =
              median > 0
                ? ((ex.spread.mid / median - 1) * 100).toFixed(1)
                : "0.0";
            return (
              <div
                key={ex.exchange}
                className={`grid grid-cols-[130px_1fr_1fr_80px] items-center px-3.5 py-1.5 border-b border-border/60 gap-2 hover:bg-white/[0.02] transition-colors ${
                  isOutlier ? "opacity-35" : ""
                }`}
              >
                <span className="font-medium text-xs truncate">
                  {ex.exchange}
                  {isOutlier ? " ⚠" : ""}
                </span>
                <span
                  className={`text-xs text-right ${isOutlier ? "text-ask" : ""}`}
                >
                  {fmt(ex.spread.mid, 2)}
                </span>
                <span className="text-[11px] text-gold text-right">
                  {isOutlier ? devPct + "% off" : "±" + fmt(ex.spread.spread, 4)}
                </span>
                <span className="text-[10px] text-muted-foreground text-right">
                  {ex.levels.bids}/{ex.levels.asks}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
