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

type SymbolFormat int

const (
	FormatNoSep
	SymbolFormat = iota
	FormatDash
	FormatUnderscore
	FormatLower
	FormatLowerDash
	FormatLowerUnderscore
	FormatSlash
	FormatKraken
	FormatBitfinex
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
	{Name: "Binance", URLTemplate: "https://data-api.binance.vision/api/v3/depth?symbol=%s&limit=10", PathBids: "bids", PathAsks: "asks", SymbolFormat: FormatNoSep},
	{Name: "Coinbase", URLTemplate: "https://api.exchange.coinbase.com/products/%s/book?level=2", PathBids: "bids", PathAsks: "asks", SymbolFormat: FormatDash},
	{Name: "Kraken", URLTemplate: "https://api.kraken.com/0/public/Depth?pair=%s&count=10", PathBids: "result.*.bids", PathAsks: "result.*.asks", SymbolFormat: FormatKraken},
	{Name: "OKX", URLTemplate: "https://www.okx.com/api/v5/market/books?instId=%s&sz=10", PathBids: "data.0.bids", PathAsks: "data.0.asks", SymbolFormat: FormatDash},
	{Name: "KuCoin", URLTemplate: "https://api.kucoin.com/api/v1/market/orderbook/level2_100?symbol=%s", PathBids: "data.bids", PathAsks: "data.asks", SymbolFormat: FormatDash},
	{Name: "Bitfinex", URLTemplate: "https://api-pub.bitfinex.com/v2/book/%s/P0?len=25", PathBids: "_bitfinex", PathAsks: "_bitfinex", SymbolFormat: FormatBitfinex, QuoteMap: map[string]string{"USDT": "UST"}},
	{Name: "Gemini", URLTemplate: "https://api.gemini.com/v1/book/%s?limit_bids=10&limit_asks=10", PathBids: "bids", PathAsks: "asks", SymbolFormat: FormatLower, QuoteMap: map[string]string{"USDT": "USD"}},
	{Name: "Gate.io", URLTemplate: "https://api.gateio.ws/api/v4/spot/order_book?currency_pair=%s&limit=10", PathBids: "bids", PathAsks: "asks", SymbolFormat: FormatUnderscore},
	{Name: "HTX", URLTemplate: "https://api.huobi.pro/market/depth?symbol=%s&type=step0", PathBids: "tick.bids", PathAsks: "tick.asks", SymbolFormat: FormatLower},
	{Name: "Crypto.com", URLTemplate: "https://api.crypto.com/exchange/v1/public/get-book?instrument_name=%s&depth=10", PathBids: "result.data.0.bids", PathAsks: "result.data.0.asks", SymbolFormat: FormatUnderscore},
	{Name: "Bitstamp", URLTemplate: "https://www.bitstamp.net/api/v2/order_book/%s/", PathBids: "bids", PathAsks: "asks", SymbolFormat: FormatLower},
	{Name: "MEXC", URLTemplate: "https://api.mexc.com/api/v3/depth?symbol=%s&limit=10", PathBids: "bids", PathAsks: "asks", SymbolFormat: FormatNoSep},
	{Name: "Bitget", URLTemplate: "https://api.bitget.com/api/v2/spot/market/orderbook?symbol=%s&limit=10", PathBids: "data.bids", PathAsks: "data.asks", SymbolFormat: FormatNoSep},
	{Name: "BingX", URLTemplate: "https://open-api.bingx.com/openApi/spot/v1/market/depth?symbol=%s&limit=10", PathBids: "data.bids", PathAsks: "data.asks", SymbolFormat: FormatDash},
	{Name: "BitMart", URLTemplate: "https://api-cloud.bitmart.com/spot/quotation/v3/books?symbol=%s&limit=10", PathBids: "data.bids", PathAsks: "data.asks", SymbolFormat: FormatUnderscore},
	{Name: "Phemex", URLTemplate: "https://api.phemex.com/md/spot/orderbook?symbol=s%s", PathBids: "result.book.bids", PathAsks: "result.book.asks", SymbolFormat: FormatNoSep},
	{Name: "AscendEX", URLTemplate: "https://ascendex.com/api/pro/v1/depth?symbol=%s", PathBids: "data.data.bids", PathAsks: "data.data.asks", SymbolFormat: FormatSlash},
	{Name: "Poloniex", URLTemplate: "https://api.poloniex.com/markets/%s/orderBook?limit=10", PathBids: "bids", PathAsks: "asks", SymbolFormat: FormatUnderscore, FlatArray: true},
	{Name: "LBank", URLTemplate: "https://api.lbkex.com/v2/depth.do?symbol=%s&size=60", PathBids: "data.bids", PathAsks: "data.asks", SymbolFormat: FormatLowerUnderscore},
	{Name: "Bitrue", URLTemplate: "https://openapi.bitrue.com/api/v1/depth?symbol=%s&limit=10", PathBids: "bids", PathAsks: "asks", SymbolFormat: FormatNoSep},
	{Name: "WhiteBIT", URLTemplate: "https://whitebit.com/api/v4/public/orderbook/%s?limit=10", PathBids: "bids", PathAsks: "asks", SymbolFormat: FormatUnderscore},
	{Name: "DigiFinex", URLTemplate: "https://openapi.digifinex.com/v3/order_book?symbol=%s&limit=10", PathBids: "bids", PathAsks: "asks", SymbolFormat: FormatLowerUnderscore},
	{Name: "CoinW", URLTemplate: "https://api.coinw.com/api/v1/public?command=returnOrderBook&currencyPair=%s", PathBids: "data.bids", PathAsks: "data.asks", SymbolFormat: FormatUnderscore},
	{Name: "BigONE", URLTemplate: "https://big.one/api/v3/asset_pairs/%s/depth?limit=10", PathBids: "data.bids", PathAsks: "data.asks", SymbolFormat: FormatDash},
	{Name: "Pionex", URLTemplate: "https://api.pionex.com/api/v1/market/depth?symbol=%s&limit=10", PathBids: "data.bids", PathAsks: "data.asks", SymbolFormat: FormatUnderscore},
	{Name: "XT", URLTemplate: "https://sapi.xt.com/v4/public/depth?symbol=%s&limit=10", PathBids: "result.bids", PathAsks: "result.asks", SymbolFormat: FormatLowerUnderscore},
	{Name: "Toobit", URLTemplate: "https://api.toobit.com/quote/v1/depth?symbol=%s&limit=10", PathBids: "b", PathAsks: "a", SymbolFormat: FormatNoSep},
}

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
	symbolFlag := flag.String("symbol", "BTC", "Base asset symbol")
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

func runServer(port string) {
	rl := NewRateLimiter(10, 30)

	// --- Page routes ---
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/" {
			http.Redirect(w, r, "/login", http.StatusFound)
			return
		}
		http.NotFound(w, r)
	})
	http.HandleFunc("/login", serveFile("./static/login.html"))
	http.HandleFunc("/dashboard", serveFile("./static/dashboard.html"))

	// --- Public API ---
	http.HandleFunc("/api/v1/health", RateLimitMiddleware(rl, handleHealth))
	http.HandleFunc("/api/v1/login", RateLimitMiddleware(rl, handleLogin))

	// --- Protected API ---
	http.HandleFunc("/api/v1/book", ProtectedRoute(rl, handleDepth))
	http.HandleFunc("/api/v1/price", ProtectedRoute(rl, handlePrice))
	http.HandleFunc("/api/v1/dominance", ProtectedRoute(rl, handleDominance))

	fmt.Printf("🚀 Server running on port %s\n", port)
	fmt.Printf("   GET /login     → Login page\n")
	fmt.Printf("   GET /dashboard → Dashboard (requires JWT)\n")
	fmt.Printf("   POST /api/v1/login → Get token\n")
	log.Fatal(http.ListenAndServe("0.0.0.0:"+port, nil))
}

func serveFile(path string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, path)
	}
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func handleLogin(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	user, pass := "", ""
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
	proxyGet(w, fmt.Sprintf("https://api.coingecko.com/api/v3/coins/%s/market_chart?vs_currency=usd&days=%s", symbol, days))
}

func handleDominance(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Content-Type", "application/json")
	proxyGet(w, "https://api.coingecko.com/api/v3/global")
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
	json.NewEncoder(w).Encode(fetchAll(base))
}

func runSnapshot(dir, file, base string) {
	if err := os.MkdirAll(dir, 0755); err != nil {
		log.Fatalf("Failed to create output dir %q: %v", dir, err)
	}
	base = strings.ToUpper(strings.TrimSpace(base))
	if i := strings.IndexAny(base, "-_/"); i > 0 {
		base = base[:i]
	}
	payload := fetchAll(base)
	outPath := filepath.Join(dir, file)
	f, err := os.Create(outPath)
	if err != nil {
		log.Fatalf("Failed to create %q: %v", outPath, err)
	}
	defer f.Close()
	enc := json.NewEncoder(f)
	enc.SetIndent("", "  ")
	enc.Encode(payload)
	ok := 0
	for _, r := range payload.Results {
		if r.Error == "" {
			ok++
		}
	}
	fmt.Printf("Wrote %s (%d exchanges)\n", outPath, ok)
}

func fetchAll(base string) APIResponse {
	start := time.Now()
	type result struct {
		resp  ExchangeResponse
		quote string
		rank  int
	}
	var wg sync.WaitGroup
	ch := make(chan result, len(exchangeConfigs)*len(defaultQuotes))
	for _, cfg := range exchangeConfigs {
		quotes := defaultQuotes
		if len(cfg.Quotes) > 0 {
			quotes = cfg.Quotes
		}
		for rank, quote := range quotes {
			wg.Add(1)
			go func(c ExchangeConfig, q string, r int) {
				defer wg.Done()
				ch <- result{resp: fetchOne(c, base, q), quote: q, rank: r}
			}(cfg, quote, rank)
		}
	}
	go func() { wg.Wait(); close(ch) }()

	type best struct {
		resp ExchangeResponse
		rank int
	}
	bm := make(map[string]best)
	for res := range ch {
		if res.resp.Error != "" {
			continue
		}
		if ex, ok := bm[res.resp.Exchange]; !ok || res.rank < ex.rank {
			bm[res.resp.Exchange] = best{resp: res.resp, rank: res.rank}
		}
	}
	responses := make([]ExchangeResponse, 0, len(bm))
	for _, b := range bm {
		responses = append(responses, b.resp)
	}
	sort.Slice(responses, func(i, j int) bool { return responses[i].Exchange < responses[j].Exchange })
	return APIResponse{Symbol: base, Timestamp: start.UnixMilli(), Results: responses}
}

func fetchOne(cfg ExchangeConfig, base, quote string) ExchangeResponse {
	pair := base + "-" + quote
	sym := formatSymbol(pair, cfg.SymbolFormat, cfg.QuoteMap)
	var url string
	if strings.Contains(cfg.URLTemplate, "%s") {
		url = fmt.Sprintf(cfg.URLTemplate, sym)
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
	return ExchangeResponse{
		Exchange: cfg.Name, Pair: pair, Data: data,
		Levels: LevelCount{Bids: len(bids), Asks: len(asks)},
		Spread: SpreadData{BestBid: bids[0].Price, BestAsk: asks[0].Price, Spread: asks[0].Price - bids[0].Price, Mid: (asks[0].Price + bids[0].Price) / 2},
	}
}

func formatSymbol(pair string, format SymbolFormat, quoteMap map[string]string) string {
	parts := strings.Split(strings.ToUpper(pair), "-")
	if len(parts) != 2 {
		return pair
	}
	base, quote := parts[0], parts[1]
	if quoteMap != nil {
		if m, ok := quoteMap[quote]; ok {
			quote = m
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
		} else {
			asks = append(asks, OrderPoint{Price: price, Qty: -amount})
		}
	}
	if len(bids) == 0 || len(asks) == 0 {
		return ExchangeResponse{Exchange: "Bitfinex", Pair: pair, Error: "no liquidity"}
	}
	sort.Slice(bids, func(i, j int) bool { return bids[i].Price > bids[j].Price })
	sort.Slice(asks, func(i, j int) bool { return asks[i].Price < asks[j].Price })
	var data []OrderPoint
	cum := 0.0
	for _, p := range bids {
		cum += p.Qty
		c := cum
		data = append(data, OrderPoint{Price: p.Price, Qty: p.Qty, BidCum: &c})
	}
	cum = 0
	for _, p := range asks {
		cum += p.Qty
		c := cum
		data = append(data, OrderPoint{Price: p.Price, Qty: p.Qty, AskCum: &c})
	}
	return ExchangeResponse{Exchange: "Bitfinex", Pair: pair, Data: data,
		Levels: LevelCount{Bids: len(bids), Asks: len(asks)},
		Spread: SpreadData{BestBid: bids[0].Price, BestAsk: asks[0].Price, Spread: asks[0].Price - bids[0].Price, Mid: (asks[0].Price + bids[0].Price) / 2},
	}
}

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
		if s, ok := current.([]interface{}); ok {
			idx, err := strconv.Atoi(key)
			if err == nil && idx >= 0 && idx < len(s) {
				current = s[idx]
				continue
			}
			return nil
		}
		if m, ok := current.(map[string]interface{}); ok {
			if key == "*" {
				for _, v := range m {
					current = v
					break
				}
			} else if val, exists := m[key]; exists {
				current = val
			} else {
				return nil
			}
		} else {
			return nil
		}
	}
	return current
}

func normalizePoints(raw interface{}) []OrderPoint {
	list, ok := raw.([]interface{})
	if !ok {
		return nil
	}
	var pts []OrderPoint
	for _, item := range list {
		var p, q float64
		if arr, ok := item.([]interface{}); ok && len(arr) >= 2 {
			p, q = toFloat(arr[0]), toFloat(arr[1])
		}
		if obj, ok := item.(map[string]interface{}); ok {
			p = getFloatFromMap(obj, "price", "p", "px", "bid", "ask", "bid_price", "ask_price", "rate", "limit_price")
			q = getFloatFromMap(obj, "amount", "size", "quantity", "q", "vol", "volume", "bid_size", "ask_size")
		}
		if p > 0 && q > 0 {
			pts = append(pts, OrderPoint{Price: p, Qty: q})
		}
	}
	return pts
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