import { useMemo, useEffect, useRef, useState, useCallback } from "react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import type { ProcessedBook } from "@/hooks/useOrderBook";

type LevelPoint = {
  p: number;
  q: number;
  usd: number;
  cumUsd: number;
  cumQty: number;
};

type HoverState = {
  clientX: number;
  clientY: number;
  mouseX: number;
  mouseY: number;
  price: number;
  bid: LevelPoint | null;
  ask: LevelPoint | null;
};

type ViewState = {
  minP: number;
  maxP: number;
  center: number;
  bidTotalUsd: number;
  askTotalUsd: number;
  maxLevelUsd: number;
  bids: LevelPoint[];
  asks: LevelPoint[];
};

type DragMode = "pan" | "xaxis" | "yaxis" | null;

const PAD = { top: 28, right: 76, bottom: 48, left: 76 };
const MIN_X_ZOOM = 0.0000005;
const MAX_X_ZOOM = 5;
const DEFAULT_X_ZOOM = 0.005;
const MIN_Y_ZOOM = 0.05;
const MAX_Y_ZOOM = 200;
const DEFAULT_Y_ZOOM = 1;
const ROW_COUNT = 6;

/* ── helpers ─────────────────────────────────────────────────── */

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function setupCanvas(canvas: HTMLCanvasElement, width: number, height: number) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(width * dpr));
  canvas.height = Math.max(1, Math.floor(height * dpr));
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  return ctx;
}

function buildLevels(
  levels: [number, number][],
  side: "bid" | "ask",
  minP: number,
  maxP: number
): LevelPoint[] {
  const filtered = levels
    .filter(([p, q]) => Number.isFinite(p) && Number.isFinite(q) && p >= minP && p <= maxP && q > 0)
    .sort((a, b) => (side === "bid" ? b[0] - a[0] : a[0] - b[0]))
    .map(([p, q]) => ({ p, q, usd: p * q, cumUsd: 0, cumQty: 0 }));
  let cumUsd = 0;
  let cumQty = 0;
  for (const level of filtered) {
    cumUsd += level.usd;
    cumQty += level.q;
    level.cumUsd = cumUsd;
    level.cumQty = cumQty;
  }
  return filtered;
}

function findBidAtPrice(levels: LevelPoint[], price: number): LevelPoint | null {
  let lo = 0, hi = levels.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (levels[mid]!.p >= price) { ans = mid; lo = mid + 1; } else { hi = mid - 1; }
  }
  return ans >= 0 ? levels[ans]! : null;
}

function findAskAtPrice(levels: LevelPoint[], price: number): LevelPoint | null {
  let lo = 0, hi = levels.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (levels[mid]!.p <= price) { ans = mid; lo = mid + 1; } else { hi = mid - 1; }
  }
  return ans >= 0 ? levels[ans]! : null;
}

function pctLabel(value: number) {
  return `${(value * 100).toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}%`;
}

function shortMoney(value: number) {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/* ── nice tick generation ────────────────────────────────────── */

function niceNum(range: number, round: boolean): number {
  if (range <= 0 || !Number.isFinite(range)) return 1;
  const exp = Math.floor(Math.log10(range));
  const frac = range / Math.pow(10, exp);
  let nice: number;
  if (round) {
    nice = frac < 1.5 ? 1 : frac < 3 ? 2 : frac < 7 ? 5 : 10;
  } else {
    nice = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10;
  }
  return nice * Math.pow(10, exp);
}

function generateTicks(min: number, max: number, maxTicks: number): number[] {
  if (max <= min || !Number.isFinite(min) || !Number.isFinite(max)) return [min];
  const spacing = niceNum((max - min) / Math.max(maxTicks - 1, 1), true);
  const niceMin = Math.ceil(min / spacing) * spacing;
  const ticks: number[] = [];
  for (let t = niceMin; t <= max + spacing * 0.001; t += spacing) {
    if (t >= min - spacing * 0.001) ticks.push(t);
    if (ticks.length > maxTicks + 2) break;
  }
  return ticks;
}

function smartPriceFmt(price: number, range: number): string {
  if (range < 0.001) return price.toLocaleString(undefined, { minimumFractionDigits: 6, maximumFractionDigits: 6 });
  if (range < 0.1) return price.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  if (range < 10) return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (range < 1_000) return price.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return price.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

/* ── slider log mapping ──────────────────────────────────────── */

const xToSlider = (z: number) =>
  (Math.log(z / MIN_X_ZOOM) / Math.log(MAX_X_ZOOM / MIN_X_ZOOM)) * 100;
const sliderToX = (v: number) =>
  MIN_X_ZOOM * Math.pow(MAX_X_ZOOM / MIN_X_ZOOM, v / 100);
const yToSlider = (z: number) =>
  (Math.log(z / MIN_Y_ZOOM) / Math.log(MAX_Y_ZOOM / MIN_Y_ZOOM)) * 100;
const sliderToY = (v: number) =>
  MIN_Y_ZOOM * Math.pow(MAX_Y_ZOOM / MIN_Y_ZOOM, v / 100);

/* ── depth table ─────────────────────────────────────────────── */

function DepthTable({
  title,
  tone,
  rows,
}: {
  title: string;
  tone: "bid" | "ask";
  rows: LevelPoint[];
}) {
  const isBid = tone === "bid";
  const titleTone = isBid ? "text-emerald-400" : "text-rose-400";
  const badgeTone = isBid
    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
    : "border-rose-500/30 bg-rose-500/10 text-rose-400";
  const rowBarTone = isBid ? "bg-emerald-500/10" : "bg-rose-500/10";
  const maxQty = rows.length ? Math.max(...rows.map((r) => r.q), 1) : 1;

  return (
    <div className="min-w-0 border-t border-white/6">
      <div className="flex items-center gap-2 border-b border-white/6 px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          {title}
        </span>
        <span className={`rounded-md border px-2 py-0.5 text-[10px] font-mono ${badgeTone}`}>
          {rows.length} LEVELS
        </span>
      </div>
      <div className="grid grid-cols-[1.3fr_1fr_1fr] gap-3 border-b border-white/6 px-3 py-3 text-[11px] uppercase tracking-[0.18em] text-slate-500">
        <span>Price</span>
        <span className="text-right">Size</span>
        <span className="text-right">Cumulative</span>
      </div>
      <div>
        {rows.map((row) => {
          const width = `${(row.q / maxQty) * 100}%`;
          return (
            <div
              key={`${title}-${row.p}`}
              className="relative grid grid-cols-[1.3fr_1fr_1fr] gap-3 overflow-hidden border-b border-white/5 px-3 py-2.5 text-[13px] font-mono"
            >
              <div
                className={`absolute inset-y-0 ${isBid ? "left-0" : "right-0"} ${rowBarTone}`}
                style={{ width }}
              />
              <span className={`relative z-10 font-semibold ${titleTone}`}>
                {row.p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="relative z-10 text-right text-slate-200">
                {row.q.toLocaleString(undefined, { maximumFractionDigits: 6 })}
              </span>
              <span className="relative z-10 text-right text-slate-500">
                {row.cumQty.toLocaleString(undefined, { maximumFractionDigits: 6 })}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── main component ──────────────────────────────────────────── */

export default function DepthChart({ data }: DepthChartProps) {
  const plotRef = useRef<HTMLDivElement>(null);
  const baseCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);

  const dragRef = useRef<{
    mode: DragMode;
    startX: number;
    startY: number;
    startCenter: number;
    startXZoom: number;
    startYZoom: number;
  }>({ mode: null, startX: 0, startY: 0, startCenter: 0, startXZoom: DEFAULT_X_ZOOM, startYZoom: DEFAULT_Y_ZOOM });

  const [size, setSize] = useState({ width: 0, height: 0 });
  const [xZoom, setXZoom] = useState(DEFAULT_X_ZOOM);
  const [yZoom, setYZoom] = useState(DEFAULT_Y_ZOOM);
  const [centerPrice, setCenterPrice] = useState<number | null>(null);
  const [hover, setHover] = useState<HoverState | null>(null);
  const [cursorStyle, setCursorStyle] = useState("crosshair");

  // Stable Y ceilings — only rescale when data meaningfully exceeds or shrinks below current
  const stableBidCeilRef = useRef(0);
  const stableAskCeilRef = useRef(0);

  const fullRange = useMemo(() => {
    if (!data) return null;
    const bidMin = data.bids.length ? Math.min(...data.bids.map(([p]) => p)) : data.midPrice;
    const askMax = data.asks.length ? Math.max(...data.asks.map(([p]) => p)) : data.midPrice;
    return {
      min: Math.min(bidMin, data.bestBid || data.midPrice, data.midPrice),
      max: Math.max(askMax, Number.isFinite(data.bestAsk) ? data.bestAsk : data.midPrice, data.midPrice),
    };
  }, [data]);

  useEffect(() => {
    if (!data) return;
    setCenterPrice((prev) => (prev == null || !Number.isFinite(prev) ? data.midPrice : prev));
  }, [data?.midPrice]);

  const view = useMemo<ViewState | null>(() => {
    if (!data || !fullRange) return null;
    const mid = data.midPrice;
    const center = centerPrice ?? mid;
    const half = Math.max(mid * xZoom, mid * MIN_X_ZOOM);
    let minP = center - half;
    let maxP = center + half;
    const fullWidth = fullRange.max - fullRange.min;
    const visibleWidth = maxP - minP;
    if (visibleWidth < fullWidth) {
      if (minP < fullRange.min) { maxP += fullRange.min - minP; minP = fullRange.min; }
      if (maxP > fullRange.max) { minP -= maxP - fullRange.max; maxP = fullRange.max; }
    }
    const bids = buildLevels(data.bids, "bid", minP, maxP);
    const asks = buildLevels(data.asks, "ask", minP, maxP);
    const maxLevelUsd = Math.max(1, ...bids.map((d) => d.usd), ...asks.map((d) => d.usd));
    const bidTotal = bids.length ? bids[bids.length - 1]!.cumUsd : 0;
    const askTotal = asks.length ? asks[asks.length - 1]!.cumUsd : 0;
    return {
      minP, maxP,
      center: (minP + maxP) / 2,
      bids, asks,
      bidTotalUsd: bidTotal,
      askTotalUsd: askTotal,
      maxLevelUsd,
    };
  }, [data, fullRange, centerPrice, xZoom]);

  const spread = useMemo(() => {
    if (!data || !Number.isFinite(data.bestBid) || !Number.isFinite(data.bestAsk) || data.bestAsk === Infinity) return null;
    return data.bestAsk - data.bestBid;
  }, [data]);

  const spreadBps = useMemo(() => {
    if (spread == null || !data?.midPrice) return null;
    return (spread / data.midPrice) * 10000;
  }, [spread, data?.midPrice]);

  const clampCenter = useCallback(
    (nextCenter: number, nextXZoom: number) => {
      if (!data || !fullRange) return nextCenter;
      const half = Math.max(data.midPrice * nextXZoom, data.midPrice * MIN_X_ZOOM);
      const minCenter = fullRange.min + half;
      const maxCenter = fullRange.max - half;
      if (minCenter > maxCenter) return data.midPrice;
      return clamp(nextCenter, minCenter, maxCenter);
    },
    [data, fullRange]
  );

  /* ── resize observer ───────────────────────────────────────── */

  useEffect(() => {
    const el = plotRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      setSize({ width: Math.floor(rect.width), height: Math.floor(rect.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ── region detection ──────────────────────────────────────── */

  const getRegion = useCallback(
    (mx: number, my: number): DragMode | "chart" => {
      const innerW = size.width - PAD.left - PAD.right;
      const innerH = size.height - PAD.top - PAD.bottom;
      if (innerW <= 0 || innerH <= 0) return null;

      const inXBand = mx >= PAD.left && mx <= PAD.left + innerW;
      const inYBand = my >= PAD.top && my <= PAD.top + innerH;

      if (my > PAD.top + innerH && inXBand) return "xaxis";
      if ((mx < PAD.left || mx > PAD.left + innerW) && inYBand) return "yaxis";
      if (inXBand && inYBand) return "chart";
      return null;
    },
    [size]
  );

  /* ── draw base ─────────────────────────────────────────────── */

  const drawBase = useCallback(() => {
    if (!view || !data || !baseCanvasRef.current) return;
    const { width, height } = size;
    if (!width || !height) return;
    const ctx = setupCanvas(baseCanvasRef.current, width, height);
    if (!ctx) return;

    const innerW = width - PAD.left - PAD.right;
    const innerH = height - PAD.top - PAD.bottom;
    if (innerW <= 0 || innerH <= 0) return;

    const xFor = (price: number) => PAD.left + ((price - view.minP) / (view.maxP - view.minP || 1)) * innerW;

    // Stable Y ceilings: snap to nice numbers, only rescale when data exceeds or drops below 40%
    const rawBidCeil = Math.max(view.bidTotalUsd / Math.max(yZoom, 0.0001), 1);
    const rawAskCeil = Math.max(view.askTotalUsd / Math.max(yZoom, 0.0001), 1);

    const computeStableCeil = (raw: number, prev: number): number => {
      const niceCeil = niceNum(raw * 1.15, false); // round up to next nice number with 15% headroom
      if (prev <= 0) return niceCeil;
      // Only rescale if data exceeds current ceiling or dropped below 40%
      if (raw > prev || raw < prev * 0.4) return niceCeil;
      return prev;
    };

    stableBidCeilRef.current = computeStableCeil(rawBidCeil, stableBidCeilRef.current);
    stableAskCeilRef.current = computeStableCeil(rawAskCeil, stableAskCeilRef.current);

    const bidCeil = stableBidCeilRef.current;
    const askCeil = stableAskCeilRef.current;
    const bidYFor = (usd: number) => PAD.top + innerH - (usd / bidCeil) * innerH;
    const askYFor = (usd: number) => PAD.top + innerH - (usd / askCeil) * innerH;

    ctx.fillStyle = "rgba(2, 11, 20, 0.55)";
    ctx.fillRect(0, 0, width, height);

    /* ── dynamic grid + labels ────────────────────────────────── */

    const priceRange = view.maxP - view.minP;
    const xTicks = generateTicks(view.minP, view.maxP, 7);
    const yTicksBid = generateTicks(0, bidCeil, 5);
    const yTicksAsk = generateTicks(0, askCeil, 5);

    // X gridlines
    for (const tick of xTicks) {
      const x = xFor(tick);
      if (x < PAD.left || x > PAD.left + innerW) continue;
      ctx.strokeStyle = "rgba(255,255,255,0.05)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, PAD.top);
      ctx.lineTo(x, PAD.top + innerH);
      ctx.stroke();
    }

    // Y gridlines from bid ticks (they're as good as any for horizontal lines)
    for (const tick of yTicksBid) {
      const y = bidYFor(tick);
      if (y < PAD.top || y > PAD.top + innerH) continue;
      ctx.setLineDash([2, 6]);
      ctx.strokeStyle = "rgba(255,255,255,0.04)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(PAD.left, y);
      ctx.lineTo(PAD.left + innerW, y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Bid Y-axis labels (left, green-tinted)
    ctx.font = '600 10px "IBM Plex Mono", monospace';
    ctx.textAlign = "right";
    for (const tick of yTicksBid) {
      const y = bidYFor(tick);
      if (y < PAD.top + 2 || y > PAD.top + innerH - 2) continue;
      ctx.fillStyle = "rgba(0,255,153,0.5)";
      ctx.fillText(shortMoney(tick), PAD.left - 10, y + 3);
    }

    // Ask Y-axis labels (right, red-tinted)
    ctx.textAlign = "left";
    for (const tick of yTicksAsk) {
      const y = askYFor(tick);
      if (y < PAD.top + 2 || y > PAD.top + innerH - 2) continue;
      ctx.fillStyle = "rgba(255,61,113,0.5)";
      ctx.fillText(shortMoney(tick), PAD.left + innerW + 10, y + 3);
    }

    /* ── individual-level bars ────────────────────────────────── */

    const barMaxH = innerH * 0.18;
    for (let i = 0; i < view.bids.length; i++) {
      const level = view.bids[i]!;
      const nextP = i + 1 < view.bids.length ? view.bids[i + 1]!.p : view.minP;
      const x1 = xFor(nextP);
      const x2 = xFor(level.p);
      const barH = (level.usd / view.maxLevelUsd) * barMaxH;
      ctx.fillStyle = "rgba(0, 255, 153, 0.14)";
      ctx.fillRect(x1, PAD.top + innerH - barH, Math.max(1, x2 - x1 - 1), barH);
    }
    for (let i = 0; i < view.asks.length; i++) {
      const level = view.asks[i]!;
      const nextP = i + 1 < view.asks.length ? view.asks[i + 1]!.p : view.maxP;
      const x1 = xFor(level.p);
      const x2 = xFor(nextP);
      const barH = (level.usd / view.maxLevelUsd) * barMaxH;
      ctx.fillStyle = "rgba(255, 61, 113, 0.14)";
      ctx.fillRect(x1, PAD.top + innerH - barH, Math.max(1, x2 - x1 - 1), barH);
    }

    /* ── cumulative depth curves ──────────────────────────────── */

    const drawDepth = (levels: LevelPoint[], side: "bid" | "ask") => {
      if (!levels.length) return;
      const isBid = side === "bid";
      const sideYFor = isBid ? bidYFor : askYFor;
      const lineColor = isBid ? "rgba(0,255,153,0.96)" : "rgba(255,61,113,0.96)";
      const topFill = isBid ? "rgba(0,255,153,0.16)" : "rgba(255,61,113,0.16)";
      const bottomFill = isBid ? "rgba(0,255,153,0.02)" : "rgba(255,61,113,0.02)";

      const path = new Path2D();
      path.moveTo(xFor(data.midPrice), sideYFor(0));
      path.lineTo(xFor(levels[0]!.p), sideYFor(0));
      for (let i = 0; i < levels.length; i++) {
        const prev = i === 0 ? 0 : levels[i - 1]!.cumUsd;
        path.lineTo(xFor(levels[i]!.p), sideYFor(prev));
        path.lineTo(xFor(levels[i]!.p), sideYFor(levels[i]!.cumUsd));
      }
      const fill = new Path2D(path);
      fill.lineTo(xFor(levels[levels.length - 1]!.p), sideYFor(0));
      fill.lineTo(xFor(data.midPrice), sideYFor(0));
      fill.closePath();

      const grad = ctx.createLinearGradient(0, PAD.top, 0, PAD.top + innerH);
      grad.addColorStop(0, topFill);
      grad.addColorStop(1, bottomFill);
      ctx.fillStyle = grad;
      ctx.fill(fill);
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 2;
      ctx.stroke(path);
    };

    drawDepth(view.bids, "bid");
    drawDepth(view.asks, "ask");

    /* ── crossed market overlay ───────────────────────────────── */

    if (data.isCrossed) {
      const x1 = Math.max(PAD.left, xFor(data.bestAsk));
      const x2 = Math.min(PAD.left + innerW, xFor(data.bestBid));
      if (x2 > x1) {
        ctx.fillStyle = "rgba(255, 184, 0, 0.08)";
        ctx.fillRect(x1, PAD.top, x2 - x1, innerH);
        ctx.strokeStyle = "rgba(255, 184, 0, 0.16)";
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        ctx.moveTo(x1, PAD.top); ctx.lineTo(x1, PAD.top + innerH);
        ctx.moveTo(x2, PAD.top); ctx.lineTo(x2, PAD.top + innerH);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    /* ── mid price line ───────────────────────────────────────── */

    const midX = xFor(data.midPrice);
    ctx.setLineDash([3, 5]);
    ctx.strokeStyle = "rgba(79, 172, 255, 0.7)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(midX, PAD.top);
    ctx.lineTo(midX, PAD.top + innerH);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(80, 174, 255, 1)";
    ctx.font = '700 11px "IBM Plex Mono", monospace';
    ctx.textAlign = "center";
    ctx.fillText(
      data.midPrice.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 }),
      midX,
      PAD.top - 8
    );
    if (data.isCrossed) {
      ctx.fillStyle = "rgba(255, 184, 0, 0.95)";
      ctx.font = '700 10px "IBM Plex Mono", monospace';
      ctx.fillText("CROSSED", midX, PAD.top + 14);
    }

    /* ── side labels ──────────────────────────────────────────── */

    ctx.fillStyle = "rgba(0,255,153,0.95)";
    ctx.textAlign = "left";
    ctx.font = '700 12px "IBM Plex Mono", monospace';
    ctx.fillText("BIDS", PAD.left + 4, PAD.top + 14);
    ctx.fillStyle = "rgba(255,61,113,0.95)";
    ctx.textAlign = "right";
    ctx.fillText("ASKS", PAD.left + innerW - 4, PAD.top + 14);

    /* ── chart border ─────────────────────────────────────────── */

    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(PAD.left, PAD.top, innerW, innerH);
    ctx.stroke();

    /* ── X-axis ticks + labels (dynamic) ──────────────────────── */

    const axisY = PAD.top + innerH;
    ctx.fillStyle = "rgba(148,163,184,0.78)";
    ctx.font = '600 11px "IBM Plex Mono", monospace';
    ctx.textAlign = "center";
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 1;

    for (const tick of xTicks) {
      const x = xFor(tick);
      if (x < PAD.left - 2 || x > PAD.left + innerW + 2) continue;
      ctx.beginPath();
      ctx.moveTo(x, axisY);
      ctx.lineTo(x, axisY + 6);
      ctx.stroke();
      ctx.fillText(smartPriceFmt(tick, priceRange), x, axisY + 20);
    }

    ctx.fillStyle = "rgba(148,163,184,0.55)";
    ctx.font = '700 10px "IBM Plex Mono", monospace';
    ctx.textAlign = "center";
    ctx.fillText("PRICE", PAD.left + innerW / 2, axisY + 32);
  }, [view, data, size, yZoom]);

  /* ── draw overlay ──────────────────────────────────────────── */

  const drawOverlay = useCallback(() => {
    if (!overlayCanvasRef.current) return;
    const { width, height } = size;
    if (!width || !height) return;
    const ctx = setupCanvas(overlayCanvasRef.current, width, height);
    if (!ctx || !view || !hover) return;

    const innerW = width - PAD.left - PAD.right;
    const innerH = height - PAD.top - PAD.bottom;
    const xFor = (price: number) => PAD.left + ((price - view.minP) / (view.maxP - view.minP || 1)) * innerW;
    const bidCeil = stableBidCeilRef.current || Math.max(view.bidTotalUsd / Math.max(yZoom, 0.0001), 1) * 1.15;
    const askCeil = stableAskCeilRef.current || Math.max(view.askTotalUsd / Math.max(yZoom, 0.0001), 1) * 1.15;
    const bidYFor = (usd: number) => PAD.top + innerH - (usd / bidCeil) * innerH;
    const askYFor = (usd: number) => PAD.top + innerH - (usd / askCeil) * innerH;

    ctx.setLineDash([3, 5]);
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(hover.mouseX, PAD.top);
    ctx.lineTo(hover.mouseX, PAD.top + innerH);
    ctx.stroke();
    ctx.setLineDash([]);

    if (hover.bid) {
      const x = xFor(hover.bid.p);
      const y = bidYFor(hover.bid.cumUsd);
      ctx.strokeStyle = "rgba(0,255,153,0.18)";
      ctx.beginPath();
      ctx.moveTo(PAD.left, y);
      ctx.lineTo(PAD.left + innerW, y);
      ctx.stroke();
      ctx.fillStyle = "rgba(0,255,153,1)";
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    if (hover.ask) {
      const x = xFor(hover.ask.p);
      const y = askYFor(hover.ask.cumUsd);
      ctx.strokeStyle = "rgba(255,61,113,0.18)";
      ctx.beginPath();
      ctx.moveTo(PAD.left, y);
      ctx.lineTo(PAD.left + innerW, y);
      ctx.stroke();
      ctx.fillStyle = "rgba(255,61,113,1)";
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [size, view, hover, yZoom]);

  useEffect(() => { drawBase(); }, [drawBase]);
  useEffect(() => { drawOverlay(); }, [drawOverlay]);

  /* ── mouse handlers ────────────────────────────────────────── */

  const canvasRectRef = useRef<DOMRect | null>(null);

  // Window-level drag handler — fires even when cursor leaves canvas
  const handleWindowDrag = useCallback(
    (e: MouseEvent) => {
      if (!view || !canvasRectRef.current) return;
      const rect = canvasRectRef.current;
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const { mode } = dragRef.current;

      if (mode === "xaxis") {
        const delta = mx - dragRef.current.startX;
        const newZoom = clamp(
          dragRef.current.startXZoom * Math.pow(2, delta / 120),
          MIN_X_ZOOM,
          MAX_X_ZOOM
        );
        setXZoom(newZoom);
        setCenterPrice(clampCenter(dragRef.current.startCenter, newZoom));
        stableBidCeilRef.current = 0;
        stableAskCeilRef.current = 0;
        setCursorStyle("ew-resize");
        setHover(null);
        return;
      }

      if (mode === "yaxis") {
        const delta = my - dragRef.current.startY;
        const newZoom = clamp(
          dragRef.current.startYZoom * Math.pow(2, -delta / 120),
          MIN_Y_ZOOM,
          MAX_Y_ZOOM
        );
        setYZoom(newZoom);
        stableBidCeilRef.current = 0;
        stableAskCeilRef.current = 0;
        setCursorStyle("ns-resize");
        setHover(null);
        return;
      }

      if (mode === "pan") {
        const innerW = size.width - PAD.left - PAD.right;
        if (innerW > 0) {
          const pricePerPx = (view.maxP - view.minP) / innerW;
          const deltaPx = mx - dragRef.current.startX;
          setCenterPrice(clampCenter(dragRef.current.startCenter - deltaPx * pricePerPx, xZoom));
        }
        setCursorStyle("grabbing");
      }
    },
    [view, size, xZoom, clampCenter]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      canvasRectRef.current = rect;
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const region = getRegion(mx, my);

      if (region === "xaxis" || region === "yaxis" || region === "chart") {
        dragRef.current = {
          mode: region === "chart" ? "pan" : region,
          startX: mx,
          startY: my,
          startCenter: centerPrice ?? data?.midPrice ?? 0,
          startXZoom: xZoom,
          startYZoom: yZoom,
        };
        // Attach window-level listeners so drag works outside canvas
        window.addEventListener("mousemove", handleWindowDrag);
      }
    },
    [getRegion, centerPrice, data?.midPrice, xZoom, yZoom, handleWindowDrag]
  );

  // Canvas-level hover handler — only for cursor/tooltip when NOT dragging
  const handleCanvasHover = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!view) return;
      const { mode } = dragRef.current;
      if (mode) return; // dragging is handled by window listener

      const rect = e.currentTarget.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const innerW = size.width - PAD.left - PAD.right;

      // Set cursor by region
      const region = getRegion(mx, my);
      if (region === "xaxis") setCursorStyle("ew-resize");
      else if (region === "yaxis") setCursorStyle("ns-resize");
      else setCursorStyle("crosshair");

      // Hover tooltip
      if (region === "chart") {
        const price = view.minP + ((mx - PAD.left) / innerW) * (view.maxP - view.minP);
        setHover({
          clientX: e.clientX,
          clientY: e.clientY,
          mouseX: mx,
          mouseY: my,
          price,
          bid: findBidAtPrice(view.bids, price),
          ask: findAskAtPrice(view.asks, price),
        });
      } else {
        setHover(null);
      }
    },
    [view, size, getRegion]
  );

  const stopDragging = useCallback(() => {
    dragRef.current.mode = null;
    setCursorStyle("crosshair");
    window.removeEventListener("mousemove", handleWindowDrag);
  }, [handleWindowDrag]);

  useEffect(() => {
    window.addEventListener("mouseup", stopDragging);
    return () => {
      window.removeEventListener("mouseup", stopDragging);
      window.removeEventListener("mousemove", handleWindowDrag);
    };
  }, [stopDragging, handleWindowDrag]);

  const resetView = useCallback(() => {
    if (!data) return;
    setXZoom(DEFAULT_X_ZOOM);
    setYZoom(DEFAULT_Y_ZOOM);
    setCenterPrice(data.midPrice);
    stableBidCeilRef.current = 0;
    stableAskCeilRef.current = 0;
  }, [data]);

  /* ── slider handlers ───────────────────────────────────────── */

  const handleXSlider = useCallback(
    (val: number[]) => {
      const next = sliderToX(val[0]!);
      setXZoom(next);
      stableBidCeilRef.current = 0;
      stableAskCeilRef.current = 0;
      if (data) setCenterPrice(clampCenter(centerPrice ?? data.midPrice, next));
    },
    [data, centerPrice, clampCenter]
  );

  const handleYSlider = useCallback((val: number[]) => {
    setYZoom(sliderToY(val[0]!));
    stableBidCeilRef.current = 0;
    stableAskCeilRef.current = 0;
  }, []);

  const displayBids = useMemo(() => (view?.bids ?? []).slice(0, ROW_COUNT), [view?.bids]);
  const displayAsks = useMemo(() => (view?.asks ?? []).slice(0, ROW_COUNT), [view?.asks]);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="cg-glass overflow-hidden rounded-none text-white" style={{ gridColumn: "1 / -1" }}>
        {/* ── header ─────────────────────────────────────────────── */}
        <div className="border-b border-white/10 bg-white/[0.03] px-4 py-3">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            {/* Left side stats */}
            <div className="flex flex-wrap items-center gap-6">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-500">
                  Depth Chart
                </div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                  Bids {view ? `-${pctLabel(xZoom)}` : ""}
                </div>
                <div className="font-mono text-[14px] font-semibold text-emerald-400">
                  {shortMoney(view?.bidTotalUsd ?? 0)}
                </div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                  Asks {view ? `+${pctLabel(xZoom)}` : ""}
                </div>
                <div className="font-mono text-[14px] font-semibold text-rose-400">
                  {shortMoney(view?.askTotalUsd ?? 0)}
                </div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Spread</div>
                <div className="font-mono text-[14px] font-semibold text-slate-100">
                  {spread != null
                    ? `${spread.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${spreadBps != null ? ` • ${spreadBps.toFixed(1)} bps` : ""}`
                    : "—"}
                </div>
              </div>
            </div>

            {/* Right side controls */}
            <div className="flex items-center gap-4 flex-wrap">
              {/* X zoom slider */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-2.5">
                    <span className="text-[11px] uppercase tracking-[0.18em] text-slate-500 whitespace-nowrap">
                      X Range
                    </span>
                    <Slider
                      value={[xToSlider(xZoom)]}
                      onValueChange={handleXSlider}
                      min={0}
                      max={100}
                      step={0.5}
                      className="w-24"
                    />
                    <span className="font-mono text-[11px] text-slate-300 min-w-[48px] text-right">
                      {pctLabel(xZoom)}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  Price range around mid · drag X axis to zoom
                </TooltipContent>
              </Tooltip>

              {/* Y zoom slider */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-2.5">
                    <span className="text-[11px] uppercase tracking-[0.18em] text-slate-500 whitespace-nowrap">
                      Y Scale
                    </span>
                    <Slider
                      value={[yToSlider(yZoom)]}
                      onValueChange={handleYSlider}
                      min={0}
                      max={100}
                      step={0.5}
                      className="w-24"
                    />
                    <span className="font-mono text-[11px] text-slate-300 min-w-[36px] text-right">
                      {yZoom.toFixed(1)}×
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  Value axis scale · drag Y axis to zoom
                </TooltipContent>
              </Tooltip>

              <Button
                onClick={resetView}
                className="rounded-md border border-white/6 bg-white/[0.03] px-3 py-1.5 text-[11px] font-mono font-semibold text-slate-400 transition hover:border-white/12 hover:text-slate-200"
              >
                RESET
              </Button>
            </div>
          </div>
        </div>

        {/* ── chart area ─────────────────────────────────────────── */}
        <div
          ref={plotRef}
          className="relative w-full select-none border-b border-white/10 bg-transparent"
          style={{ height: "clamp(260px, 36vh, 440px)" }}
        >
          {!view ? (
            <div className="absolute inset-0 grid place-items-center text-sm text-slate-500">
              No depth data
            </div>
          ) : (
            <>
              <canvas ref={baseCanvasRef} className="absolute inset-0 block" />
              <canvas
                ref={overlayCanvasRef}
                className="absolute inset-0 block"
                style={{ cursor: cursorStyle, touchAction: "none" }}
                onMouseMove={handleCanvasHover}
                onMouseLeave={() => {
                  if (!dragRef.current.mode) {
                    setHover(null);
                    setCursorStyle("crosshair");
                  }
                }}
                onMouseDown={handleMouseDown}
              />
            </>
          )}
        </div>

        {/* ── tables ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 divide-y divide-white/10 lg:grid-cols-2 lg:divide-x lg:divide-y-0">
          <DepthTable title="Bids" tone="bid" rows={displayBids} />
          <DepthTable title="Asks" tone="ask" rows={displayAsks} />
        </div>

        {/* ── hover tooltip ──────────────────────────────────────── */}
        {hover && (
          <div
            className="pointer-events-none fixed z-[200] min-w-[230px] rounded-md border border-white/12 bg-card/55 px-3 py-2 text-[11px] shadow-2xl backdrop-blur-2xl"
            style={{
              left:
                hover.clientX + 250 > window.innerWidth
                  ? hover.clientX - 240
                  : hover.clientX + 14,
              top: Math.min(hover.clientY - 10, window.innerHeight - 170),
            }}
          >
            <div className="mb-2 font-mono text-[13px] font-bold text-white">
              {hover.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="flex justify-between gap-6 py-0.5">
              <span className="text-slate-500">Bid Value</span>
              <span className="font-mono text-emerald-400">
                {shortMoney(hover.bid?.usd ?? 0)}
              </span>
            </div>
            <div className="flex justify-between gap-6 py-0.5">
              <span className="text-slate-500">Bid Total</span>
              <span className="font-mono text-emerald-400">
                {shortMoney(hover.bid?.cumUsd ?? 0)}
              </span>
            </div>
            <div className="flex justify-between gap-6 py-0.5">
              <span className="text-slate-500">Ask Value</span>
              <span className="font-mono text-rose-400">
                {shortMoney(hover.ask?.usd ?? 0)}
              </span>
            </div>
            <div className="flex justify-between gap-6 py-0.5">
              <span className="text-slate-500">Ask Total</span>
              <span className="font-mono text-rose-400">
                {shortMoney(hover.ask?.cumUsd ?? 0)}
              </span>
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}