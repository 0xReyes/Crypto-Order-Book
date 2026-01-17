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
	FormatNoSep SymbolFormat = iota
	FormatDash
	FormatUnderscore
	FormatLower
	FormatKraken
)

type ExchangeConfig struct {
	Name         string
	URLTemplate  string
	PathBids     string
	PathAsks     string
	LimitCap     int
	SymbolFormat SymbolFormat
}

var exchangeConfigs = []ExchangeConfig{
	{Name: "Binance", URLTemplate: "https://api.binance.us/api/v3/depth?symbol=%s&limit=%d", PathBids: "bids", PathAsks: "asks", LimitCap: 1000, SymbolFormat: FormatNoSep},
	{Name: "Coinbase", URLTemplate: "https://api.exchange.coinbase.com/products/%s/book?level=2", PathBids: "bids", PathAsks: "asks", LimitCap: 0, SymbolFormat: FormatDash},
	{Name: "Kraken", URLTemplate: "https://api.kraken.com/0/public/Depth?pair=%s&count=%d", PathBids: "result.*.bids", PathAsks: "result.*.asks", LimitCap: 500, SymbolFormat: FormatKraken},
	{Name: "Crypto.com", URLTemplate: "https://api.crypto.com/exchange/v1/public/get-book?instrument_name=%s&depth=%d", PathBids: "result.data.0.bids", PathAsks: "result.data.0.asks", LimitCap: 50, SymbolFormat: FormatUnderscore},
	{Name: "Gemini", URLTemplate: "https://api.gemini.com/v1/book/%s?limit_bids=%d&limit_asks=%d", PathBids: "bids", PathAsks: "asks", LimitCap: 500, SymbolFormat: FormatLower},
	{Name: "KuCoin", URLTemplate: "https://api.kucoin.com/api/v1/market/orderbook/level2_100?symbol=%s", PathBids: "data.bids", PathAsks: "data.asks", LimitCap: 100, SymbolFormat: FormatDash},
	{Name: "OKX", URLTemplate: "https://www.okx.com/api/v5/market/books?instId=%s&sz=%d", PathBids: "data.0.bids", PathAsks: "data.0.asks", LimitCap: 400, SymbolFormat: FormatDash},
	{Name: "Bitstamp", URLTemplate: "https://www.bitstamp.net/api/v2/order_book/%s/", PathBids: "bids", PathAsks: "asks", LimitCap: 0, SymbolFormat: FormatLower},
	{Name: "HTX", URLTemplate: "https://api.huobi.pro/market/depth?symbol=%s&type=step0", PathBids: "tick.bids", PathAsks: "tick.asks", LimitCap: 0, SymbolFormat: FormatLower},
	{Name: "MEXC", URLTemplate: "https://api.mexc.com/api/v3/depth?symbol=%s&limit=%d", PathBids: "bids", PathAsks: "asks", LimitCap: 500, SymbolFormat: FormatNoSep},
	{Name: "Bitget", URLTemplate: "https://api.bitget.com/api/v2/spot/market/orderbook?symbol=%s&limit=%d", PathBids: "data.bids", PathAsks: "data.asks", LimitCap: 200, SymbolFormat: FormatNoSep},
	{Name: "Gate.io", URLTemplate: "https://api.gateio.ws/api/v4/spot/order_book?currency_pair=%s&limit=%d", PathBids: "bids", PathAsks: "asks", LimitCap: 100, SymbolFormat: FormatUnderscore},
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
	// 1. Serve Static Frontend (Dashboard) from the "static" folder
	fs := http.FileServer(http.Dir("./static"))
	http.Handle("/", fs)

	// 2. Serve the API
	http.HandleFunc("/api/v1/book", handleDepth)

	// 3. Start Server (Render provides the PORT env var)
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	fmt.Printf("🚀 Server running on port %s\n", port)
	log.Fatal(http.ListenAndServe("0.0.0.0:"+port, nil))
}

// --- API Logic ---

func handleDepth(w http.ResponseWriter, r *http.Request) {
	// CORS Headers (just in case you access from elsewhere)
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

	// Concurrency
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
	var url string
	if strings.Count(cfg.URLTemplate, "%d") == 2 {
		url = fmt.Sprintf(cfg.URLTemplate, formattedSymbol, effLimit, effLimit)
	} else if strings.Count(cfg.URLTemplate, "%d") == 1 {
		url = fmt.Sprintf(cfg.URLTemplate, formattedSymbol, effLimit)
	} else {
		url = fmt.Sprintf(cfg.URLTemplate, formattedSymbol)
	}

	client := http.Client{Timeout: 5 * time.Second}
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

// --- Helpers (Same as before) ---
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
		if arr, ok := item.([]interface{}); ok && len(arr) >= 2 {
			p = toFloat(arr[0])
			q = toFloat(arr[1])
		}
		if obj, ok := item.(map[string]interface{}); ok {
			p = getFloatFromMap(obj, "price", "p", "px")
			q = getFloatFromMap(obj, "amount", "size", "quantity", "q")
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
