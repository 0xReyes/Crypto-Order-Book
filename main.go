package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"io"
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

// --- Configuration ---

type SymbolFormat int

const (
	FormatNoSep           SymbolFormat = iota // BTCUSDT
	FormatDash                                // BTC-USDT
	FormatUnderscore                          // BTC_USDT
	FormatLower                               // btcusdt
	FormatLowerDash                           // btc-usdt
	FormatLowerUnderscore                     // btc_usdt
	FormatSlash                               // BTC/USDT
	FormatKraken                              // XBT mapping
	FormatBitfinex                            // tBTCUST
)

var defaultQuotes = []string{"USDT", "USDC", "USD"}

type ExchangeConfig struct {
	Name         string
	URLTemplate  string
	PathBids     string
	PathAsks     string
	SymbolFormat SymbolFormat
	FlatArray    bool
	QuoteMap     map[string]string
	Quotes       []string
}

var exchangeConfigs = []ExchangeConfig{
	{Name: "Binance", URLTemplate: "https://data-api.binance.vision/api/v3/depth?symbol=%s&limit=50", PathBids: "bids", PathAsks: "asks", SymbolFormat: FormatNoSep},
	{Name: "Coinbase", URLTemplate: "https://api.exchange.coinbase.com/products/%s/book?level=2", PathBids: "bids", PathAsks: "asks", SymbolFormat: FormatDash},
	{Name: "Kraken", URLTemplate: "https://api.kraken.com/0/public/Depth?pair=%s&count=50", PathBids: "result.*.bids", PathAsks: "result.*.asks", SymbolFormat: FormatKraken},
	{Name: "OKX", URLTemplate: "https://www.okx.com/api/v5/market/books?instId=%s&sz=50", PathBids: "data.0.bids", PathAsks: "data.0.asks", SymbolFormat: FormatDash},
	{Name: "KuCoin", URLTemplate: "https://api.kucoin.com/api/v1/market/orderbook/level2_100?symbol=%s", PathBids: "data.bids", PathAsks: "data.asks", SymbolFormat: FormatDash},
	{Name: "Bitfinex", URLTemplate: "https://api-pub.bitfinex.com/v2/book/%s/P0?len=25", PathBids: "_bitfinex", PathAsks: "_bitfinex", SymbolFormat: FormatBitfinex, QuoteMap: map[string]string{"USDT": "UST"}},
	{Name: "Gemini", URLTemplate: "https://api.gemini.com/v1/book/%s?limit_bids=50&limit_asks=50", PathBids: "bids", PathAsks: "asks", SymbolFormat: FormatLower, QuoteMap: map[string]string{"USDT": "USD"}},
	{Name: "Gate.io", URLTemplate: "https://api.gateio.ws/api/v4/spot/order_book?currency_pair=%s&limit=50", PathBids: "bids", PathAsks: "asks", SymbolFormat: FormatUnderscore},
	{Name: "HTX", URLTemplate: "https://api.huobi.pro/market/depth?symbol=%s&type=step0", PathBids: "tick.bids", PathAsks: "tick.asks", SymbolFormat: FormatLower},
	{Name: "Crypto.com", URLTemplate: "https://api.crypto.com/exchange/v1/public/get-book?instrument_name=%s&depth=50", PathBids: "result.data.0.bids", PathAsks: "result.data.0.asks", SymbolFormat: FormatUnderscore},
	{Name: "Bitstamp", URLTemplate: "https://www.bitstamp.net/api/v2/order_book/%s/", PathBids: "bids", PathAsks: "asks", SymbolFormat: FormatLower},
	{Name: "MEXC", URLTemplate: "https://api.mexc.com/api/v3/depth?symbol=%s&limit=50", PathBids: "bids", PathAsks: "asks", SymbolFormat: FormatNoSep},
	{Name: "Bitget", URLTemplate: "https://api.bitget.com/api/v2/spot/market/orderbook?symbol=%s&limit=50", PathBids: "data.bids", PathAsks: "data.asks", SymbolFormat: FormatNoSep},
	{Name: "BingX", URLTemplate: "https://open-api.bingx.com/openApi/spot/v1/market/depth?symbol=%s&limit=50", PathBids: "data.bids", PathAsks: "data.asks", SymbolFormat: FormatDash},
	{Name: "BitMart", URLTemplate: "https://api-cloud.bitmart.com/spot/quotation/v3/books?symbol=%s&limit=50", PathBids: "data.bids", PathAsks: "data.asks", SymbolFormat: FormatUnderscore},
	{Name: "Phemex", URLTemplate: "https://api.phemex.com/md/spot/orderbook?symbol=s%s", PathBids: "result.book.bids", PathAsks: "result.book.asks", SymbolFormat: FormatNoSep},
	{Name: "AscendEX", URLTemplate: "https://ascendex.com/api/pro/v1/depth?symbol=%s", PathBids: "data.data.bids", PathAsks: "data.data.asks", SymbolFormat: FormatSlash},
	{Name: "Poloniex", URLTemplate: "https://api.poloniex.com/markets/%s/orderBook?limit=50", PathBids: "bids", PathAsks: "asks", SymbolFormat: FormatUnderscore, FlatArray: true},
	{Name: "LBank", URLTemplate: "https://api.lbkex.com/v2/depth.do?symbol=%s&size=60", PathBids: "data.bids", PathAsks: "data.asks", SymbolFormat: FormatLowerUnderscore},
	{Name: "Bitrue", URLTemplate: "https://openapi.bitrue.com/api/v1/depth?symbol=%s&limit=50", PathBids: "bids", PathAsks: "asks", SymbolFormat: FormatNoSep},
	{Name: "WhiteBIT", URLTemplate: "https://whitebit.com/api/v4/public/orderbook/%s?limit=50", PathBids: "bids", PathAsks: "asks", SymbolFormat: FormatUnderscore},
	{Name: "DigiFinex", URLTemplate: "https://openapi.digifinex.com/v3/order_book?symbol=%s&limit=50", PathBids: "bids", PathAsks: "asks", SymbolFormat: FormatLowerUnderscore},
	{Name: "CoinW", URLTemplate: "https://api.coinw.com/api/v1/public?command=returnOrderBook&currencyPair=%s", PathBids: "data.bids", PathAsks: "data.asks", SymbolFormat: FormatUnderscore},
	{Name: "BigONE", URLTemplate: "https://big.one/api/v3/asset_pairs/%s/depth?limit=50", PathBids: "data.bids", PathAsks: "data.asks", SymbolFormat: FormatDash},
	{Name: "Pionex", URLTemplate: "https://api.pionex.com/api/v1/market/depth?symbol=%s&limit=50", PathBids: "data.bids", PathAsks: "data.asks", SymbolFormat: FormatUnderscore},
	{Name: "XT", URLTemplate: "https://sapi.xt.com/v4/public/depth?symbol=%s&limit=50", PathBids: "result.bids", PathAsks: "result.asks", SymbolFormat: FormatLowerUnderscore},
	{Name: "Toobit", URLTemplate: "https://api.toobit.com/quote/v1/depth?symbol=%s&limit=50", PathBids: "b", PathAsks: "a", SymbolFormat: FormatNoSep},
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
	Pair     string       `json:"pair"`
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

func main() {
	dirFlag := flag.String("dir", "", "Output directory for snapshot mode")
	fileFlag := flag.String("file", "data.json", "Output filename within --dir")
	symbolFlag := flag.String("symbol", "BTC", "Base asset symbol (e.g. BTC, ETH)")
	portFlag := flag.String("port", "", "HTTP server port (overrides PORT env)")
	flag.Parse()

	if *dirFlag != "" {
		runSnapshot(*dirFlag, *fileFlag, *symbolFlag)
		return
	}

	port := *portFlag
	if port == "" {
		port = os.Getenv("PORT")
	}
	if port == "" {
		port = "8080"
	}
	runServer(port)
}

// --- Server Mode ---

func runServer(port string) {
	// Rate limiter: 10 requests/sec sustained, burst of 30
	rl := NewRateLimiter(10, 30)

	// --- Static files (no auth, rate-limited) ---
	fsHandler := http.FileServer(http.Dir("./static"))
	http.Handle("/", fsHandler)

	// --- Public routes (rate-limited, no auth) ---
	http.HandleFunc("/api/v1/health", RateLimitMiddleware(rl, handleHealth))

	// --- Login: issues JWT tokens (rate-limited, no auth) ---
	http.HandleFunc("/api/v1/login", RateLimitMiddleware(rl, handleLogin))

	// --- Protected API routes (rate-limited + JWT auth) ---
	http.HandleFunc("/api/v1/book", ProtectedRoute(rl, handleDepth))
	http.HandleFunc("/api/v1/price", ProtectedRoute(rl, handlePrice))
	http.HandleFunc("/api/v1/dominance", ProtectedRoute(rl, handleDominance))

	fmt.Printf("🚀 Server running on port %s\n", port)
	fmt.Printf("   Rate limit: 10 req/s per IP, burst 30\n")
	fmt.Printf("   Auth: Bearer JWT on /api/v1/{book,price,dominance}\n")
	fmt.Printf("   Login: POST /api/v1/login {\"user\":\"...\",\"pass\":\"...\"}\n")
	log.Fatal(http.ListenAndServe("0.0.0.0:"+port, nil))
}

// --- Auth handlers ---

func handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func handleLogin(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	// Read credentials from JSON body or query params
	user := ""
	pass := ""

	if r.Method == http.MethodPost {
		var body struct {
			User string `json:"user"`
			Pass string `json:"pass"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err == nil {
			user = body.User
			pass = body.Pass
		}
	} else {
		user = r.URL.Query().Get("user")
		pass = r.URL.Query().Get("pass")
	}

	// -------------------------------------------------------
	// Credential check — replace with your own logic
	// Default: read from env vars API_USER / API_PASS
	// Falls back to demo/demo for local dev
	// -------------------------------------------------------
	wantUser := os.Getenv("API_USER")
	if wantUser == "" {
		wantUser = "demo"
	}
	wantPass := os.Getenv("API_PASS")
	if wantPass == "" {
		wantPass = "demo"
	}

	if user != wantUser || pass != wantPass {
		http.Error(w, `{"error":"Invalid credentials"}`, http.StatusUnauthorized)
		return
	}

	// Issue a 24-hour token
	token, err := GenerateToken(user, 24*time.Hour)
	if err != nil {
		http.Error(w, `{"error":"Failed to generate token"}`, http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(map[string]string{
		"token":      token,
		"expires_in": "86400",
		"type":       "Bearer",
	})
}

// --- Data handlers ---

func handlePrice(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Content-Type", "application/json")

	symbol := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("symbol")))
	if symbol == "" {
		symbol = "bitcoin"
	}
	days := r.URL.Query().Get("days")
	if days == "" {
		days = "7"
	}

	url := fmt.Sprintf("https://api.coingecko.com/api/v3/coins/%s/market_chart?vs_currency=usd&days=%s", symbol, days)
	proxyGet(w, url)
}

func handleDominance(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Content-Type", "application/json")

	url := "https://api.coingecko.com/api/v3/global"
	proxyGet(w, url)
}

func proxyGet(w http.ResponseWriter, url string) {
	client := http.Client{Timeout: 10 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, 502)
		return
	}
	defer resp.Body.Close()
	w.WriteHeader(resp.StatusCode)
	io.Copy(w, resp.Body)
}

func handleDepth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Content-Type", "application/json")

	query := r.URL.Query()
	base := strings.ToUpper(strings.TrimSpace(query.Get("symbol")))
	if base == "" {
		base = "BTC"
	}
	if i := strings.IndexAny(base, "-_/"); i > 0 {
		base = base[:i]
	}

	payload := fetchAll(base)
	json.NewEncoder(w).Encode(payload)
}

// --- CLI Snapshot Mode ---

func runSnapshot(dir, file, base string) {
	if err := os.MkdirAll(dir, 0755); err != nil {
		log.Fatalf("❌ Failed to create output dir %q: %v", dir, err)
	}

	base = strings.ToUpper(strings.TrimSpace(base))
	if i := strings.IndexAny(base, "-_/"); i > 0 {
		base = base[:i]
	}

	fmt.Printf("📸 Fetching order books for %s across all quote currencies\n", base)
	payload := fetchAll(base)

	outPath := filepath.Join(dir, file)
	f, err := os.Create(outPath)
	if err != nil {
		log.Fatalf("❌ Failed to create output file %q: %v", outPath, err)
	}
	defer f.Close()

	enc := json.NewEncoder(f)
	enc.SetIndent("", "  ")
	if err := enc.Encode(payload); err != nil {
		log.Fatalf("❌ Failed to write JSON: %v", err)
	}

	ok := 0
	for _, r := range payload.Results {
		if r.Error == "" {
			ok++
		}
	}
	fmt.Printf("✅ Wrote %s  (%d exchanges with data)\n", outPath, ok)
}

// --- Shared Fetch Logic ---

func fetchAll(base string) APIResponse {
	start := time.Now()

	type result struct {
		resp  ExchangeResponse
		quote string
		rank  int
	}

	var wg sync.WaitGroup
	resultsChan := make(chan result, len(exchangeConfigs)*len(defaultQuotes))

	for _, cfg := range exchangeConfigs {
		quotes := defaultQuotes
		if len(cfg.Quotes) > 0 {
			quotes = cfg.Quotes
		}

		for rank, quote := range quotes {
			wg.Add(1)
			go func(c ExchangeConfig, q string, r int) {
				defer wg.Done()
				pair := base + "-" + q
				t0 := time.Now()
				fmt.Printf("→ [%s] trying %s\n", c.Name, pair)
				resp := fetchOne(c, base, q)
				elapsed := time.Since(t0)
				if resp.Error != "" {
					fmt.Printf("  ✗ [%s] %s failed (%s): %s\n", c.Name, pair, elapsed.Round(time.Millisecond), resp.Error)
				} else {
					fmt.Printf("  ✓ [%s] %s OK (%s) — %d bids, %d asks, spread=%.2f\n",
						c.Name, pair, elapsed.Round(time.Millisecond), resp.Levels.Bids, resp.Levels.Asks, resp.Spread.Spread)
				}
				resultsChan <- result{resp: resp, quote: q, rank: r}
			}(cfg, quote, rank)
		}
	}

	go func() {
		wg.Wait()
		close(resultsChan)
	}()

	type best struct {
		resp ExchangeResponse
		rank int
	}
	bestMap := make(map[string]best)

	for res := range resultsChan {
		if res.resp.Error != "" {
			continue
		}
		existing, exists := bestMap[res.resp.Exchange]
		if !exists || res.rank < existing.rank {
			bestMap[res.resp.Exchange] = best{resp: res.resp, rank: res.rank}
		}
	}

	responses := make([]ExchangeResponse, 0, len(bestMap))
	for _, b := range bestMap {
		responses = append(responses, b.resp)
	}
	sort.Slice(responses, func(i, j int) bool {
		return responses[i].Exchange < responses[j].Exchange
	})

	fmt.Printf("\n📊 Summary: %d/%d exchanges returned data (%.1fs)\n", len(responses), len(exchangeConfigs), time.Since(start).Seconds())
	for _, r := range responses {
		fmt.Printf("   %s → %s (mid=%.2f)\n", r.Exchange, r.Pair, r.Spread.Mid)
	}

	return APIResponse{
		Symbol:    base,
		Timestamp: start.UnixMilli(),
		Results:   responses,
	}
}

func fetchOne(cfg ExchangeConfig, base, quote string) ExchangeResponse {
	pair := base + "-" + quote
	formattedSymbol := formatSymbol(pair, cfg.SymbolFormat, cfg.QuoteMap)

	var url string
	if strings.Contains(cfg.URLTemplate, "%s") {
		url = fmt.Sprintf(cfg.URLTemplate, formattedSymbol)
	} else {
		url = cfg.URLTemplate
	}

	client := http.Client{Timeout: 6 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		return ExchangeResponse{Exchange: cfg.Name, Pair: pair, Error: err.Error()}
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return ExchangeResponse{Exchange: cfg.Name, Pair: pair, Error: fmt.Sprintf("HTTP %d", resp.StatusCode)}
	}

	var raw interface{}
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return ExchangeResponse{Exchange: cfg.Name, Pair: pair, Error: "JSON decode error"}
	}

	if cfg.Name == "Bitfinex" {
		return parseBitfinex(raw, pair)
	}

	bidsRaw := traverseMap(raw, cfg.PathBids)
	asksRaw := traverseMap(raw, cfg.PathAsks)

	if bidsRaw == nil || asksRaw == nil {
		return ExchangeResponse{Exchange: cfg.Name, Pair: pair, Error: "path not found"}
	}

	if cfg.FlatArray {
		bidsRaw = unflattenPairs(bidsRaw)
		asksRaw = unflattenPairs(asksRaw)
	}

	bids := normalizePoints(bidsRaw)
	asks := normalizePoints(asksRaw)

	if len(bids) == 0 || len(asks) == 0 {
		return ExchangeResponse{Exchange: cfg.Name, Pair: pair, Error: "no liquidity"}
	}

	sort.Slice(bids, func(i, j int) bool { return bids[i].Price > bids[j].Price })
	sort.Slice(asks, func(i, j int) bool { return asks[i].Price < asks[j].Price })

	var data []OrderPoint
	cumBid := 0.0
	for _, p := range bids {
		cumBid += p.Qty
		cp := cumBid
		data = append(data, OrderPoint{Price: p.Price, Qty: p.Qty, BidCum: &cp})
	}
	cumAsk := 0.0
	for _, p := range asks {
		cumAsk += p.Qty
		cp := cumAsk
		data = append(data, OrderPoint{Price: p.Price, Qty: p.Qty, AskCum: &cp})
	}

	bestBid := bids[0].Price
	bestAsk := asks[0].Price

	return ExchangeResponse{
		Exchange: cfg.Name,
		Pair:     pair,
		Data:     data,
		Levels:   LevelCount{Bids: len(bids), Asks: len(asks)},
		Spread: SpreadData{
			BestBid: bestBid,
			BestAsk: bestAsk,
			Spread:  bestAsk - bestBid,
			Mid:     (bestAsk + bestBid) / 2,
		},
	}
}

// --- Symbol Formatting ---

func formatSymbol(pair string, format SymbolFormat, quoteMap map[string]string) string {
	parts := strings.Split(strings.ToUpper(pair), "-")
	if len(parts) != 2 {
		return pair
	}
	base, quote := parts[0], parts[1]

	if quoteMap != nil {
		if mapped, ok := quoteMap[quote]; ok {
			quote = mapped
		}
	}

	if format == FormatKraken && base == "BTC" {
		base = "XBT"
	}

	switch format {
	case FormatNoSep:
		return base + quote
	case FormatDash:
		return base + "-" + quote
	case FormatUnderscore:
		return base + "_" + quote
	case FormatLower:
		return strings.ToLower(base + quote)
	case FormatLowerDash:
		return strings.ToLower(base + "-" + quote)
	case FormatLowerUnderscore:
		return strings.ToLower(base + "_" + quote)
	case FormatSlash:
		return base + "/" + quote
	case FormatKraken:
		return base + quote
	case FormatBitfinex:
		return "t" + base + quote
	}
	return base + quote
}

// --- Bitfinex parser ---

func parseBitfinex(raw interface{}, pair string) ExchangeResponse {
	list, ok := raw.([]interface{})
	if !ok {
		return ExchangeResponse{Exchange: "Bitfinex", Pair: pair, Error: "unexpected format"}
	}

	var bids, asks []OrderPoint
	for _, item := range list {
		arr, ok := item.([]interface{})
		if !ok || len(arr) < 3 {
			continue
		}
		price := toFloat(arr[0])
		amount := toFloat(arr[2])
		if price <= 0 {
			continue
		}
		if amount > 0 {
			bids = append(bids, OrderPoint{Price: price, Qty: amount})
		} else if amount < 0 {
			asks = append(asks, OrderPoint{Price: price, Qty: -amount})
		}
	}

	if len(bids) == 0 || len(asks) == 0 {
		return ExchangeResponse{Exchange: "Bitfinex", Pair: pair, Error: "no liquidity"}
	}

	sort.Slice(bids, func(i, j int) bool { return bids[i].Price > bids[j].Price })
	sort.Slice(asks, func(i, j int) bool { return asks[i].Price < asks[j].Price })

	var data []OrderPoint
	cumBid := 0.0
	for _, p := range bids {
		cumBid += p.Qty
		cp := cumBid
		data = append(data, OrderPoint{Price: p.Price, Qty: p.Qty, BidCum: &cp})
	}
	cumAsk := 0.0
	for _, p := range asks {
		cumAsk += p.Qty
		cp := cumAsk
		data = append(data, OrderPoint{Price: p.Price, Qty: p.Qty, AskCum: &cp})
	}

	return ExchangeResponse{
		Exchange: "Bitfinex",
		Pair:     pair,
		Data:     data,
		Levels:   LevelCount{Bids: len(bids), Asks: len(asks)},
		Spread: SpreadData{
			BestBid: bids[0].Price,
			BestAsk: asks[0].Price,
			Spread:  asks[0].Price - bids[0].Price,
			Mid:     (asks[0].Price + bids[0].Price) / 2,
		},
	}
}

// --- Helpers ---

func unflattenPairs(raw interface{}) interface{} {
	list, ok := raw.([]interface{})
	if !ok || len(list) < 2 {
		return raw
	}
	if _, isStr := list[0].(string); !isStr {
		return raw
	}
	var pairs []interface{}
	for i := 0; i+1 < len(list); i += 2 {
		pairs = append(pairs, []interface{}{list[i], list[i+1]})
	}
	return pairs
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
