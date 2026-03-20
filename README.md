# Crypto-Order-Book

Lightweight, scalable cryptocurrency dashboard with Coinglass-inspired dark theme. Aggregates order book data from 25+ exchanges in real-time. Protected with JWT auth and per-IP rate limiting.

## Overview Tab

- **Price Chart** — Historical price via CoinGecko (1D/7D/1M/3M/1Y)
- **Order Book Depth** — Aggregated bids/asks from 25+ exchanges
- **Market Dominance** — Individual crypto market cap share

## Quick Start

```bash
# Run locally (default login: demo/demo)
go build -o aggregator .
./aggregator
# → http://localhost:8080

# Docker
docker build -t crypto-dashboard .
docker run -p 8080:8080 -e API_USER=admin -e API_PASS=secret -e JWT_SECRET=$(openssl rand -base64 48) crypto-dashboard

# Docker Compose
docker-compose up -d

# Kubernetes
./deploy.sh k8s
```

## Authentication

All `/api/v1/{book,price,dominance}` endpoints require a Bearer JWT token. The login flow:

```bash
# 1. Get a token
curl -X POST http://localhost:8080/api/v1/login \
  -H "Content-Type: application/json" \
  -d '{"user":"demo","pass":"demo"}'
# → {"token":"eyJhbG...","expires_in":"86400","type":"Bearer"}

# 2. Use the token
curl -H "Authorization: Bearer eyJhbG..." \
  http://localhost:8080/api/v1/book?symbol=BTC
```

The frontend handles this automatically with a login screen.

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8080` | Server listen port |
| `JWT_SECRET` | dev fallback | HMAC signing key — **set in production** |
| `API_USER` | `demo` | Login username |
| `API_PASS` | `demo` | Login password |

## Rate Limiting

In-memory token-bucket per client IP. No external dependencies.

- **Sustained rate:** 10 requests/second per IP
- **Burst:** 30 requests
- Respects `X-Forwarded-For` and `X-Real-Ip` headers (for reverse proxies)
- Stale buckets cleaned every 60 seconds

Returns `429 Too Many Requests` with `Retry-After: 1` header when exceeded.

## API Endpoints

| Endpoint | Auth | Description |
|---|---|---|
| `GET /` | No | Dashboard UI |
| `GET /api/v1/health` | No | Health check |
| `POST /api/v1/login` | No | Get JWT token |
| `GET /api/v1/book?symbol=BTC` | Bearer | Aggregated order book |
| `GET /api/v1/price?symbol=bitcoin&days=7` | Bearer | Price history |
| `GET /api/v1/dominance` | Bearer | Market cap dominance |

## GitHub Actions

- **CI** (`.github/workflows/ci.yaml`) — Builds, tests auth rejection, login, all protected endpoints, validates Docker + K8s, exits.
- **Serve** (`.github/workflows/serve.yaml`) — Live server with Cloudflare tunnel (manual trigger).

## Project Structure

```
.
├── main.go              # HTTP server, handlers, exchange fetching
├── jwt.go               # JWT token generation & validation
├── middleware.go         # Auth middleware + rate limiter
├── static/index.html    # Frontend dashboard with login
├── Dockerfile           # Multi-stage build (~15MB image)
├── docker-compose.yml
├── deploy.sh            # One-command deploy (docker/k8s/bare)
├── namespace.yaml       # K8s namespace
├── secret.yaml          # K8s secret template (edit before deploy!)
├── deployment.yaml      # K8s deployment (refs secret)
├── service.yaml         # K8s service
├── hpa.yaml             # Horizontal pod autoscaler
├── ingress.yaml         # Ingress template
├── serve.yaml           # GH Actions live server workflow
└── .github/workflows/
    ├── ci.yaml           # CI tests
    └── serve.yaml        # Live tunnel
```

## Deploy to Linux Server

```bash
git clone https://github.com/0xReyes/Crypto-Order-Book.git
cd Crypto-Order-Book
chmod +x deploy.sh

# Set production credentials
export JWT_SECRET=$(openssl rand -base64 48)
export API_USER=admin
export API_PASS=your-strong-password

./deploy.sh docker   # Docker
./deploy.sh k8s      # Kubernetes (edit secret.yaml first)
./deploy.sh bare     # Bare Go binary
```

## Resource Usage

~10MB RAM idle. Docker capped at 128MB. K8s HPA scales 2→10 pods.
