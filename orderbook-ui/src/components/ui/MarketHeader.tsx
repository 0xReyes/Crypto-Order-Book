import { useState } from "react";
import type { ProcessedBook } from "@/hooks/useOrderBook";
import { fmt } from "@/lib/utils";

interface MarketHeaderProps {
  data: ProcessedBook | undefined;
  isLoading: boolean;
  onSymbolChange: (symbol: string) => void;
  refreshMs: number | false;
  onRefreshMsChange: (ms: number | false) => void;
}

export default function MarketHeader({
  data,
  isLoading,
  onSymbolChange,
  refreshMs,
  onRefreshMsChange,
}: MarketHeaderProps) {
  const [input, setInput] = useState("BTC");

  const handleSubmit = () => {
    const sym = input.trim().toUpperCase() || "BTC";
    onSymbolChange(sym);
  };

  return (
    <header className="cg-glass-strong flex items-center gap-5 px-6 py-3 sticky top-0 z-50 flex-wrap border-b border-white/10">
      {/* Logo */}
      <div className="font-display font-extrabold text-[17px] tracking-tight whitespace-nowrap">
        order<span className="text-primary">book</span>
      </div>

      {/* Symbol input */}
      <div className="flex items-center gap-1.5">
        <input
          className="bg-white/[0.04] border border-white/10 text-foreground font-mono text-[13px] px-2.5 py-1.5 rounded w-20 uppercase outline-none focus:border-primary/70 focus:ring-2 focus:ring-primary/20 transition"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          placeholder="BTC"
          spellCheck={false}
        />
        <button
          onClick={handleSubmit}
          disabled={isLoading}
          className="bg-primary text-primary-foreground font-mono text-xs font-semibold px-3.5 py-1.5 rounded tracking-wider hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_10px_30px_rgba(79,149,255,0.18)]"
        >
          FETCH
        </button>
      </div>

      {/* Stats */}
      {data && (
        <div className="hidden md:flex gap-4">
          <StatChip label="Best Bid" value={fmt(data.bestBid, 2)} className="text-bid" />
          <StatChip label="Best Ask" value={fmt(data.bestAsk, 2)} className="text-ask" />
          <StatChip
            label="Spread"
            value={fmt(data.spread, 2)}
            className={data.spread < 0 ? "text-ask" : "text-gold"}
          />
          <StatChip label="Mid" value={fmt(data.midPrice, 2)} />
        </div>
      )}

      {/* Refresh */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] tracking-wider uppercase text-muted-foreground">Refresh</span>
        <select
          value={refreshMs === false ? "off" : String(refreshMs)}
          onChange={(e) => {
            const v = e.target.value;
            onRefreshMsChange(v === "off" ? false : Number(v));
          }}
          className="bg-white/[0.04] border border-white/10 text-foreground font-mono text-[12px] px-2 py-1.5 rounded outline-none focus:border-primary/70 focus:ring-2 focus:ring-primary/20 transition"
        >
          <option value="off">Off</option>
          <option value="500">0.5s</option>
          <option value="1000">1s</option>
          <option value="2000">2s</option>
          <option value="5000">5s</option>
          <option value="10000">10s</option>
          <option value="30000">30s</option>
          <option value="60000">60s</option>
        </select>
      </div>

      {/* Crossed badge */}
      {data?.isCrossed && (
        <span className="text-[9px] px-1.5 py-0.5 rounded bg-ask/15 text-ask border border-ask/30 tracking-wider font-semibold">
          CROSSED
        </span>
      )}

      {/* Price hero */}
      <div className="flex items-baseline gap-2.5 ml-auto">
        <span className="font-display text-[26px] font-bold tracking-tight">
          {data ? fmt(data.midPrice, 2) : "—"}
        </span>
        <span className="text-muted-foreground text-[11px]">
          {data?.symbol ?? "BTC-USDT"}
        </span>
      </div>

      {/* Live dot */}
      <div className="flex items-center gap-2 text-muted-foreground text-[11px] whitespace-nowrap">
        <div
          className={`w-[7px] h-[7px] rounded-full flex-shrink-0 ${
            isLoading
              ? "bg-muted-foreground"
              : data?.dataMode === "static"
              ? "bg-gold shadow-[0_0_6px_hsl(var(--gold))]"
              : "bg-bid shadow-[0_0_6px_hsl(var(--bid))] animate-pulse"
          }`}
        />
        <span>
          {isLoading
            ? "loading…"
            : data?.dataMode === "static"
            ? `snapshot: ${Math.floor((Date.now() - (data?.timestamp ?? 0)) / 60000)}m ago`
            : data
            ? new Date(data.timestamp).toLocaleTimeString()
            : "—"}
        </span>
      </div>
    </header>
  );
}

function StatChip({
  label,
  value,
  className = "",
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground text-[10px] tracking-wider uppercase">
        {label}
      </span>
      <span className={`text-[13px] font-medium ${className}`}>{value}</span>
    </div>
  );
}
