import { useQuery } from "@tanstack/react-query";

// --- Types matching Go API response ---

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

// --- Processed data for components ---

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
  bids: [number, number][]; // [price, qty][] sorted high→low
  asks: [number, number][]; // [price, qty][] sorted low→high
  exchanges: ExchangeResult[];
  median: number;
  outliers: Set<string>;
}

const API_PATH = "https://temporarily-illustrations-announce-same.trycloudflare.com";
const TOLERANCE = 0.2;

// ----------------------------------------------------------------------
// MOCK DATA – used when both live API and data.json are unavailable
// ----------------------------------------------------------------------
function getMockOrderBook(symbol: string): APIResponse {
  const basePrice = symbol === "BTC-USDT" ? 80000 : 2000;
  const bids: OrderPoint[] = [];
  const asks: OrderPoint[] = [];

  // Generate 10 bids: price decreasing, quantity decreasing
  for (let i = 0; i < 10; i++) {
    const price = basePrice - i * 10;
    const qty = Math.floor(Math.random() * 500 + 50) / 10;
    bids.push({ price, qty });
  }
  // Generate 10 asks: price increasing, quantity decreasing
  for (let i = 0; i < 10; i++) {
    const price = basePrice + (i + 1) * 10;
    const qty = Math.floor(Math.random() * 500 + 50) / 10;
    asks.push({ price, qty });
  }

  // Sort bids descending, asks ascending
  bids.sort((a, b) => b.price - a.price);
  asks.sort((a, b) => a.price - b.price);

  const bestBid = bids[0]?.price ?? basePrice;
  const bestAsk = asks[0]?.price ?? basePrice + 20;
  const spread = bestAsk - bestBid;
  const mid = (bestBid + bestAsk) / 2;

  // Create a "MockExchange" entry with full data
  const mockExchange: ExchangeResult = {
    exchange: "MockExchange",
    data: [...bids.map(b => ({ ...b, bidCum: 0 })), ...asks.map(a => ({ ...a, askCum: 0 }))],
    spread: { best_bid: bestBid, best_ask: bestAsk, spread, mid },
    levels: { bids: bids.length, asks: asks.length },
  };

  // Simulate a few other exchanges that are offline or have errors
  const errorExchanges = [
    { exchange: "Binance", error: "Connection refused" },
    { exchange: "Coinbase", error: "Rate limit exceeded" },
    { exchange: "Kraken", error: "Invalid symbol" },
  ].map(ex => ({
    exchange: ex.exchange,
    data: null,
    spread: { best_bid: 0, best_ask: 0, spread: 0, mid: 0 },
    levels: { bids: 0, asks: 0 },
    error: ex.error,
  }));

  const results = [mockExchange, ...errorExchanges];

  return {
    symbol,
    timestamp: Date.now(),
    results,
    _static: true,
  };
}

async function fetchOrderBook(symbol: string): Promise<APIResponse> {
  // 1. Try live API
  try {
    const r = await fetch(
      `${API_PATH}?symbol=${encodeURIComponent(symbol)}&limit=500`
    );
    if (!r.ok) throw new Error("HTTP " + r.status);
    const data = await r.json();
    data._static = false;
    return data;
  } catch {
    // 2. Fallback to static data.json if available
    try {
      const r2 = await fetch("data.json");
      if (!r2.ok) throw new Error("No data.json");
      const data = await r2.json();
      data._static = true;
      return data;
    } catch {
      // 3. Ultimate fallback: built-in mock data
      console.warn("Using built-in mock order book data");
      return getMockOrderBook(symbol);
    }
  }
}

function processBook(raw: APIResponse): ProcessedBook {
  const dataMode = raw._static ? "static" : "api";

  const validResults = raw.results.filter(
    (ex) => !ex.error && ex.spread.mid > 0
  );
  const mids = validResults.map((ex) => ex.spread.mid).sort((a, b) => a - b);
  const median = mids.length ? mids[Math.floor(mids.length / 2)]! : 0;

  const clean = validResults.filter(
    (ex) =>
      median === 0 || Math.abs(ex.spread.mid - median) / median <= TOLERANCE
  );
  const outlierSet = new Set(
    validResults
      .filter(
        (ex) => median > 0 && Math.abs(ex.spread.mid - median) / median > TOLERANCE
      )
      .map((e) => e.exchange)
  );

  const bidMap = new Map<number, number>();
  const askMap = new Map<number, number>();
  let globalBestBid = 0;
  let globalBestAsk = Infinity;

  for (const ex of clean) {
    if (ex.spread.best_bid > globalBestBid)
      globalBestBid = ex.spread.best_bid;
    if (ex.spread.best_ask < globalBestAsk)
      globalBestAsk = ex.spread.best_ask;
    for (const pt of ex.data ?? []) {
      if (pt.bidCum != null) {
        bidMap.set(pt.price, (bidMap.get(pt.price) ?? 0) + pt.qty);
      } else if (pt.askCum != null) {
        askMap.set(pt.price, (askMap.get(pt.price) ?? 0) + pt.qty);
      } else {
        // If no cum field, assume it's a standard bid/ask order
        // We'll treat as both sides? For simplicity, we'll use price to decide
        // But in mock we set both cum fields, so this branch won't be hit.
      }
    }
  }

  // If we have no bids/asks from clean exchanges, fallback to using the mock exchange directly
  if (bidMap.size === 0 && askMap.size === 0) {
    // Use the first exchange that has data (likely MockExchange)
    const mockEx = raw.results.find(ex => ex.data && ex.data.length);
    if (mockEx?.data) {
      for (const pt of mockEx.data) {
        if (pt.bidCum != null) {
          bidMap.set(pt.price, (bidMap.get(pt.price) ?? 0) + pt.qty);
        } else if (pt.askCum != null) {
          askMap.set(pt.price, (askMap.get(pt.price) ?? 0) + pt.qty);
        }
      }
      globalBestBid = mockEx.spread.best_bid;
      globalBestAsk = mockEx.spread.best_ask;
    }
  }

  const bids: [number, number][] = [...bidMap.entries()]
    .sort((a, b) => b[0] - a[0])
    .slice(0, 200);
  const asks: [number, number][] = [...askMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .slice(0, 200);

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