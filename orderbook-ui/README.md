# Orderbook Aggregator — React Frontend

React + TypeScript + Vite + shadcn/ui frontend for the Go order book aggregator.

## Setup

```bash
bun install   # or npm install
bun dev       # starts on :8080, proxies /api to Go server on :8081
```

## Architecture

- `useOrderBook` hook fetches from `/api/v1/book` (live) or `data.json` (static fallback)
- `DepthChart` renders aggregated depth using canvas
- `OrderBook` shows bid/ask tables
- `MarketHeader` shows live stats
- `PriceChart` shows mock price history (swap for real candles later)
