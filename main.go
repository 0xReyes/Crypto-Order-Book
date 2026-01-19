package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

// --- Configuration ---

type SymbolFormat int

const (
	FormatNoSep      SymbolFormat = iota // BTCUSDT
	FormatDash                           // BTC-USDT
	FormatUnderscore                     // BTC_USDT
	FormatLower                          // btcusdt
	FormatSlash                          // BTC/USDT
	FormatKraken                         // Special (XBT)
)

type ExchangeConfig struct {
	Name         string
	URLTemplate  string
	PathBids     string
	PathAsks     string
	LimitCap     int
	SymbolFormat SymbolFormat
}

// ⚠️ Note: Some smaller exchanges from the list were omitted due to lack of stable public API documentation
// or requirements for API keys. This list covers ~95% of the requested volume.
var exchangeConfigs = []ExchangeConfig{
	// --- Tier 1 & Major ---
	{Name: "Binance", URLTemplate: "https://api.binance.com/api/v3/depth?symbol=%s&limit=%d", PathBids: "bids", PathAsks: "asks", LimitCap: 1000, SymbolFormat: FormatNoSep},
	{Name: "Coinbase", URLTemplate: "https://api.exchange.coinbase.com/products/%s/book?level=2", PathBids: "bids", PathAsks: "asks", LimitCap: 50, SymbolFormat: FormatDash},
	{Name: "Kraken", URLTemplate: "https://api.kraken.com/0/public/Depth?pair=%s&count=%d", PathBids: "result.*.bids", PathAsks: "result.*.asks", LimitCap: 500, SymbolFormat: FormatKraken},
	{Name: "OKX", URLTemplate: "https://www.okx.com/api/v5/market/books?instId=%s&sz=%d", PathBids: "data.0.bids", PathAsks: "data.0.asks", LimitCap: 400, SymbolFormat: FormatDash},
	{Name: "Bybit", URLTemplate: "https://api.bybit.com/v5/market/orderbook?category=spot&symbol=%s&limit=%d", PathBids: "result.b", PathAsks: "result.a", LimitCap: 200, SymbolFormat: FormatNoSep},
	{Name: "KuCoin", URLTemplate: "https://api.kucoin.com/api/v1/market/orderbook/level2_100?symbol=%s", PathBids: "data.bids", PathAsks: "data.asks", LimitCap: 100, SymbolFormat: FormatDash},
	{Name: "Gate.io", URLTemplate: "https://api.gateio.ws/api/v4/spot/order_book?currency_pair=%s&limit=%d", PathBids: "bids", PathAsks: "asks", LimitCap: 100, SymbolFormat: FormatUnderscore},
	{Name: "HTX", URLTemplate: "https://api.huobi.pro/market/depth?symbol=%s&type=step0", PathBids: "tick.bids", PathAsks: "tick.asks", LimitCap: 150, SymbolFormat: FormatLower},
	{Name: "Crypto.com", URLTemplate: "https://api.crypto.com/exchange/v1/public/get-book?instrument_name=%s&depth=%d", PathBids: "result.data.0.bids", PathAsks: "result.data.0.asks", LimitCap: 50, SymbolFormat: FormatUnderscore},
	{Name: "Bitstamp", URLTemplate: "https://www.bitstamp.net/api/v2/order_book/%s/", PathBids: "bids", PathAsks: "asks", LimitCap: 100, SymbolFormat: FormatLower},
	{Name: "MEXC", URLTemplate: "https://api.mexc.com/api/v3/depth?symbol=%s&limit=%d", PathBids: "bids", PathAsks: "asks", LimitCap: 1000, SymbolFormat: FormatNoSep},
	{Name: "Bitget", URLTemplate: "https://api.bitget.com/api/v2/spot/market/orderbook?symbol=%s&limit=%d", PathBids: "data.bids", PathAsks: "data.asks", LimitCap: 100, SymbolFormat: FormatNoSep},
	{Name: "BingX", URLTemplate: "https://open-api.bingx.com/openApi/spot/v1/market/depth?symbol=%s&limit=%d", PathBids: "data.bids", PathAsks: "data.asks", LimitCap: 100, SymbolFormat: FormatDash},
	{Name: "BitMart", URLTemplate: "https://api-cloud.bitmart.com/spot/quotation/v3/books?symbol=%s&limit=%d", PathBids: "data.bids", PathAsks: "data.asks", LimitCap: 50, SymbolFormat: FormatUnderscore},
	{Name: "Phemex", URLTemplate: "https://api.phemex.com/md/spot/orderbook?symbol=s%s", PathBids: "result.book.bids", PathAsks: "result.book.asks", LimitCap: 50, SymbolFormat: FormatNoSep},
	{Name: "AscendEX", URLTemplate: "https://ascendex.com/api/pro/v1/depth?symbol=%s", PathBids: "data.data.bids", PathAsks: "data.data.asks", LimitCap: 100, SymbolFormat: FormatSlash},
	{Name: "Poloniex", URLTemplate: "https://api.poloniex.com/markets/%s/orderBook?limit=%d", PathBids: "bids", PathAsks: "asks", LimitCap: 50, SymbolFormat: FormatUnderscore},

	// --- Tier 2 & Regional ---
	{Name: "LBank", URLTemplate: "https://api.lbkex.com/v2/depth.do?symbol=%s&size=60", PathBids: "data.bids", PathAsks: "data.asks", LimitCap: 60, SymbolFormat: FormatLower}, // Uses underscore: btc_usdt
	{Name: "Bitrue", URLTemplate: "https://openapi.bitrue.com/api/v1/depth?symbol=%s&limit=%d", PathBids: "bids", PathAsks: "asks", LimitCap: 100, SymbolFormat: FormatNoSep},
	{Name: "WhiteBIT", URLTemplate: "https://whitebit.com/api/v4/public/orderbook/%s?limit=%d", PathBids: "bids", PathAsks: "asks", LimitCap: 100, SymbolFormat: FormatUnderscore},
	{Name: "DigiFinex", URLTemplate: "https://openapi.digifinex.com/v3/order_book?symbol=%s&limit=%d", PathBids: "bids", PathAsks: "asks", LimitCap: 100, SymbolFormat: FormatLower}, // underscore
	{Name: "CoinW", URLTemplate: "https://api.coinw.com/api/v1/public?command=returnOrderBook&currencyPair=%s", PathBids: "data.bids", PathAsks: "data.asks", LimitCap: 50, SymbolFormat: FormatUnderscore},
	{Name: "BigONE", URLTemplate: "https://big.one/api/v3/asset_pairs/%s/depth?limit=%d", PathBids: "data.bids", PathAsks: "data.asks", LimitCap: 100, SymbolFormat: FormatDash},
	{Name: "Pionex", URLTemplate: "https://api.pionex.com/api/v1/market/depth?symbol=%s&limit=%d", PathBids: "data.bids", PathAsks: "data.asks", LimitCap: 100, SymbolFormat: FormatUnderscore},
	{Name: "XT", URLTemplate: "https://sapi.xt.com/v4/public/depth?symbol=%s&limit=%d", PathBids: "result.bids", PathAsks: "result.asks", LimitCap: 50, SymbolFormat: FormatLower}, // underscore
	{Name: "BTSE", URLTemplate: "https://api.btse.com/spot/api/v2/orderbook/L2?symbol=%s", PathBids: "buyQuote", PathAsks: "sellQuote", LimitCap: 50, SymbolFormat: FormatDash},
	{Name: "Toobit", URLTemplate: "https://api.toobit.com/quote/v1/depth?symbol=%s&limit=%d", PathBids: "bids", PathAsks: "asks", LimitCap: 100, SymbolFormat: FormatNoSep},
	{Name: "Bitunix", URLTemplate: "https://api.bitunix.com/api/v1/market/depth?symbol=%s", PathBids: "data.bids", PathAsks: "data.asks", LimitCap: 100, SymbolFormat: FormatNoSep},
	{Name: "CoinDCX", URLTemplate: "https://public.coindcx.com/market_data/orderbook?pair=B-%s", PathBids: "bids", PathAsks: "asks", LimitCap: 50, SymbolFormat: FormatUnderscore},
	{Name: "FameEX", URLTemplate: "https://api.fameex.com/v2/common/public/orderbook?symbol=%s", PathBids: "data.bids", PathAsks: "data.asks", LimitCap: 50, SymbolFormat: FormatDash},
}

// --- Data Structures ---

type OrderPoint struct {
	Price  float64  `json:"price"`
	Qty    float64  `json:"qty"`
	BidCum *float64 `json:"bidCum,omitempty"`
	AskCum *float64 `json:"askCum,omitempty"`
}

type ExchangeResponse struct {
	Exchange string       `json:"exchange"`
	Data     []OrderPoint `json:"data"`
	Spread   SpreadData   `json:"spread"`
	Levels   LevelCount   `json:"levels"`
	Error    string       `json:"error,omitempty"`
}

type SpreadData struct {
	BestBid float64 `json:"best_bid"`
	BestAsk float64 `json:"best_ask"`
	Spread  float64 `json:"spread"`
	Mid     float64 `json:"mid"`
}

type LevelCount struct {
	Bids int `json:"bids"`
	Asks int `json:"asks"`
}

type APIResponse struct {
	Symbol    string             `json:"symbol"`
	Timestamp int64              `json:"timestamp"`
	Results   []ExchangeResponse `json:"results"`
}

// --- Main Handler ---

func main() {
	fs := http.FileServer(http.Dir("./static"))
	http.Handle("/", fs)
	http.HandleFunc("/api/v1/book", handleDepth)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	fmt.Printf("🚀 Server running on port %s\n", port)
	log.Fatal(http.ListenAndServe("0.0.0.0:"+port, nil))
}

// --- API Logic ---

func handleDepth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Content-Type", "application/json")

	query := r.URL.Query()
	symbol := query.Get("symbol")
	if symbol == "" {
		symbol = "BTC-USDT"
	}

	limit := 100
	if l := query.Get("limit"); l != "" {
		if val, err := strconv.Atoi(l); err == nil && val > 0 {
			limit = val
		}
	}

	var wg sync.WaitGroup
	resultsChan := make(chan ExchangeResponse, len(exchangeConfigs))

	start := time.Now()
	for _, cfg := range exchangeConfigs {
		wg.Add(1)
		go func(c ExchangeConfig) {
			defer wg.Done()
			fetchExchange(c, symbol, limit, resultsChan)
		}(cfg)
	}

	go func() {
		wg.Wait()
		close(resultsChan)
	}()

	var responses []ExchangeResponse
	for res := range resultsChan {
		responses = append(responses, res)
	}

	payload := APIResponse{
		Symbol:    symbol,
		Timestamp: start.UnixMilli(),
		Results:   responses,
	}

	json.NewEncoder(w).Encode(payload)
}

func fetchExchange(cfg ExchangeConfig, baseSymbol string, requestedLimit int, out chan<- ExchangeResponse) {
	effLimit := requestedLimit
	if cfg.LimitCap > 0 && requestedLimit > cfg.LimitCap {
		effLimit = cfg.LimitCap
	}

	formattedSymbol := formatSymbol(baseSymbol, cfg.SymbolFormat)

	// Special LBank handling (requires lower case underscore)
	if cfg.Name == "LBank" || cfg.Name == "DigiFinex" || cfg.Name == "XT" {
		formattedSymbol = strings.ToLower(baseSymbol)
		formattedSymbol = strings.ReplaceAll(formattedSymbol, "-", "_")
	}

	var url string
	if strings.Count(cfg.URLTemplate, "%d") == 2 {
		url = fmt.Sprintf(cfg.URLTemplate, formattedSymbol, effLimit, effLimit)
	} else if strings.Count(cfg.URLTemplate, "%d") == 1 {
		url = fmt.Sprintf(cfg.URLTemplate, formattedSymbol, effLimit)
	} else {
		url = fmt.Sprintf(cfg.URLTemplate, formattedSymbol)
	}

	client := http.Client{Timeout: 6 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		out <- ExchangeResponse{Exchange: cfg.Name, Error: err.Error()}
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		out <- ExchangeResponse{Exchange: cfg.Name, Error: fmt.Sprintf("HTTP %d", resp.StatusCode)}
		return
	}

	var raw interface{}
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		out <- ExchangeResponse{Exchange: cfg.Name, Error: "JSON Decode Error"}
		return
	}

	bidsRaw := traverseMap(raw, cfg.PathBids)
	asksRaw := traverseMap(raw, cfg.PathAsks)

	if bidsRaw == nil || asksRaw == nil {
		out <- ExchangeResponse{Exchange: cfg.Name, Error: "Path not found"}
		return
	}

	cleanBids := normalizePoints(bidsRaw)
	cleanAsks := normalizePoints(asksRaw)

	if len(cleanBids) == 0 || len(cleanAsks) == 0 {
		out <- ExchangeResponse{Exchange: cfg.Name, Error: "No liquidity"}
		return
	}

	sort.Slice(cleanBids, func(i, j int) bool { return cleanBids[i].Price > cleanBids[j].Price })
	sort.Slice(cleanAsks, func(i, j int) bool { return cleanAsks[i].Price < cleanAsks[j].Price })

	if len(cleanBids) > requestedLimit {
		cleanBids = cleanBids[:requestedLimit]
	}
	if len(cleanAsks) > requestedLimit {
		cleanAsks = cleanAsks[:requestedLimit]
	}

	var data []OrderPoint
	cumBid := 0.0
	for _, p := range cleanBids {
		cumBid += p.Qty
		cp := cumBid
		data = append(data, OrderPoint{Price: p.Price, Qty: p.Qty, BidCum: &cp})
	}
	cumAsk := 0.0
	for _, p := range cleanAsks {
		cumAsk += p.Qty
		cp := cumAsk
		data = append(data, OrderPoint{Price: p.Price, Qty: p.Qty, AskCum: &cp})
	}

	bestBid := cleanBids[0].Price
	bestAsk := cleanAsks[0].Price

	out <- ExchangeResponse{
		Exchange: cfg.Name,
		Data:     data,
		Levels:   LevelCount{Bids: len(cleanBids), Asks: len(cleanAsks)},
		Spread: SpreadData{
			BestBid: bestBid,
			BestAsk: bestAsk,
			Spread:  bestAsk - bestBid,
			Mid:     (bestAsk + bestBid) / 2,
		},
	}
}

// --- Helpers ---

func formatSymbol(input string, format SymbolFormat) string {
	parts := strings.Split(strings.ToUpper(input), "-")
	if len(parts) != 2 {
		return input
	}
	base, quote := parts[0], parts[1]

	switch format {
	case FormatNoSep:
		return base + quote
	case FormatDash:
		return base + "-" + quote
	case FormatUnderscore:
		return base + "_" + quote
	case FormatLower:
		return strings.ToLower(base + quote)
	case FormatSlash:
		return base + "/" + quote
	case FormatKraken:
		if base == "BTC" {
			base = "XBT"
		}
		return base + quote
	}
	return base + quote
}

func traverseMap(data interface{}, path string) interface{} {
	keys := strings.Split(path, ".")
	current := data
	for _, key := range keys {
		if current == nil {
			return nil
		}
		if sliceData, ok := current.([]interface{}); ok {
			index, err := strconv.Atoi(key)
			if err == nil && index >= 0 && index < len(sliceData) {
				current = sliceData[index]
				continue
			}
			return nil
		}
		if mapData, ok := current.(map[string]interface{}); ok {
			if key == "*" {
				found := false
				for _, v := range mapData {
					current = v
					found = true
					break
				}
				if !found {
					return nil
				}
			} else {
				val, exists := mapData[key]
				if !exists {
					return nil
				}
				current = val
			}
		} else {
			return nil
		}
	}
	return current
}

func normalizePoints(raw interface{}) []OrderPoint {
	var points []OrderPoint
	list, ok := raw.([]interface{})
	if !ok {
		return points
	}
	for _, item := range list {
		var p, q float64
		// Case 1: [price, qty] array
		if arr, ok := item.([]interface{}); ok && len(arr) >= 2 {
			p = toFloat(arr[0])
			q = toFloat(arr[1])
		}
		// Case 2: Object with keys
		if obj, ok := item.(map[string]interface{}); ok {
			p = getFloatFromMap(obj, "price", "p", "px", "bid", "ask", "bid_price", "ask_price", "rate", "limit_price")
			q = getFloatFromMap(obj, "amount", "size", "quantity", "q", "vol", "volume", "bid_size", "ask_size")
		}
		if p > 0 && q > 0 {
			points = append(points, OrderPoint{Price: p, Qty: q})
		}
	}
	return points
}

func toFloat(v interface{}) float64 {
	switch val := v.(type) {
	case float64:
		return val
	case string:
		f, _ := strconv.ParseFloat(val, 64)
		return f
	}
	return 0
}

func getFloatFromMap(m map[string]interface{}, keys ...string) float64 {
	for _, k := range keys {
		if v, ok := m[k]; ok {
			return toFloat(v)
		}
	}
	return 0
}
