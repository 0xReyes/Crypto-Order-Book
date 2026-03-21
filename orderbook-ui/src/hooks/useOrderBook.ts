import { useQuery } from "@tanstack/react-query";

export interface OrderPoint {
  price: number;
  qty: number;
  bidCum?: number;
  askCum?: number;
}

export interface SpreadData {
  best_bid: number;
  best_ask: number;
  spread: number;
  mid: number;
}

export interface LevelCount {
  bids: number;
  asks: number;
}

export interface ExchangeResult {
  exchange: string;
  data: OrderPoint[] | null;
  spread: SpreadData;
  levels: LevelCount;
  error?: string;
}

export interface APIResponse {
  symbol: string;
  timestamp: number;
  results: ExchangeResult[];
  _static?: boolean;
}

export interface ProcessedBook {
  symbol: string;
  timestamp: number;
  dataMode: "api" | "static";
  midPrice: number;
  bestBid: number;
  bestAsk: number;
  spread: number;
  isCrossed: boolean;
  okCount: number;
  totalCount: number;
  bids: [number, number][];
  asks: [number, number][];
  exchanges: ExchangeResult[];
  median: number;
  outliers: Set<string>;
}

const API_PATH = "/api/v1/book";
const TOLERANCE = 0.2;

async function fetchOrderBook(symbol: string): Promise<APIResponse> {
  // 1. Try live API
  try {
    const r = await fetch(`${API_PATH}?symbol=${encodeURIComponent(symbol)}&limit=500`);
    if (!r.ok) throw new Error("HTTP " + r.status);
    const data = await r.json();
    data._static = false;
    return data;
  } catch {
    // 2. Fallback to static data.json
    const r2 = await fetch("data.json");
    if (!r2.ok) throw new Error("No data available");
    const data = await r2.json();
    data._static = true;
    return data;
  }
}

function processBook(raw: APIResponse): ProcessedBook {
  const dataMode = raw._static ? "static" : "api";

  const validResults = raw.results.filter((ex) => !ex.error && ex.spread.mid > 0);
  const mids = validResults.map((ex) => ex.spread.mid).sort((a, b) => a - b);
  const median = mids.length ? mids[Math.floor(mids.length / 2)]! : 0;

  const clean = validResults.filter(
    (ex) => median === 0 || Math.abs(ex.spread.mid - median) / median <= TOLERANCE
  );
  const outlierSet = new Set(
    validResults
      .filter((ex) => median > 0 && Math.abs(ex.spread.mid - median) / median > TOLERANCE)
      .map((e) => e.exchange)
  );

  const bidMap = new Map<number, number>();
  const askMap = new Map<number, number>();
  let globalBestBid = 0;
  let globalBestAsk = Infinity;

  for (const ex of clean) {
    if (ex.spread.best_bid > globalBestBid) globalBestBid = ex.spread.best_bid;
    if (ex.spread.best_ask < globalBestAsk) globalBestAsk = ex.spread.best_ask;
    for (const pt of ex.data ?? []) {
      if (pt.bidCum != null) {
        bidMap.set(pt.price, (bidMap.get(pt.price) ?? 0) + pt.qty);
      } else if (pt.askCum != null) {
        askMap.set(pt.price, (askMap.get(pt.price) ?? 0) + pt.qty);
      }
    }
  }

  const bids: [number, number][] = [...bidMap.entries()].sort((a, b) => b[0] - a[0]).slice(0, 200);
  const asks: [number, number][] = [...askMap.entries()].sort((a, b) => a[0] - b[0]).slice(0, 200);

  const isCrossed = globalBestBid > globalBestAsk && globalBestAsk < Infinity;
  const mid = isCrossed ? median : (globalBestBid + globalBestAsk) / 2;
  const spread = globalBestAsk < Infinity ? globalBestAsk - globalBestBid : 0;

  return {
    symbol: raw.symbol,
    timestamp: raw.timestamp,
    dataMode,
    midPrice: mid,
    bestBid: globalBestBid,
    bestAsk: globalBestAsk,
    spread,
    isCrossed,
    okCount: clean.length,
    totalCount: raw.results.length,
    bids,
    asks,
    exchanges: raw.results,
    median,
    outliers: outlierSet,
  };
}

export function useOrderBook(symbol = "BTC") {
  return useOrderBookWithRefresh(symbol, 60_000);
}

export function useOrderBookWithRefresh(symbol = "BTC", refreshMs: number | false = 60_000) {
  return useQuery({
    queryKey: ["orderbook", symbol],
    queryFn: () => fetchOrderBook(symbol),
    select: processBook,
    staleTime: 30_000,
    refetchInterval: refreshMs,
  });
}