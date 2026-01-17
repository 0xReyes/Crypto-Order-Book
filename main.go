package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

// --- Configuration & Enums ---

type SymbolFormat int

const (
	FormatNoSep      SymbolFormat = iota // BTCUSDT
	FormatDash                           // BTC-USDT
	FormatUnderscore                     // BTC_USDT
	FormatLower                          // btcusdt
	FormatKraken                         // Special handling for Kraken (XBT)
)

type ExchangeConfig struct {
	Name         string
	URLTemplate  string
	PathBids     string
	PathAsks     string
	LimitCap     int
	SymbolFormat SymbolFormat
}

// Global registry of exchanges
var exchangeConfigs = []ExchangeConfig{
	{
		Name:         "Binance",
		URLTemplate:  "https://api.binance.us/api/v3/depth?symbol=%s&limit=%d",
		PathBids:     "bids",
		PathAsks:     "asks",
		LimitCap:     1000,
		SymbolFormat: FormatNoSep,
	},
	{
		Name:         "Coinbase",
		URLTemplate:  "https://api.exchange.coinbase.com/products/%s/book?level=2",
		PathBids:     "bids",
		PathAsks:     "asks",
		LimitCap:     0,
		SymbolFormat: FormatDash,
	},
	{
		Name:         "Kraken",
		URLTemplate:  "https://api.kraken.com/0/public/Depth?pair=%s&count=%d",
		PathBids:     "result.*.bids",
		PathAsks:     "result.*.asks",
		LimitCap:     500,
		SymbolFormat: FormatKraken,
	},
	{
		Name:         "Crypto.com",
		URLTemplate:  "https://api.crypto.com/exchange/v1/public/get-book?instrument_name=%s&depth=%d",
		PathBids:     "result.data.0.bids",
		PathAsks:     "result.data.0.asks",
		LimitCap:     50,
		SymbolFormat: FormatUnderscore,
	},
	{
		Name:         "Gemini",
		URLTemplate:  "https://api.gemini.com/v1/book/%s?limit_bids=%d&limit_asks=%d",
		PathBids:     "bids",
		PathAsks:     "asks",
		LimitCap:     500,
		SymbolFormat: FormatLower,
	},
	{
		Name:         "KuCoin",
		URLTemplate:  "https://api.kucoin.com/api/v1/market/orderbook/level2_100?symbol=%s",
		PathBids:     "data.bids",
		PathAsks:     "data.asks",
		LimitCap:     100,
		SymbolFormat: FormatDash,
	},
	{
		Name:         "OKX",
		URLTemplate:  "https://www.okx.com/api/v5/market/books?instId=%s&sz=%d",
		PathBids:     "data.0.bids",
		PathAsks:     "data.0.asks",
		LimitCap:     400,
		SymbolFormat: FormatDash,
	},
	{
		Name:         "Bitstamp",
		URLTemplate:  "https://www.bitstamp.net/api/v2/order_book/%s/",
		PathBids:     "bids",
		PathAsks:     "asks",
		LimitCap:     0,
		SymbolFormat: FormatLower,
	},
	{
		Name:         "HTX",
		URLTemplate:  "https://api.huobi.pro/market/depth?symbol=%s&type=step0",
		PathBids:     "tick.bids",
		PathAsks:     "tick.asks",
		LimitCap:     0,
		SymbolFormat: FormatLower,
	},
	{
		Name:         "MEXC",
		URLTemplate:  "https://api.mexc.com/api/v3/depth?symbol=%s&limit=%d",
		PathBids:     "bids",
		PathAsks:     "asks",
		LimitCap:     500,
		SymbolFormat: FormatNoSep,
	},
	{
		Name:         "Bitget",
		URLTemplate:  "https://api.bitget.com/api/v2/spot/market/orderbook?symbol=%s&limit=%d",
		PathBids:     "data.bids",
		PathAsks:     "data.asks",
		LimitCap:     200,
		SymbolFormat: FormatNoSep,
	},
	{
		Name:         "Gate.io",
		URLTemplate:  "https://api.gateio.ws/api/v4/spot/order_book?currency_pair=%s&limit=%d",
		PathBids:     "bids",
		PathAsks:     "asks",
		LimitCap:     100,
		SymbolFormat: FormatUnderscore,
	},
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

// --- Logic ---

func main() {
	// CLI Flags
	outputDir := flag.String("dir", "docs", "Directory to save output file")
	filename := flag.String("file", "data.json", "Filename for output")
	symbol := flag.String("symbol", "BTC-USDT", "Trading pair to fetch")
	limit := flag.Int("limit", 100, "Depth limit per exchange")
	flag.Parse()

	fmt.Printf("Fetching order books for %s (Limit: %d)...\n", *symbol, *limit)

	// 1. Concurrency Setup
	var wg sync.WaitGroup
	resultsChan := make(chan ExchangeResponse, len(exchangeConfigs))

	// 2. Launch Workers
	start := time.Now()
	for _, cfg := range exchangeConfigs {
		wg.Add(1)
		go func(c ExchangeConfig) {
			defer wg.Done()
			fetchExchange(c, *symbol, *limit, resultsChan)
		}(cfg)
	}

	// 3. Wait and Close
	go func() {
		wg.Wait()
		close(resultsChan)
	}()

	// 4. Aggregate Results
	var responses []ExchangeResponse
	successCount := 0
	for res := range resultsChan {
		if res.Error == "" {
			successCount++
		}
		responses = append(responses, res)
	}

	// 5. Construct Payload
	payload := APIResponse{
		Symbol:    *symbol,
		Timestamp: start.UnixMilli(),
		Results:   responses,
	}

	// 6. Write to File
	jsonData, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		log.Fatalf("Error marshaling JSON: %v", err)
	}

	// Ensure directory exists
	if _, err := os.Stat(*outputDir); os.IsNotExist(err) {
		err := os.MkdirAll(*outputDir, 0755)
		if err != nil {
			log.Fatalf("Error creating directory: %v", err)
		}
	}

	fullPath := filepath.Join(*outputDir, *filename)
	err = os.WriteFile(fullPath, jsonData, 0644)
	if err != nil {
		log.Fatalf("Error writing file: %v", err)
	}

	fmt.Printf("✅ Success! %d/%d exchanges fetched.\n", successCount, len(exchangeConfigs))
	fmt.Printf("📄 Data saved to: %s\n", fullPath)
}

func fetchExchange(cfg ExchangeConfig, baseSymbol string, requestedLimit int, out chan<- ExchangeResponse) {
	// Calculate effective limit based on exchange caps
	effLimit := requestedLimit
	if cfg.LimitCap > 0 && requestedLimit > cfg.LimitCap {
		effLimit = cfg.LimitCap
	}

	// Format URL
	formattedSymbol := formatSymbol(baseSymbol, cfg.SymbolFormat)
	var url string
	if strings.Count(cfg.URLTemplate, "%d") == 2 {
		url = fmt.Sprintf(cfg.URLTemplate, formattedSymbol, effLimit, effLimit)
	} else if strings.Count(cfg.URLTemplate, "%d") == 1 {
		url = fmt.Sprintf(cfg.URLTemplate, formattedSymbol, effLimit)
	} else {
		url = fmt.Sprintf(cfg.URLTemplate, formattedSymbol)
	}

	// HTTP Request
	client := http.Client{Timeout: 8 * time.Second}
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		out <- ExchangeResponse{Exchange: cfg.Name, Error: err.Error()}
		return
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "crypto-order-book-generator/1.0")

	resp, err := client.Do(req)
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
